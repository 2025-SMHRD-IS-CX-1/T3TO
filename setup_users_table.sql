-- ============================================
-- users 테이블 완전 설정 스크립트
-- 회원가입이 정상 작동하도록 모든 설정을 한 번에 적용
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블이 없으면 생성
CREATE TABLE IF NOT EXISTS public.users (
    user_id VARCHAR(50) PRIMARY KEY,
    login_id VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'counselor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. role 컬럼이 없으면 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'counselor';
        RAISE NOTICE 'role 컬럼이 추가되었습니다.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'role 컬럼 추가 중 오류: %', SQLERRM;
END $$;

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_users_login_id ON public.users(login_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 4. RLS 활성화
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. 기존 정책 모두 삭제 (중복 정책 제거)
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Individual data access" ON public.users;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.users;
DROP POLICY IF EXISTS "Authenticated access policy" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- 6. INSERT 정책: 회원가입 시 자신의 레코드 생성 가능
-- auth.uid()와 user_id가 일치하면 INSERT 가능
-- "Individual data access" 정책이 이미 ALL에 적용되어 있으므로 중복될 수 있지만,
-- 명시적으로 INSERT 정책을 추가하여 확실히 보장
CREATE POLICY "Users can insert own record" ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id::text);

-- 7. SELECT 정책: 자신의 레코드 조회 가능
CREATE POLICY "Users can view own record" ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = user_id::text);

-- 8. UPDATE 정책: 자신의 레코드 수정 가능
CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id::text)
    WITH CHECK (auth.uid()::text = user_id::text);

-- 9. 관리자는 모든 레코드 조회 가능 (무한 재귀 방지를 위해 SECURITY DEFINER 함수 사용)
-- 먼저 SECURITY DEFINER 함수 생성 (RLS를 우회하여 admin 여부 확인)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_param TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- RLS를 우회하여 직접 users 테이블 조회
    SELECT role INTO user_role
    FROM public.users
    WHERE public.users.user_id = user_id_param;
    
    RETURN user_role = 'admin';
END;
$$;

-- 함수 권한 설정
GRANT EXECUTE ON FUNCTION public.is_admin(TEXT) TO authenticated;

-- 관리자 정책 생성 (무한 재귀 방지)
CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin(auth.uid()::text)
    );

-- 10. 기존 NULL role 값 업데이트
UPDATE public.users 
SET role = 'counselor' 
WHERE role IS NULL;

-- 11. 설정 완료 확인
SELECT 
    'RLS 정책 설정 완료' as status,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'users';

-- 12. users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
