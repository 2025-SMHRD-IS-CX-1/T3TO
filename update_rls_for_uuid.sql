-- ============================================
-- user_id가 uuid로 변경된 후 RLS 정책 업데이트
-- migrate_user_id_to_uuid.sql 실행 후 실행
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 기존 RLS 정책 삭제
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Individual data access" ON public.users;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.users;
DROP POLICY IF EXISTS "Authenticated access policy" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- 2. SECURITY DEFINER 함수가 있다면 업데이트 (user_id가 uuid로 변경됨)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_param UUID)
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
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- 3. INSERT 정책: 회원가입 시 자신의 레코드 생성 가능
-- auth.uid()는 이미 uuid 타입이므로 캐스팅 불필요
CREATE POLICY "Users can insert own record" ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 4. SELECT 정책: 자신의 레코드 조회 가능
CREATE POLICY "Users can view own record" ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 5. UPDATE 정책: 자신의 레코드 수정 가능
CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. 관리자는 모든 레코드 조회 가능 (무한 재귀 방지)
CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin(auth.uid())
    );

-- 7. 정책 확인
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;
