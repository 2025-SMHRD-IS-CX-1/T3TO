# 네이버클라우드 서버 배포 가이드

이 문서는 T3TO 프로젝트(Next.js + mk_resume_model API)를 **네이버클라우드 서버(VM)** 에서 실행할 때 참고하는 절차입니다.

---

## 1. 서버 구성 요약

| 구성요소 | 포트 | 설명 |
|---------|------|------|
| **Next.js 앱** | 3000 | 메인 웹 앱 (대시보드, 상담, 자기소개서, 로드맵 등) |
| **mk_resume_model API** | 8000 | 파인튜닝 자기소개서 생성 API (선택) |

- DB·인증: **Supabase** (클라우드 사용, 서버에 설치 없음)
- OpenAI·Tavily·Q-Net: `.env` 에서 설정한 API 키로 Next 앱이 직접 호출

---

## 2. 서버 준비 (네이버클라우드 VM)

1. **서버 생성**  
   네이버클라우드 콘솔에서 **Server** > **Server** 생성 (Ubuntu 22.04 LTS 권장).

2. **방화벽(ACG)**  
   - 인바운드: `22(TCP)` SSH, `80(TCP)` HTTP, `443(TCP)` HTTPS  
   - Next/API는 외부에 직접 열지 않고, Nginx 뒤에서만 사용할 경우 80/443만 열면 됨.

3. **SSH 접속**  
   ```bash
   ssh -i your-key.pem ubuntu@<서버 공인 IP>
   ```

4. **필수 설치**  
   ```bash
   # Node.js 20 LTS (Next.js 16 권장)
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Python 3.10+ (mk_resume_model용)
   sudo apt-get update
   sudo apt-get install -y python3 python3-pip python3-venv

   # (선택) Nginx, PM2
   sudo apt-get install -y nginx
   sudo npm install -g pm2
   ```

---

## 3. 프로젝트 배포

### 3.1 저장소 클론 및 의존성 설치

```bash
cd /home/ubuntu  # 또는 원하는 경로
git clone https://github.com/2025-SMHRD-IS-CX-1/T3TO.git
cd T3TO
```

### 3.2 환경 변수 설정 (Next.js)

**서버용** 이므로 `.env.local` 대신 `.env.production` 또는 배포 시 사용할 env 파일을 둡니다.

```bash
nano .env.production
```

아래 내용을 **실제 값**으로 채워 넣습니다.

```env
# Supabase (필수)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# OpenAI (로드맵·상담 분석·자소서 다듬기)
OPENAI_API_KEY=sk-proj-...
OPENAI_ROADMAP_MODEL=gpt-4o-mini

# 자기소개서 파인튜닝 API (같은 서버에서 8000번으로 띄울 경우)
MK_RESUME_MODEL_API_URL=http://127.0.0.1:8000

# Tavily, Q-Net (선택)
TAVILY_API_KEY=tvly-...
QNET_SERVICE_KEY=...
```

- **같은 서버**에서 mk_resume_model을 8000번으로 띄우면 `MK_RESUME_MODEL_API_URL=http://127.0.0.1:8000` 그대로 사용하면 됩니다.
- 다른 서버에 API를 두면 `http://<API서버IP>:8000` 처럼 해당 주소로 설정합니다.

### 3.3 Next.js 빌드 및 실행

```bash
npm ci
npm run build
npm run start
```

- 기본 포트 **3000**에서 동작합니다.  
- **PM2로 상시 실행**하려면 아래 4.2절 참고.

---

## 4. mk_resume_model API (자기소개서 파인튜닝 모델)

### 4.1 설치 및 실행

```bash
cd /home/ubuntu/T3TO/mk_resume_model
python3 -m venv .venv
source .venv/bin/activate   # Windows가 아니라 Linux 기준
pip install -r requirements.txt
# (필요 시) 체크포인트 경로 확인 후
uvicorn api:app --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0`: 같은 서버의 Next 앱(127.0.0.1)에서 호출할 수 있도록 합니다.
- 외부에서 8000 포트를 직접 열지 않아도 되고, Next만 127.0.0.1:8000으로 호출하면 됩니다.

### 4.2 PM2로 API 상시 실행 (선택)

```bash
# 프로젝트 루트에서
cd /home/ubuntu/T3TO
pm2 start "cd mk_resume_model && .venv/bin/uvicorn api:app --host 127.0.0.1 --port 8000" --name resume-api
pm2 save
pm2 startup
```

---

## 5. Next.js 상시 실행 (PM2)

```bash
cd /home/ubuntu/T3TO
pm2 start npm --name "t3to-web" -- start
pm2 save
pm2 startup
```

- `npm run build`는 이미 한 상태에서 `pm2 start npm -- start`로 `next start`를 돌립니다.
- 재부팅 후에도 올라오게 하려면 `pm2 startup` 출력 안내대로 한 번 설정합니다.

---

## 6. Nginx 리버스 프록시 (권장)

80/443으로 들어온 요청을 Next(3000)로 넘기고, HTTPS를 Nginx에서 처리하려면 예시는 아래와 같습니다.

```bash
sudo nano /etc/nginx/sites-available/t3to
```

```nginx
server {
    listen 80;
    server_name your-domain.com;   # 또는 서버 공인 IP

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/t3to /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

- HTTPS 적용 시: Let's Encrypt + `certbot` 사용 후 `listen 443 ssl` 등 추가하면 됩니다.
- mk_resume_model은 Next 앱이 내부적으로 `http://127.0.0.1:8000`으로 부르므로 Nginx에 8000 포트를 노출할 필요 없습니다.

---

## 7. 배포 후 확인

| 확인 항목 | 방법 |
|----------|------|
| Next 앱 | 브라우저에서 `http://<서버IP>` 또는 `http://your-domain.com` 접속 |
| mk_resume_model | 서버에서 `curl -X POST http://127.0.0.1:8000/api/self-intro/generate -H "Content-Type: application/json" -d '{}'` (실제로는 Next에서만 호출) |
| 로그 | `pm2 logs` 또는 `pm2 logs t3to-web` / `pm2 logs resume-api` |

---

## 8. 요약 체크리스트

- [ ] 네이버클라우드 VM 생성, SSH·방화벽(80/443) 설정
- [ ] Node.js 20, Python 3.10+, (선택) Nginx·PM2 설치
- [ ] 저장소 클론 후 `npm ci` / `npm run build`
- [ ] `.env.production`에 Supabase·OpenAI·`MK_RESUME_MODEL_API_URL=http://127.0.0.1:8000` 등 설정
- [ ] mk_resume_model: `uvicorn api:app --host 0.0.0.0 --port 8000` 또는 PM2로 8000 포트 실행
- [ ] Next: `npm run start` 또는 PM2로 3000 포트 실행
- [ ] (선택) Nginx로 80/443 → 3000 리버스 프록시 및 HTTPS

이 순서대로 진행하면 네이버클라우드 서버에서 우리가 만든 프로젝트를 실행할 수 있습니다.
