-- ============================================
-- auth.users와 public.users 매칭 확인 (타입 안전 버전)
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. user_id 타입 확인
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'user_id';

-- 2. auth.users와 public.users 매칭 확인
-- user_id가 UUID인 경우 아래 쿼리 실행:
SELECT 
    au.id::text as auth_id,
    au.email as auth_email,
    au.created_at as auth_created_at,
    au.raw_user_meta_data->>'role' as auth_metadata_role,
    u.user_id::text as users_user_id,
    u.email as users_email,
    u.role as users_role,
    u.created_at as users_created_at,
    CASE 
        WHEN u.user_id IS NULL THEN '❌ 트리거가 작동하지 않음'
        ELSE '✅ 트리거 작동함'
    END as status
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.user_id
ORDER BY au.created_at DESC
LIMIT 10;

-- user_id가 VARCHAR인 경우 아래 쿼리 실행:
-- SELECT 
--     au.id::text as auth_id,
--     au.email as auth_email,
--     au.created_at as auth_created_at,
--     au.raw_user_meta_data->>'role' as auth_metadata_role,
--     u.user_id as users_user_id,
--     u.email as users_email,
--     u.role as users_role,
--     u.created_at as users_created_at,
--     CASE 
--         WHEN u.user_id IS NULL THEN '❌ 트리거가 작동하지 않음'
--         ELSE '✅ 트리거 작동함'
--     END as status
-- FROM auth.users au
-- LEFT JOIN public.users u ON au.id::text = u.user_id
-- ORDER BY au.created_at DESC
-- LIMIT 10;

-- 3. 트리거가 작동하지 않은 사용자들 확인
-- user_id가 UUID인 경우:
SELECT 
    au.id::text as auth_id,
    au.email as auth_email,
    au.created_at as auth_created_at
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = au.id
)
ORDER BY au.created_at DESC;

-- user_id가 VARCHAR인 경우:
-- SELECT 
--     au.id::text as auth_id,
--     au.email as auth_email,
--     au.created_at as auth_created_at
-- FROM auth.users au
-- WHERE NOT EXISTS (
--     SELECT 1 FROM public.users u WHERE u.user_id = au.id::text
-- )
-- ORDER BY au.created_at DESC;

-- 4. 트리거가 작동하지 않은 사용자들을 수동으로 추가 (필요 시)
-- user_id가 UUID인 경우:
-- INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
-- SELECT
--     au.id,
--     COALESCE(au.email, ''),
--     COALESCE(au.email, au.id::text),
--     'SUPABASE_AUTH',
--     COALESCE(au.raw_user_meta_data->>'role', 'counselor'),
--     COALESCE(au.created_at, CURRENT_TIMESTAMP),
--     CURRENT_TIMESTAMP
-- FROM auth.users au
-- WHERE NOT EXISTS (
--     SELECT 1 FROM public.users u WHERE u.user_id = au.id
-- )
-- ON CONFLICT (user_id) DO NOTHING;

-- user_id가 VARCHAR인 경우:
-- INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
-- SELECT
--     au.id::text,
--     COALESCE(au.email, ''),
--     COALESCE(au.email, au.id::text),
--     'SUPABASE_AUTH',
--     COALESCE(au.raw_user_meta_data->>'role', 'counselor'),
--     COALESCE(au.created_at, CURRENT_TIMESTAMP),
--     CURRENT_TIMESTAMP
-- FROM auth.users au
-- WHERE NOT EXISTS (
--     SELECT 1 FROM public.users u WHERE u.user_id = au.id::text
-- )
-- ON CONFLICT (user_id) DO NOTHING;
