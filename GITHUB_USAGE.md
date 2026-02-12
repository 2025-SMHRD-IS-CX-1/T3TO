# GitHub 저장소 사용법

이 프로젝트를 GitHub에서 관리하고, 다른 PC에서 받아서 쓸 때 참고하는 가이드입니다.

---

## 저장소 주소

- **URL**: https://github.com/2025-SMHRD-IS-CX-1/T3TO
- **기본 브랜치**: `main`

---

## 1. 새 PC에서 처음 받아서 쓰기

다른 컴퓨터에서 처음 이 프로젝트를 쓸 때 순서입니다.

### 1-1. 저장소 복제 (clone)

```powershell
# 원하는 폴더로 이동 후
cd C:\Users\본인사용자명\원하는경로
git clone https://github.com/2025-SMHRD-IS-CX-1/T3TO.git
cd T3TO
```

### 1-2. 패키지 설치

```powershell
npm install
```

### 1-3. 환경 변수 파일 만들기

프로젝트 루트에 `.env.local` 파일을 만들고 아래 두 줄을 넣습니다.  
(값은 Supabase 대시보드 → Settings → API에서 복사)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 1-4. 실행

```powershell
npm run dev
```

브라우저에서 http://localhost:3000 접속하면 됩니다.

---

## 2. 평소 작업 흐름 (수정 후 GitHub에 올리기)

코드를 수정한 뒤 GitHub에 반영하는 기본 순서입니다.

### PowerShell 사용 시 (Windows)

`&&` 대신 **세미콜론(;)**을 쓰거나, 먼저 프로젝트 폴더로 이동한 뒤 명령을 실행하세요.

```powershell
# 프로젝트 폴더로 이동
Set-Location "c:\Users\SMHRD\OneDrive\Desktop\mentoring"

# 1) 변경 파일 모두 스테이징
git add .

# 2) 커밋 (메시지는 수정 내용에 맞게)
git commit -m "상담 수정 기능 추가"

# 3) GitHub에 푸시
git push origin main
```

한 줄로 실행하려면:

```powershell
Set-Location "c:\Users\SMHRD\OneDrive\Desktop\mentoring"; git add .; git commit -m "작업 내용 요약"; git push origin main
```

### 요약

| 단계 | 명령 | 설명 |
|------|------|------|
| 스테이징 | `git add .` | 변경된 파일을 커밋 대상으로 넣기 |
| 커밋 | `git commit -m "메시지"` | 로컬에 버전 기록 |
| 푸시 | `git push origin main` | GitHub `main` 브랜치에 업로드 |

---

## 3. GitHub에서 최신 코드 받기

다른 PC에서 수정했거나, 팀원이 올린 내용을 받을 때입니다.

```powershell
Set-Location "c:\Users\SMHRD\OneDrive\Desktop\mentoring"
git pull origin main
```

받은 뒤 패키지가 바뀌었을 수 있으면 `npm install` 한 번 더 실행하면 됩니다.

---

## 4. 자주 쓰는 명령 정리

| 하고 싶은 일 | 명령 |
|-------------|------|
| 현재 상태 보기 | `git status` |
| 변경 파일 모두 올리기 | `git add .` 후 `git commit -m "메시지"` 후 `git push origin main` |
| 최신 코드 받기 | `git pull origin main` |
| 올린 내역 보기 | 브라우저에서 https://github.com/2025-SMHRD-IS-CX-1/T3TO/commits/main |

---

## 5. 주의사항

- **`.env.local`**은 Git에 올라가지 않습니다 (.gitignore에 있음).  
  새 PC에서 쓸 때는 직접 만들어서 Supabase URL/키를 넣어야 합니다.
- **비밀번호, API 키**는 절대 코드나 GitHub에 올리지 마세요.
- 푸시 전에 `git status`로 어떤 파일이 올라가는지 한 번 확인하는 습관을 권장합니다.

---

## 6. 타 환경에서 회원가입 정보가 DB에 안 보일 때

다른 PC에서 clone 후 실행했는데 **회원가입한 계정이 DB에 저장되지 않는 것처럼** 보이면 아래를 순서대로 확인하세요.

### 6-1. 같은 Supabase 프로젝트를 쓰는지 확인

- **타 환경**에서도 **원래 쓰던 Supabase 프로젝트**와 동일한 URL/키를 써야 합니다.
- `.env.local`에 넣는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 **다른 프로젝트 것으로 바꾸면**, 그 새 프로젝트 DB에 저장됩니다. (거기엔 테이블이 없을 수 있음)
- **해결**: 타 환경의 `.env.local` 값을 **기존에 사용하던 Supabase 프로젝트**의 URL/키와 똑같이 맞추세요. (Supabase 대시보드 → Settings → API에서 복사)

### 6-2. Supabase에서 회원 동기화 SQL 실행 (필수)

- 회원가입 시 **auth.users** → **public.users** 자동 반영을 위해, **supabase_sync_auth_users.sql**을 Supabase SQL Editor에서 **한 번** 실행하세요.
- **방법**: SQL Editor에서 **supabase_sync_auth_users.sql** 전체 복사 후 Run. (새 프로젝트면 먼저 **supabase_schema_final.sql** 실행) (이미 만든 적 있으면 일부 문구가 “already exists”로 나올 수 있음)

### 6-3. 회원 목록은 어디서 보나요?

- **Supabase Auth 사용자**: 대시보드 → **Authentication** → **Users** 에서 확인할 수 있습니다. (이메일 가입 계정은 여기 저장됩니다.)
- **public.users** (앱에서 사용하는 사용자 테이블): 대시보드 → **Table Editor** → **users** 에서 확인할 수 있습니다.  
  회원가입/로그인 시 이 테이블에도 자동으로 한 번씩 동기화되도록 코드에 넣어 두었습니다.

### 6-4. 정리

| 확인 항목 | 내용 |
|-----------|------|
| `.env.local` | 타 환경에서도 **같은 Supabase 프로젝트** URL/anon key 사용 |
| DB 스키마 | **supabase_schema_final.sql** 실행 후 **supabase_sync_auth_users.sql** 실행 (회원 동기화) |
| 역할(role) | **supabase_profiles_role.sql** 실행 → profiles 테이블 + RLS, 가입 시 자동 생성. role: admin / user |
| 회원 목록 보기 | **Authentication → Users** 또는 **Table Editor → users** |

이 가이드대로 하시면 GitHub에서 프로젝트를 안전하게 관리하고, 여러 환경에서 같은 코드로 작업할 수 있습니다.
