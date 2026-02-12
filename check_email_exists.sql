-- ============================================
-- 특정 이메일이 auth.users와 public.users에 모두 있는지 확인
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 특정 이메일 확인 (이메일을 변경하여 실행)
-- 예: 'test@example.com'을 실제 이메일로 변경
SELECT 
    'auth.users 확인' as check_type,
    au.id::text as user_id,
    au.email,
    au.created_at,
    au.email_confirmed_at
FROM auth.users au
WHERE au.email = 'nkn444318@gmail.com'  -- 이메일 변경 필요
LIMIT 1;

-- 2. public.users 확인
-- user_id가 UUID인 경우:
SELECT 
    'public.users 확인 (UUID)' as check_type,
    u.user_id::text,
    u.email,
    u.role,
    u.created_at
FROM public.users u
WHERE u.email = 'nkn444318@gmail.com'  -- 이메일 변경 필요
LIMIT 1;

-- user_id가 VARCHAR인 경우:
-- SELECT 
--     'public.users 확인 (VARCHAR)' as check_type,
--     u.user_id,
--     u.email,
--     u.role,
--     u.created_at
-- FROM public.users u
-- WHERE u.email = 'nkn444318@gmail.com'  -- 이메일 변경 필요
-- LIMIT 1;

-- 3. 매칭 확인
-- user_id가 UUID인 경우:
SELECT 
    au.id::text as auth_id,
    au.email as auth_email,
    u.user_id::text as users_user_id,
    u.email as users_email,
    CASE 
        WHEN u.user_id IS NULL THEN '❌ public.users에 없음 - 트리거가 작동하지 않음'
        ELSE '✅ 양쪽 모두 존재'
    END as status
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.user_id
WHERE au.email = 'nkn444318@gmail.com'  -- 이메일 변경 필요
LIMIT 1;

-- user_id가 VARCHAR인 경우:
-- SELECT 
--     au.id::text as auth_id,
--     au.email as auth_email,
--     u.user_id as users_user_id,
--     u.email as users_email,
--     CASE 
--         WHEN u.user_id IS NULL THEN '❌ public.users에 없음 - 트리거가 작동하지 않음'
--         ELSE '✅ 양쪽 모두 존재'
--     END as status
-- FROM auth.users au
-- LEFT JOIN public.users u ON au.id::text = u.user_id
-- WHERE au.email = 'nkn444318@gmail.com'  -- 이메일 변경 필요
-- LIMIT 1;

-- 4. auth.users에는 있지만 public.users에 없는 사용자들을 수동으로 추가
-- sync_missing_users.sql 실행 참고
