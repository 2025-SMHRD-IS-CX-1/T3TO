-- ============================================
-- 관리자 역할 확인 및 수정 스크립트
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 현재 auth.users와 profiles_role 매칭 상태 확인
SELECT 
    au.id as auth_user_id,
    au.email as auth_email,
    pr.id as profile_id,
    pr.email as profile_email,
    pr.role as profile_role,
    pr.created_at as profile_created_at,
    CASE 
        WHEN pr.id IS NULL THEN '❌ profiles_role에 없음'
        WHEN pr.role = 'admin' THEN '✅ 관리자'
        WHEN pr.role = 'user' THEN '✅ 상담사'
        ELSE '⚠️ 알 수 없음'
    END as status
FROM auth.users au
LEFT JOIN public.profiles_role pr ON au.id = pr.id
ORDER BY au.created_at DESC;

-- 2. 특정 이메일의 사용자를 관리자로 설정
-- 아래 이메일을 실제 관리자 이메일로 변경하세요
-- UPDATE public.profiles_role
-- SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'your-admin@email.com');

-- 3. auth.users에 있지만 profiles_role에 없는 사용자들을 profiles_role에 추가
INSERT INTO public.profiles_role (id, email, role, created_at)
SELECT 
    au.id,
    au.email,
    'user'::user_role,  -- 기본값은 'user', 필요시 'admin'으로 변경
    COALESCE(au.created_at, timezone('utc'::text, now()))
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles_role pr WHERE pr.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

-- 4. 특정 사용자를 관리자로 변경하는 예시 (이메일 기준)
-- UPDATE public.profiles_role
-- SET role = 'admin'
-- WHERE id IN (
--     SELECT id FROM auth.users WHERE email = 'admin@example.com'
-- );

-- 5. RLS 정책 확인 (자신의 프로필은 항상 조회 가능해야 함)
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
WHERE tablename = 'profiles_role';
