# 관리자 역할 문제 해결 가이드

## 문제 증상
- 관리자 역할을 부여했는데 `/admin` 페이지로 이동이 안 됨
- DB에 `role = 'admin'`으로 설정했지만 인식이 안 됨

## 원인 분석

### 1. `users` 테이블에 레코드가 없는 경우
- `auth.users`에는 있지만 `users` 테이블에는 없는 경우
- 회원가입 시 트리거가 작동하지 않았을 수 있음

### 2. RLS (Row Level Security) 정책 문제
- 자신의 프로필을 조회할 수 없는 경우
- RLS 정책이 제대로 설정되지 않은 경우

### 3. ID 불일치
- `auth.users.id` (UUID)와 `users.user_id` (VARCHAR)가 일치하지 않는 경우
- UUID를 문자열로 변환해야 함 (`auth.users.id::text = users.user_id`)

## 해결 방법

### Step 1: 현재 상태 확인

Supabase 대시보드 → SQL Editor에서 다음 쿼리 실행:

```sql
-- 현재 auth.users와 users 테이블 매칭 상태 확인
SELECT 
    au.id as auth_user_id,
    au.email as auth_email,
    u.user_id as users_user_id,
    u.email as users_email,
    u.role as users_role,
    CASE 
        WHEN u.user_id IS NULL THEN '❌ users 테이블에 없음'
        WHEN u.role = 'admin' THEN '✅ 관리자'
        WHEN u.role = 'counselor' THEN '✅ 상담사'
        WHEN u.role = 'client' THEN '✅ 클라이언트'
        ELSE '⚠️ 알 수 없음'
    END as status
FROM auth.users au
LEFT JOIN public.users u ON au.id::text = u.user_id
ORDER BY au.created_at DESC;
```

### Step 2: 누락된 사용자 추가

`users` 테이블에 레코드가 없는 사용자가 있다면:

```sql
-- auth.users에 있지만 users 테이블에 없는 사용자들을 추가
INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
SELECT 
    au.id::text,
    COALESCE(au.email, ''),
    COALESCE(au.email, au.id::text),
    'SUPABASE_AUTH',
    'counselor',
    COALESCE(au.created_at, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = au.id::text
)
ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    login_id = EXCLUDED.login_id;
```

### Step 3: 관리자 역할 부여

특정 이메일을 관리자로 설정:

```sql
-- 이메일로 관리자 설정 (이메일을 실제 관리자 이메일로 변경)
UPDATE public.users
SET role = 'admin'
WHERE user_id = (SELECT id::text FROM auth.users WHERE email = 'your-admin@email.com');
```

또는 사용자 ID로 직접 설정:

```sql
-- 사용자 ID로 관리자 설정 (ID를 실제 사용자 UUID 문자열로 변경)
UPDATE public.users
SET role = 'admin'
WHERE user_id = 'user-uuid-string-here';
```

### Step 4: RLS 정책 확인

RLS 정책이 제대로 설정되어 있는지 확인:

```sql
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'users';
```

필요시 RLS 정책 재생성 (`supabase_schema_final.sql` 파일 참조)

### Step 5: 브라우저 콘솔 확인

애플리케이션을 실행하고 브라우저 개발자 도구 콘솔에서 다음 로그 확인:

- `[Middleware] users 테이블 조회 실패` - RLS 또는 데이터 문제
- `[getCurrentUserRole] users 테이블에 레코드가 없습니다` - 데이터 동기화 문제
- `[Middleware] 관리자 페이지 접근 거부` - 역할이 'admin'이 아님

### Step 6: 서버 로그 확인

Next.js 서버 콘솔에서도 동일한 로그가 출력됩니다.

## 빠른 해결 (한 번에 실행)

`fix_admin_role.sql` 파일을 Supabase SQL Editor에서 실행한 후:

```sql
-- 1. 누락된 사용자 추가
INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
SELECT 
    au.id::text,
    COALESCE(au.email, ''),
    COALESCE(au.email, au.id::text),
    'SUPABASE_AUTH',
    'counselor',
    COALESCE(au.created_at, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = au.id::text
)
ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    login_id = EXCLUDED.login_id;

-- 2. 관리자 이메일로 역할 변경 (이메일 변경 필요)
UPDATE public.users
SET role = 'admin'
WHERE email = 'your-admin@email.com';
```

## 확인 방법

1. Supabase 대시보드 → Table Editor → `users` 테이블 확인
2. 해당 사용자의 `role` 컬럼이 `admin`인지 확인
3. `user_id`가 `auth.users.id`를 문자열로 변환한 값과 일치하는지 확인
4. 애플리케이션에서 로그아웃 후 다시 로그인
5. `/admin/clients` 페이지 접근 시도

## 추가 디버깅

문제가 계속되면 `check_admin_role.sql` 파일을 실행하여 상세 진단 정보를 확인하세요.
