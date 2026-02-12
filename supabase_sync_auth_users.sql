-- ============================================
-- 회원가입 시 auth.users → public.users 자동 동기화 (role로 권한 구분)
-- Supabase 대시보드 → SQL Editor에서 이 파일 전체 실행
--
-- role 값: 'admin' | 'counselor' | 'client'
-- - 기본 가입 시 counselor. DB에서 직접 수정하거나, 가입 시 metadata.role 지정 가능.
-- ============================================

-- 1) public.users 테이블이 없으면 생성 (role로 권한 구분)
CREATE TABLE IF NOT EXISTS public.users (
    user_id VARCHAR(50) PRIMARY KEY,
    login_id VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'counselor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- role 컬럼이 없으면 추가 (이미 있는 테이블에 적용 시)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'counselor';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 인덱스는 없을 때만 생성
CREATE INDEX IF NOT EXISTS idx_users_login_id ON public.users(login_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 2) auth.users에 새 사용자 추가될 때 public.users에 자동 반영 (role 기본값 counselor)
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
    VALUES (
        NEW.id::text,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.email, NEW.id::text),
        'SUPABASE_AUTH',
        COALESCE(NEW.raw_user_meta_data->>'role', 'counselor'),
        COALESCE(NEW.created_at, CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        login_id = EXCLUDED.login_id,
        role = COALESCE(EXCLUDED.role, users.role),
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- 3) auth.users INSERT 트리거 (이미 있으면 제거 후 재생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_auth_user_to_public();

-- 4) 이미 가입된 auth.users 계정을 public.users에 한 번 반영 (role 기본 counselor)
INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
SELECT
    au.id::text,
    COALESCE(au.email, ''),
    COALESCE(au.email, au.id::text),
    'SUPABASE_AUTH',
    COALESCE(au.raw_user_meta_data->>'role', 'counselor'),
    COALESCE(au.created_at, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM auth.users au
ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    login_id = EXCLUDED.login_id,
    role = COALESCE(EXCLUDED.role, public.users.role),
    updated_at = EXCLUDED.updated_at;
