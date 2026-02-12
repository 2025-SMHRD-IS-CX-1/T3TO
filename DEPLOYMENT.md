# 배포 가이드 (온라인 접속)

이 프로젝트를 다른 환경(PC, 휴대폰 등)에서 **온라인으로** 사용하려면 아래 순서대로 진행하세요.

---

## 1. 배포 플랫폼 선택

| 플랫폼 | 특징 | 추천도 |
|--------|------|--------|
| **Vercel** | Next.js 제작사, GitHub 연동 후 자동 배포 | ⭐ 가장 추천 |
| Netlify | 무료 티어, Next.js 지원 | 가능 |
| Railway / Render | 서버형 배포 | 필요 시 |

**여기서는 Vercel 기준**으로 설명합니다.

---

## 2. Vercel로 배포하기

### 2-1. Vercel 가입 및 프로젝트 연결

1. [vercel.com](https://vercel.com) 접속 → **Sign Up** (GitHub 계정으로 로그인 권장)
2. **Add New…** → **Project** 선택
3. **Import Git Repository**에서 `2025-SMHRD-IS-CX-1/T3TO` 저장소 선택
4. **Framework Preset**: Next.js 자동 감지됨 (그대로 두기)
5. **Root Directory**: `./` (기본값)
6. **Build Command**: `npm run build` (기본값)
7. **Output Directory**: (비워두기, Next.js 기본값 사용)

### 2-2. 환경 변수 설정 (필수)

배포 전에 **Environment Variables**에 다음 두 값을 반드시 넣어야 합니다.

| 이름 | 설명 | 예시 (값은 본인 Supabase에서 복사) |
|------|------|-------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 익명(공개) 키 | `eyJhbGciOiJIUzI1NiIs...` |

- Vercel 대시보드: 프로젝트 → **Settings** → **Environment Variables**
- **Key**, **Value** 입력 후 **Save**
- **Production**, **Preview**, **Development** 모두 체크해 두면 편합니다.

값 확인 위치: [Supabase Dashboard](https://supabase.com/dashboard) → 본인 프로젝트 → **Settings** → **API**  
→ `Project URL`, `anon public` 키 복사

### 2-3. 배포 실행

- **Deploy** 버튼 클릭
- 빌드가 끝나면 `https://프로젝트이름.vercel.app` 형태의 URL이 생성됩니다.
- 이후 GitHub `main` 브랜치에 푸시할 때마다 **자동으로 재배포**됩니다.

---

## 3. Supabase 인증(로그인)이 있다면

로그인/회원가입을 사용한다면 Supabase에서 **배포된 URL**을 등록해야 합니다.

1. [Supabase Dashboard](https://supabase.com/dashboard) → 본인 프로젝트
2. **Authentication** → **URL Configuration**
3. **Site URL**: `https://프로젝트이름.vercel.app` (Vercel에서 준 URL)
4. **Redirect URLs**에 아래 추가  
   - `https://프로젝트이름.vercel.app/**`  
   - `https://프로젝트이름.vercel.app/auth/callback` (콜백 URL 사용 시)

저장 후 다시 로그인/회원가입 테스트하면 됩니다.

---

## 4. 다른 환경에서 접속

배포가 끝나면:

- **PC**: 브라우저에서 `https://프로젝트이름.vercel.app` 접속
- **휴대폰**: 같은 URL을 주소창에 입력하거나, 홈 화면에 추가해서 앱처럼 사용

같은 Supabase를 쓰므로 **데이터는 배포 환경과 동일**하게 보입니다.

---

## 5. 요약 체크리스트

- [ ] Vercel 가입 후 GitHub 저장소(T3TO) 연결
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 환경 변수 설정
- [ ] Deploy 실행 후 URL 확인
- [ ] (로그인 사용 시) Supabase Site URL / Redirect URLs에 배포 URL 등록
- [ ] 다른 기기에서 해당 URL로 접속해 동작 확인

이 순서대로 하시면 이 프로젝트를 **다른 환경에서 온라인으로** 사용할 수 있습니다.
