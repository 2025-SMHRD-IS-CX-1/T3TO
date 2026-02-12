-- ============================================
-- 회원가입 시 users 테이블에 데이터가 안 들어가는 문제 진단
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. RLS가 활성화되어 있는지 확인
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'users';

-- 3. users 테이블의 모든 RLS 정책 확인
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- 4. INSERT 정책이 있는지 확인 (특히 중요!)
SELECT 
    policyname,
    cmd,
    with_check
FROM pg_policies
WHERE tablename = 'users' AND cmd = 'INSERT';

-- 5. 최근 생성된 사용자 확인 (auth.users)
SELECT 
    id,
    email,
    created_at,
    email_confirmed_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- 6. public.users 테이블의 최근 레코드 확인
SELECT 
    user_id,
    email,
    role,
    created_at
FROM public.users
ORDER BY created_at DESC
LIMIT 5;

-- 7. auth.users와 public.users 매칭 확인
SELECT 
    au.id as auth_user_id,
    au.email as auth_email,
    au.created_at as auth_created_at,
    u.user_id as users_user_id,
    u.email as users_email,
    u.created_at as users_created_at,
    CASE 
        WHEN u.user_id IS NULL THEN '❌ users 테이블에 없음'
        ELSE '✅ 매칭됨'
    END as status
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.user_id
ORDER BY au.created_at DESC
LIMIT 10;
