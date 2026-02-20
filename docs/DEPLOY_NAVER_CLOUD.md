# 네이버클라우드 서버 배포 가이드

이 문서는 T3TO 프로젝트(Next.js + mk_resume_model API)를 **네이버클라우드**에서 **Web 1대 + WAS 1대 + NAT Gateway 1대** 구성으로 실행할 때 참고하는 절차입니다.  
**외부 통신은 Web 서버로만** 들어오고, Web 서버의 Apache가 WAS로 프록시합니다.  
도메인 **careerbridge.kr** 은 나중에 연결합니다.

---

## 1. 서버 구성 요약

| 구분 | 대수 | 역할 | 통신 |
|------|------|------|------|
| **Web 서버** | 1대 | Apache 리버스 프록시. 80/443 수신 → WAS(3000)로 전달 | Public Subnet, 공인 IP 보유 |
| **WAS 서버** | 1대 | Next.js(3000) + mk_resume_model API(8000) 실행 | Private Subnet, 외부 직접 접속 없음 |
| **NAT Gateway** | 1대 | Private(WAS)에서 인터넷 나갈 때 사용 (Supabase·OpenAI 등 호출) | Public Subnet에 생성, Private 라우팅 연결 |

**트래픽 흐름**

- **인터넷 → 사용자**: `careerbridge.kr` (또는 Web 서버 공인 IP) → **Web 서버(80/443)** → Apache → **WAS 서버 사설 IP:3000**
- **WAS → 외부**: WAS → **NAT Gateway** → 인터넷 (Supabase, OpenAI, npm 등)

| 서버 | 포트 | 설명 |
|------|------|------|
| Web | 80, 443 | Apache. 클라이언트 요청 수신 후 WAS로 프록시 |
| WAS | 3000 | Next.js (대시보드, 상담, 자기소개서, 로드맵 등) |
| WAS | 8000 | mk_resume_model API (Next가 내부에서만 호출, 외부 노출 안 함) |

- DB·인증: **Supabase** (클라우드). WAS가 NAT 통해 접속
- 도메인: **careerbridge.kr** — 나중에 DNS·SSL 연결 (7장 참고)

---

## 2. VPC부터 만들기

**Web(Public) + WAS(Private) + NAT Gateway** 를 쓰려면 VPC 안에 **Public Subnet**과 **Private Subnet**을 각각 만들고, NAT Gateway는 Public Subnet에 둡니다.

### 2.1 VPC 생성

1. 네이버클라우드 **콘솔** 로그인 후 **Platform** > **Networking** > **VPC** 이동.
2. **VPC Management** > **VPC 생성** 클릭.
3. 입력 후 생성:
   - **VPC 이름**: 예) `t3to-vpc`
   - **IP 주소 범위(CIDR)**: 예) `10.0.0.0/16` 또는 C클래스 `192.168.0.0/24`
4. 상태가 **운영중** 이 되면 완료.

### 2.2 Public Subnet 생성 (Web 서버 + NAT Gateway)

1. **Subnet Management** > **Subnet 생성** 클릭.
2. 입력:
   - **Subnet 이름**: 예) `t3to-public`
   - **VPC**: 위에서 만든 VPC 선택.
   - **IP 주소 범위**: 예) `10.0.1.0/24` (VPC가 /16이면 10.0.x.x 중 일부).
   - **가용 Zone**: 동일 Zone으로 통일 (예: FKR-1).
   - **Internet Gateway 전용**: **Y** → Public Subnet.
3. **생성** 클릭.

### 2.3 Private Subnet 생성 (WAS 서버)

1. 다시 **Subnet 생성** 클릭.
2. 입력:
   - **Subnet 이름**: 예) `t3to-private`
   - **VPC**: 동일 VPC 선택.
   - **IP 주소 범위**: 예) `10.0.2.0/24` (Public과 겹치지 않게).
   - **가용 Zone**: Public과 같은 Zone 권장.
   - **Internet Gateway 전용**: **N** → Private Subnet.
3. **생성** 클릭.

### 2.4 NAT Gateway 생성 (Private → 인터넷 나가기)

