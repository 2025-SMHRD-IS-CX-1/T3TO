-- ============================================
-- 관리자 역할 부여 및 동기화 스크립트
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. auth.users에 있지만 users 테이블에 없는 모든 사용자를 추가
INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
SELECT 
    au.id::text,
    COALESCE(au.email, ''),
    COALESCE(au.email, au.id::text),
    'SUPABASE_AUTH',
    'counselor',  -- 기본값은 'counselor'
    COALESCE(au.created_at, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = au.id::text
)
ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    login_id = EXCLUDED.login_id;

-- 2. 특정 이메일을 관리자로 설정 (아래 이메일을 실제 관리자 이메일로 변경)
-- 예시: UPDATE public.users SET role = 'admin' WHERE email = 'admin@example.com';

-- 3. 또는 특정 사용자 ID를 관리자로 설정
-- 예시: UPDATE public.users SET role = 'admin' WHERE user_id = 'user-uuid-here';

-- 4. 모든 사용자의 현재 역할 확인
SELECT 
    u.user_id,
    u.email,
    u.role,
    u.created_at,
    au.created_at as auth_created_at
FROM public.users u
JOIN auth.users au ON u.user_id = au.id::text
ORDER BY u.created_at DESC;
