-- ============================================
-- 관리자 역할 부여 및 동기화 스크립트
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. auth.users에 있지만 profiles_role에 없는 모든 사용자를 추가
INSERT INTO public.profiles_role (id, email, role, created_at)
SELECT 
    au.id,
    au.email,
    'user'::user_role,  -- 기본값은 'user'
    COALESCE(au.created_at, timezone('utc'::text, now()))
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles_role pr WHERE pr.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

-- 2. 특정 이메일을 관리자로 설정 (아래 이메일을 실제 관리자 이메일로 변경)
-- 예시: UPDATE public.profiles_role SET role = 'admin' WHERE email = 'admin@example.com';

-- 3. 또는 특정 사용자 ID를 관리자로 설정
-- 예시: UPDATE public.profiles_role SET role = 'admin' WHERE id = 'user-uuid-here';

-- 4. 모든 사용자의 현재 역할 확인
SELECT 
    pr.id,
    pr.email,
    pr.role,
    pr.created_at,
    au.created_at as auth_created_at
FROM public.profiles_role pr
JOIN auth.users au ON pr.id = au.id
ORDER BY pr.created_at DESC;