1. **NAT Gateway** 메뉴에서 **NAT Gateway 생성** 클릭.
2. 입력:
   - **이름**: 예) `t3to-nat`
   - **VPC**: 동일 VPC 선택.
   - **Subnet**: **Public Subnet**(`t3to-public`) 선택. (NAT는 Public에 둠)
   - **가용 Zone**: Public Subnet과 동일.
3. 생성 후 **Private Subnet의 Route Table** 에서 기본 라우팅(0.0.0.0/0)을 이 NAT Gateway로 보내도록 설정합니다.  
   - **Route Table** > 해당 VPC의 Private용 라우트 테이블 선택 > **라우트 추가**  
   - Destination: `0.0.0.0/0`, Target: 방금 만든 **NAT Gateway**

이렇게 해 두면 WAS(Private)에서 외부(Supabase, OpenAI 등)로 나갈 때만 NAT를 타고, 들어오는 통신은 Web만 받습니다.

### 2.5 정리

- **VPC** 1개 + **Public Subnet** 1개(Web·NAT) + **Private Subnet** 1개(WAS) + **NAT Gateway** 1개(Public에 두고 Private 라우팅 연결).

---

## 3. 서버 준비 (Web 1대, WAS 1대)

### 3.0 테스트용 서버 스펙 (참고)

상업용이 아니라 **테스트/데모** 수준이라면 아래 정도면 충분합니다.

| 서버 | vCPU | 메모리 | 디스크 | 비고 |
|------|------|--------|--------|------|
| **Web** | 1 | 1~2GB | 20~30GB | Apache만 돌리므로 최소 스펙으로 가능 |
| **WAS** | 2 | 4GB | 30~50GB | Next.js + mk_resume_model 동시 실행 |

- **WAS 4GB**: 파인튜닝 LM(예: KoGPT2)을 **쓸 때** 권장. 체크포인트 없이 템플릿 생성만 쓰면 2GB도 가능하지만, 나중에 LM 올려도 되도록 4GB가 안전함.
- **LM을 절대 안 쓸 경우**: WAS 2 vCPU / 2GB 로 줄여도 됨.
- 디스크: OS + Node·Python·프로젝트·로그 기준. 50GB면 여유 있음.

네이버클라우드에서 **Micro/Small** 급 제품으로 골라 위 스펙에 맞는 인스턴스 타입을 선택하면 됩니다.

---

### 3.1 Web 서버 생성 (Public Subnet)

1. **Server** > **Server** > **서버 생성** 클릭.
2. **VPC** / **Subnet**: 위에서 만든 **Public Subnet**(`t3to-public`) 선택.  
   → 공인 IP 자동 할당됨.
3. OS: **Ubuntu 22.04 LTS** 권장.
4. **ACG(방화벽)**  
   - 새 ACG 만들거나 기존 것 선택 후:
   - **인바운드**: `22(TCP)` SSH, `80(TCP)` HTTP, `443(TCP)` HTTPS  
   - 아웃바운드: WAS 사설 IP 대역(예: 10.0.2.0/24)으로 3000 허용 + 기본 인터넷(0.0.0.0/0) 허용.
5. 생성 후 **Web 서버 공인 IP** 와 **사설 IP** 를 메모해 둡니다.

### 3.2 WAS 서버 생성 (Private Subnet)

1. **Server** > **서버 생성** 한 대 더 생성.
2. **VPC** / **Subnet**: **Private Subnet**(`t3to-private`) 선택.  
   → 공인 IP 없음. 사설 IP만 있음.
3. OS: **Ubuntu 22.04 LTS** 권장.
4. **ACG**  
   - **인바운드**: `22(TCP)` SSH(접속용, Web 서버 IP 또는 관리용 IP만 허용 권장), `3000(TCP)` Web 서버(Public Subnet 대역, 예: 10.0.1.0/24)에서만 허용.  
   - 8000은 Web에서 호출하지 않으므로 WAS 내부(127.0.0.1)만 쓰면 되고, 별도 ACG 규칙 불필요.
   - **아웃바운드**: 0.0.0.0/0 허용(나가는 통신은 NAT Gateway 통해 처리).
5. 생성 후 **WAS 사설 IP**(예: 10.0.2.x)를 메모해 둡니다. Apache 프록시 설정에 사용합니다.

### 3.3 SSH 접속

