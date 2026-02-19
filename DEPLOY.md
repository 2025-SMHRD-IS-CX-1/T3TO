# 웹 페이지 서버 배포 가이드

Next.js + Supabase 프로젝트를 서버에 배포하는 방법입니다.

---

## 1. Vercel로 배포 (가장 간단, 추천)

Next.js를 만든 회사 서비스라 설정이 거의 없습니다.

### 1) Vercel 가입
- https://vercel.com 접속 후 GitHub로 로그인

### 2) 프로젝트 연결
1. **Add New** → **Project**
2. GitHub 저장소 선택 (예: `T3TO` 또는 본인 repo)
3. **Import** 클릭
4. **Branch**에서 `main` 또는 `kyungnam` 선택
5. **Root Directory**: 그대로 두기 (프로젝트 루트가 맞다면)
6. **Framework Preset**: Next.js (자동 감지됨)

### 3) 환경 변수 설정 (필수)
**Environment Variables**에 다음을 추가:

| Name | Value | 비고 |
|------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase 대시보드 → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | 같은 메뉴에서 복사 |
| `OPENAI_API_KEY` | OpenAI API 키 | 로드맵 RAG 생성용 (필수) |
| `OPENAI_ROADMAP_MODEL` | `gpt-4o-mini` | 로드맵 생성 모델 (선택, 기본값 사용 가능) |
| `TAVILY_API_KEY` | Tavily API 키 | 웹 검색 기능용 (선택, 없으면 DB 데이터만 사용) |
| `QNET_SERVICE_KEY` | Q-Net 공공데이터 서비스 키 | 자격증/시험일정 조회용 (선택) |

- **Key**, **Value** 입력 후 **Add** → **Deploy** 클릭
- **주의**: `OPENAI_API_KEY`는 로드맵 RAG 기능에 필수입니다. 없으면 기존 규칙 기반 로드맵만 생성됩니다.

### 4) 배포
- **Deploy** 버튼 클릭
- 빌드가 끝나면 `https://프로젝트명.vercel.app` 주소로 접속 가능
- 이후 GitHub에 push할 때마다 자동 재배포됨 (연결한 브랜치 기준)

### 5) Supabase 인증 설정
Supabase 대시보드 → **Authentication** → **URL Configuration**에서:

- **Site URL**: `https://프로젝트명.vercel.app` (또는 본인 도메인)
- **Redirect URLs**에 추가: `https://프로젝트명.vercel.app/**`, `https://프로젝트명.vercel.app/auth/callback`

---

## 2. Netlify로 배포

### 1) Netlify 가입 및 연결
- https://netlify.com → GitHub 로그인
- **Add new site** → **Import an existing project** → GitHub에서 repo 선택

### 2) 빌드 설정
- **Build command**: `npm run build`
- **Publish directory**: `.next` (아님)  
  Next.js는 **Netlify 플러그인** 사용 권장:
  - **Site configuration** → **Plugins**에서 "Next.js" 검색 후 설치
  - 또는 **Build command**: `npx @netlify/plugin-nextjs` 등 플러그인 안내 따르기

### 3) 환경 변수
**Site configuration** → **Environment variables**에 다음을 추가:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (로드맵 RAG 필수)
- `OPENAI_ROADMAP_MODEL` (선택, 기본값: `gpt-4o-mini`)
- `TAVILY_API_KEY` (선택, 웹 검색 기능)
- `QNET_SERVICE_KEY` (선택, 공공데이터)

---

## 3. Ubuntu 서버로 배포 (VPS)

Ubuntu 서버(또는 AWS EC2, GCP VM, 카페24 등 Linux VPS)에서 직접 배포하는 방법입니다.

### 전제 조건
- Ubuntu 20.04 / 22.04 LTS 권장
- SSH 접속 가능 (예: `ssh user@서버IP`)
- (선택) 도메인을 서버 IP에 연결해 두면 HTTPS 설정 가능

---

### 3-1. 서버 접속 및 기본 업데이트
```bash
ssh ubuntu@서버IP   # 사용자명은 ubuntu, root 등 서버에 맞게

sudo apt update && sudo apt upgrade -y
```

---

### 3-2. Node.js 설치 (LTS 20.x)
```bash
# NodeSource 저장소 추가
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js 설치
sudo apt-get install -y nodejs

# 확인
node -v   # v20.x.x
npm -v
```

---

### 3-3. Git 설치 및 프로젝트 클론
```bash
sudo apt install -y git

# 저장소 클론 (본인 GitHub 주소로 변경)
cd /home/ubuntu   # 또는 원하는 경로
git clone https://github.com/2025-SMHRD-IS-CX-1/T3TO.git
cd T3TO

# 특정 브랜치만 사용할 경우
git checkout kyungnam
```

---

### 3-4. 환경 변수 설정
```bash
# .env.local 파일 생성
nano .env.local
```

