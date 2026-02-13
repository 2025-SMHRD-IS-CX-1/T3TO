-- ============================================
-- 회원탈퇴 상태 확인
-- test 계정이 남아있는지 확인
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. public.users에서 test 계정 확인
SELECT 
    user_id,
    email,
    login_id,
    role,
    created_at
FROM public.users
WHERE email LIKE '%test%' OR login_id LIKE '%test%'
ORDER BY created_at DESC;

-- 2. auth.users에서 test 계정 확인
SELECT 
    id,
    email,
    created_at,
    deleted_at
FROM auth.users
WHERE email LIKE '%test%'
ORDER BY created_at DESC;

-- 3. public.users와 auth.users 비교 (test 계정)
SELECT 
    au.id as auth_user_id,
    au.email as auth_email,
    au.deleted_at as auth_deleted_at,
    pu.user_id as public_user_id,
    pu.email as public_email,
    pu.role as public_role,
    CASE 
        WHEN pu.user_id IS NULL AND au.deleted_at IS NULL THEN '⚠️ auth.users에만 존재 (public.users 동기화 누락)'
        WHEN pu.user_id IS NOT NULL AND au.deleted_at IS NOT NULL THEN '⚠️ public.users에만 존재 (auth.users는 삭제됨)'
        WHEN pu.user_id IS NULL AND au.deleted_at IS NOT NULL THEN '✅ 정상 삭제됨'
        WHEN pu.user_id IS NOT NULL AND au.deleted_at IS NULL THEN '❌ 둘 다 존재 (삭제 필요)'
        ELSE '❓ 상태 불명'
    END as status
FROM auth.users au
LEFT JOIN public.users pu ON (
    au.id::text = pu.user_id::text OR au.id = pu.user_id::uuid
)
WHERE au.email LIKE '%test%'
ORDER BY au.created_at DESC;

-- 4. 트리거 상태 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE (event_object_schema = 'public' AND event_object_table = 'users')
   OR (event_object_schema = 'auth' AND event_object_table = 'users')
ORDER BY event_object_table, trigger_name;

-- 5. CASCADE DELETE 설정 확인
SELECT
    tc.table_name,
    tc.constraint_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ CASCADE 설정됨'
        ELSE '❌ CASCADE 설정 안됨'
    END AS cascade_status
FROM information_schema.table_constraints AS tc
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.constraint_name LIKE '%user%'
ORDER BY tc.table_name;
