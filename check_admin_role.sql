-- ============================================
-- 관리자 역할 확인 및 수정 스크립트
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 현재 auth.users와 users 테이블 매칭 상태 확인
SELECT 
    au.id as auth_user_id,
    au.email as auth_email,
    u.user_id as users_user_id,
    u.email as users_email,
    u.role as users_role,
    u.created_at as users_created_at,
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

-- 2. 특정 이메일의 사용자를 관리자로 설정
-- 아래 이메일을 실제 관리자 이메일로 변경하세요
-- UPDATE public.users
-- SET role = 'admin'
-- WHERE user_id = (SELECT id::text FROM auth.users WHERE email = 'your-admin@email.com');

-- 3. auth.users에 있지만 users 테이블에 없는 사용자들을 users에 추가
INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
SELECT 
    au.id::text,
    COALESCE(au.email, ''),
    COALESCE(au.email, au.id::text),
    'SUPABASE_AUTH',
    'counselor',  -- 기본값은 'counselor', 필요시 'admin'으로 변경
    COALESCE(au.created_at, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = au.id::text
)
ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    login_id = EXCLUDED.login_id;

-- 4. 특정 사용자를 관리자로 변경하는 예시 (이메일 기준)
-- UPDATE public.users
-- SET role = 'admin'
-- WHERE user_id IN (
--     SELECT id::text FROM auth.users WHERE email = 'admin@example.com'
-- );

-- 5. RLS 정책 확인 (users 테이블)
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'users';