아래 내용 입력 후 저장 (Ctrl+O, Enter, Ctrl+X):
```env
# Supabase (필수)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...

# OpenAI - 로드맵 RAG 생성용 (필수)
OPENAI_API_KEY=sk-proj-...
OPENAI_ROADMAP_MODEL=gpt-4o-mini

# Tavily - 웹 검색 기능 (선택, 없으면 DB 데이터만 사용)
TAVILY_API_KEY=tvly-...

# Q-Net - 공공데이터 (선택)
QNET_SERVICE_KEY=...
```

**API 키 발급 방법:**
- Supabase: 대시보드 → **Settings** → **API**에서 URL과 anon key 복사
- OpenAI: https://platform.openai.com/api-keys 에서 발급
- Tavily: https://tavily.com 에서 가입 후 API 키 발급
- Q-Net: https://www.data.go.kr 에서 공공데이터 포털 가입 후 서비스 키 발급

---

### 3-5. 빌드 및 실행 테스트
```bash
npm install
npm run build
npm start
```

브라우저에서 `http://서버IP:3000` 으로 접속해 보기. 확인 후 터미널에서 `Ctrl+C`로 중지.

---

### 3-6. PM2로 백그라운드 실행 (서버 재부팅 시에도 자동 실행)
```bash
# PM2 전역 설치
sudo npm install -g pm2

# 앱 실행 (프로젝트 디렉토리에서)
cd /home/ubuntu/T3TO
pm2 start npm --name "mentoring" -- start

# 상태 확인
pm2 status
pm2 logs mentoring   # 로그 보기

# 서버 재부팅 시에도 PM2 자동 시작
pm2 save
pm2 startup
# 출력된 명령어(sudo env PATH=...)를 그대로 복사해 실행
```

---

### 3-7. Nginx 설치 및 리버스 프록시 (80/443 포트로 접속)
```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/mentoring
```

아래 내용 입력 (도메인이 없으면 `server_name`에 서버 IP 사용):
```nginx
server {
    listen 80;
    server_name 서버IP또는도메인;   # 예: 123.45.67.89 또는 www.example.com

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

활성화 및 Nginx 재시작:
```bash
sudo ln -s /etc/nginx/sites-available/mentoring /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

이제 `http://서버IP` 로 접속하면 Next.js 앱이 보입니다.

---

### 3-8. HTTPS(SSL) 설정 (도메인이 있을 때)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 도메인명   # 예: www.example.com
```

안내에 따라 이메일 입력 후 설정하면 `https://도메인명` 으로 접속 가능합니다.

---

### 3-9. 방화벽 설정
```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
sudo ufw status
```

---

### 3-10. Supabase 인증 URL 설정
Supabase 대시보드 → **Authentication** → **URL Configuration**에서:

- **Site URL**: `http://서버IP` 또는 `https://도메인명`
- **Redirect URLs**에 추가:
  - `http://서버IP/**`
  - `http://서버IP/auth/callback`
  - (HTTPS 사용 시) `https://도메인명/**`, `https://도메인명/auth/callback`

---

### 3-11. 배포 후 코드 업데이트 방법
```bash
cd /home/ubuntu/T3TO
git pull origin main   # 또는 kyungnam
npm install
npm run build
pm2 restart mentoring
```

---

### 3-12. Ubuntu 배포 요약

| 단계 | 내용 |
|------|------|
| 1 | SSH 접속, `apt update` |
| 2 | Node.js 20.x 설치 |
| 3 | Git 설치, 저장소 클론 |
| 4 | `.env.local`에 Supabase URL·anon key 설정 |
| 5 | `npm install` → `npm run build` → `npm start` 테스트 |
| 6 | PM2로 `npm start` 백그라운드 실행, `pm2 save` / `pm2 startup` |
| 7 | Nginx 리버스 프록시 (80 → 3000) |
| 8 | (선택) 도메인 + certbot으로 HTTPS |
| 9 | Supabase Site URL / Redirect URLs에 서버 주소 추가 |

---

## 4. 배포 전 체크리스트

- [ ] `.env.local`은 **절대** Git에 올리지 않기 (이미 `.gitignore`에 있음)
- [ ] 배포 플랫폼에 **환경 변수** 반드시 설정
- [ ] Supabase **Site URL / Redirect URLs**에 배포된 주소 추가
- [ ] 로컬에서 `npm run build` 한 번 성공하는지 확인

---

## 5. 요약

| 방법 | 난이도 | 비용 | 추천 |
|------|--------|------|------|
| **Vercel** | 쉬움 | 무료 플랜 있음 | ✅ Next.js에 가장 적합 |
| Netlify | 쉬움 | 무료 플랜 있음 | 가능 |
| **Ubuntu(VPS)** | 보통 | 서버 비용 | 직접 서버 제어 시 → **3장 참고** |

- **처음 배포**: Vercel + GitHub 연동 추천  
- **Ubuntu 서버 배포**: 위 **3. Ubuntu 서버로 배포** 절차를 순서대로 진행하면 됩니다.