- **Web 서버**: 공인 IP로 접속  
  ```bash
  ssh -i your-key.pem ubuntu@<Web서버 공인 IP>
  ```
- **WAS 서버**:  
  - Web 서버에 SSH 접속한 뒤, 그곳에서 WAS 사설 IP로 한 번 더 SSH(점프 호스트),  
  - 또는 네이버클라우드에서 제공하는 **Bastion/터널** 이 있으면 그 방식 사용.  
  예 (Web에서 WAS로):  
  ```bash
  ssh -i your-key.pem ubuntu@<WAS 사설 IP>
  ```
  (Web 서버에 키 복사해 두거나, 동일 키로 WAS도 접속 가능하도록 설정)

### 3.4 Web 서버 필수 설치 (Apache만)

Web 서버에는 **Apache**만 설치합니다. (프록시만 담당)

```bash
sudo apt-get update
sudo apt-get install -y apache2
sudo a2enmod proxy proxy_http headers
```

### 3.5 WAS 서버 필수 설치 (Node, Python, PM2)

WAS 서버에만 Next.js·mk_resume_model·PM2를 설치합니다.

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Python 3.10+ (mk_resume_model용)
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv

# PM2
sudo npm install -g pm2
```

---

## 4. 프로젝트 배포 (WAS 서버에서만)

저장소·빌드·환경변수·실행은 **WAS 서버**에서만 수행합니다.

### 4.1 저장소 클론 및 의존성 설치 (WAS)

WAS 서버에 **ubuntu** 사용자로 접속했다면 `/home/ubuntu`, **root**로 접속했다면 `/root`를 사용합니다. (없는 경로면 `No such file or directory`가 나옵니다.)

```bash
# ubuntu 사용자: cd /home/ubuntu
# root 사용자:   cd /root
cd ~
git clone https://github.com/2025-SMHRD-IS-CX-1/T3TO.git
cd T3TO
```

### 4.2 환경 변수 설정 (WAS, Next.js)

WAS에서 `.env.production` 사용.

```bash
nano .env.production
```

아래 내용을 **실제 값**으로 채웁니다.

```env
# Supabase (필수) — WAS가 NAT 통해 접속
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# OpenAI (로드맵·상담 분석·자소서 다듬기)
OPENAI_API_KEY=sk-proj-...
OPENAI_ROADMAP_MODEL=gpt-4o-mini

# 자기소개서 API — WAS 같은 서버 8000번
MK_RESUME_MODEL_API_URL=http://127.0.0.1:8000

# Tavily, Q-Net (선택)
TAVILY_API_KEY=tvly-...
QNET_SERVICE_KEY=...
```

- mk_resume_model은 WAS에서 8000으로 띄우므로 `MK_RESUME_MODEL_API_URL=http://127.0.0.1:8000` 그대로 사용합니다.

### 4.3 Next.js 빌드 및 실행 (WAS)

```bash
npm ci
npm run build
npm run start
```

- 포트 **3000**에서 동작. 상시 실행은 아래 6장 PM2 참고.

---

## 5. mk_resume_model API (WAS 서버에서만)

WAS 서버에서 Next가 같은 서버의 8000번을 호출하므로, **WAS에만** 설치·실행합니다.

### 5.1 설치 및 실행 (WAS)

```bash
cd ~/T3TO/mk_resume_model
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --host 127.0.0.1 --port 8000
```

- `127.0.0.1`: WAS 내부(Next)에서만 호출. Web·외부에는 8000 노출하지 않습니다.

### 5.2 PM2로 API 상시 실행 (WAS)

```bash
cd ~/T3TO
pm2 start "cd mk_resume_model && .venv/bin/uvicorn api:app --host 127.0.0.1 --port 8000" --name resume-api
pm2 save
pm2 startup
```

---

## 6. Next.js 상시 실행 (WAS, PM2)

```bash
cd ~/T3TO
pm2 start npm --name "t3to-web" -- start
pm2 save
pm2 startup
```

- WAS에서 `next start`(3000) 상시 실행. 재부팅 후에도 올라오게 하려면 `pm2 startup` 안내대로 설정합니다.

---

## 7. Web 서버 Apache 리버스 프록시 + careerbridge.kr

**Web 서버**에서만 Apache를 설정합니다. 80/443으로 들어온 요청을 **WAS 사설 IP:3000** 으로 프록시합니다.

