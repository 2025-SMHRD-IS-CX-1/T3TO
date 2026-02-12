-- ============================================
-- 역할(role) 구분: profiles 테이블 + user_role enum + RLS
-- Supabase 대시보드 → SQL Editor에서 이 파일 전체 실행
-- ============================================

-- 1. 역할 열거형(Enum) 생성
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. 프로필 테이블 생성 (auth.users와 연동)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    email text,
    role user_role NOT NULL DEFAULT 'user',
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 3. RLS (Row Level Security) 설정
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책: 자신의 프로필은 조회 가능
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- 5. RLS 정책: 관리자는 모든 프로필 조회 가능
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- 6. RLS 정책: 자신의 프로필은 수정 가능 (role 변경 등)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 7. 트리거: 회원가입 시 자동으로 profiles에 행 삽입
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'user')
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        created_at = COALESCE(public.profiles.created_at, EXCLUDED.created_at);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 8. 이미 가입된 auth.users를 profiles에 한 번 반영
INSERT INTO public.profiles (id, email, role, created_at)
SELECT
    au.id,
    au.email,
    'user',
    COALESCE(au.created_at, timezone('utc'::text, now()))
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;
