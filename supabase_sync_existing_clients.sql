-- 기존 career_profiles의 user_id가 public.users에 없어서 조회가 안 되는 경우
-- public.users에 해당 user_id를 추가 (auth.users와 동기화)
-- Supabase SQL Editor에서 실행

-- 1) career_profiles에 있는 user_id 중 public.users에 없는 것들을 찾아서 추가
INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at)
SELECT DISTINCT
    cp.user_id,
    COALESCE(cp.client_email, ''),
    COALESCE(cp.client_email, cp.user_id),
    'SUPABASE_AUTH',
    'counselor',
    COALESCE(cp.created_at, CURRENT_TIMESTAMP)
FROM public.career_profiles cp
WHERE cp.user_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM public.users u WHERE u.user_id = cp.user_id
    )
ON CONFLICT (user_id) DO NOTHING;

-- 2) auth.users에 있는 사용자 중 public.users에 없는 것들도 추가
INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at)
SELECT DISTINCT
    au.id::text,
    COALESCE(au.email, ''),
    COALESCE(au.email, au.id::text),
    'SUPABASE_AUTH',
    'counselor',
    COALESCE(au.created_at, CURRENT_TIMESTAMP)
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = au.id::text
)
ON CONFLICT (user_id) DO NOTHING;
