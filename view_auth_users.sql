-- ============================================
-- auth.users 테이블 조회
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. auth.users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'auth' 
    AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. auth.users 테이블의 모든 데이터 조회
SELECT 
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    confirmed_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at
FROM auth.users
ORDER BY created_at DESC;

-- 3. 간단한 요약 정보만 조회 (가장 많이 사용)
SELECT 
    id,
    email,
    email_confirmed_at,
    last_sign_in_at,
    raw_user_meta_data->>'full_name' as name,
    raw_user_meta_data->>'role' as role,
    created_at,
    updated_at
FROM auth.users
ORDER BY created_at DESC;

-- 4. public.users와 비교하여 동기화 상태 확인
SELECT 
    au.id as auth_user_id,
    au.email as auth_email,
    au.created_at as auth_created_at,
    pu.user_id as public_user_id,
    pu.email as public_email,
    pu.role as public_role,
    pu.created_at as public_created_at,
    CASE 
        WHEN pu.user_id IS NULL THEN '❌ public.users에 없음'
        WHEN au.id::text = pu.user_id::text OR au.id = pu.user_id THEN '✅ 동기화됨'
        ELSE '⚠️ ID 불일치'
    END as sync_status
FROM auth.users au
LEFT JOIN public.users pu ON (
    au.id::text = pu.user_id::text OR au.id = pu.user_id::uuid
)
ORDER BY au.created_at DESC;

-- 5. auth.users에만 있고 public.users에 없는 사용자 (동기화 누락)
SELECT 
    au.id,
    au.email,
    au.created_at,
    au.raw_user_meta_data->>'full_name' as name,
    au.raw_user_meta_data->>'role' as role
FROM auth.users au
LEFT JOIN public.users pu ON (
    au.id::text = pu.user_id::text OR au.id = pu.user_id::uuid
)
WHERE pu.user_id IS NULL
ORDER BY au.created_at DESC;

-- 6. 최근 생성된 사용자 (최근 7일)
SELECT 
    id,
    email,
    email_confirmed_at,
    raw_user_meta_data->>'full_name' as name,
    raw_user_meta_data->>'role' as role,
    created_at
FROM auth.users
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
