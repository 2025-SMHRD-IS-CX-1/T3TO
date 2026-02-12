-- ============================================
-- users 테이블 RLS 정책 수정
-- 회원가입 시 자신의 레코드를 INSERT할 수 있도록 설정
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블 RLS 활성화 확인
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.users;
DROP POLICY IF EXISTS "Authenticated access policy" ON public.users;

-- 3. INSERT 정책: 자신의 user_id로 레코드 생성 가능
-- 회원가입 시 auth.uid()와 user_id가 일치하므로 INSERT 가능
-- user_id도 명시적으로 text로 캐스팅하여 타입 일치 보장
CREATE POLICY "Users can insert own record" ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id::text);

-- 4. SELECT 정책: 자신의 레코드 조회 가능
CREATE POLICY "Users can view own record" ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = user_id::text);

-- 5. UPDATE 정책: 자신의 레코드 수정 가능
CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id::text)
    WITH CHECK (auth.uid()::text = user_id::text);

-- 6. 관리자는 모든 레코드 조회 가능 (무한 재귀 방지를 위해 SECURITY DEFINER 함수 사용)
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

-- 7. 현재 RLS 정책 확인
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
WHERE tablename = 'users'
ORDER BY policyname;