### 7.1 Apache 사이트 설정 (Web 서버)

```bash
sudo nano /etc/apache2/sites-available/t3to.conf
```

아래에서 `<WAS 사설 IP>` 를 실제 WAS Private IP(예: 10.0.2.10)로 바꿉니다.

```apache
<VirtualHost *:80>
    ServerName careerbridge.kr
    ServerAlias www.careerbridge.kr
    # 도메인 연결 전에는 서버 공인 IP로 접속하므로 아래도 추가 가능
    # ServerAlias <Web서버 공인 IP>

    ProxyPreserveHost On
    ProxyPass / http://<WAS 사설 IP>:3000/
    ProxyPassReverse / http://<WAS 사설 IP>:3000/

    # Next 등 웹소켓/업그레이드 필요 시
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://<WAS 사설 IP>:3000/$1 [P,L]
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /(.*) http://<WAS 사설 IP>:3000/$1 [P,L]
</VirtualHost>
```

모듈 활성화 후 사이트 적용:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
sudo a2ensite t3to.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

- **8000 포트**는 Web에서 노출하지 않습니다. Next가 WAS 내부에서 127.0.0.1:8000으로만 호출합니다.

### 7.2 HTTPS(SSL) — careerbridge.kr 연결 후

도메인 **careerbridge.kr** 을 Web 서버 공인 IP에 연결한 뒤:

1. **DNS**: careerbridge.kr, www.careerbridge.kr A 레코드를 **Web 서버 공인 IP**로 설정.
2. **인증서**: Web 서버에서 Let's Encrypt 사용 예:
   ```bash
   sudo apt-get install -y certbot python3-certbot-apache
   sudo certbot --apache -d careerbridge.kr -d www.careerbridge.kr
   ```
3. certbot이 자동으로 `Listen 443` 및 `SSLCertificate*` 설정을 추가합니다.  
   기존 `ProxyPass / http://<WAS>:3000/` 는 유지하고, VirtualHost만 443으로 추가되면 됩니다.

정리: **외부 통신은 Web(80/443)으로만** 들어오고, Web → WAS(3000)로만 프록시합니다.

---

## 8. 배포 후 확인

| 확인 항목 | 방법 |
|----------|------|
| Web → WAS 프록시 | 브라우저에서 `http://<Web 서버 공인 IP>` 접속 → Next 화면 나오면 성공 |
| careerbridge.kr (도메인 연결 후) | `http://careerbridge.kr` 또는 `https://careerbridge.kr` 접속 |
| mk_resume_model | WAS 서버에서 `curl -s http://127.0.0.1:8000/health` (Next가 8000 호출하는 기능 사용 시 동작 확인) |
| 로그 | WAS에서 `pm2 logs` 또는 `pm2 logs t3to-web` / `pm2 logs resume-api` |

---

## 9. 요약 체크리스트

**네트워크**

- [ ] VPC 생성 → Public Subnet(Web·NAT) + Private Subnet(WAS) 생성
- [ ] NAT Gateway 생성(Public Subnet에 두고, Private 라우트 테이블에서 0.0.0.0/0 → NAT)

**서버**

- [ ] Web 서버 1대: Public Subnet, ACG 22/80/443, Apache 설치
- [ ] WAS 서버 1대: Private Subnet, ACG 22(제한)·3000(Web 대역에서만), Node·Python·PM2 설치

**WAS 배포**

- [ ] WAS에서 저장소 클론, `npm ci` / `npm run build`, `.env.production` 설정
- [ ] mk_resume_model: PM2로 127.0.0.1:8000 실행
- [ ] Next: PM2로 3000 실행

**Web 프록시**

- [ ] Web 서버 Apache: 80/443 → WAS 사설 IP:3000 프록시 설정, `careerbridge.kr` ServerName

**도메인(나중에)**

- [ ] careerbridge.kr DNS A 레코드 → Web 서버 공인 IP
- [ ] Web 서버에서 certbot으로 HTTPS(443) 적용

이 구성을 따르면 **Web 1대·WAS 1대·NAT 1대**로, **Web으로만 통신**하고 **careerbridge.kr** 도메인을 나중에 연결할 수 있습니다.
