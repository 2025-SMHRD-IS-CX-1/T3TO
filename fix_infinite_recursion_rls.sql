-- ============================================
-- RLS 무한 재귀 문제 해결
-- "Admins can view all users" 정책이 users 테이블을 조회하면서
-- 같은 정책을 다시 트리거하는 문제를 해결
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 기존 "Admins can view all users" 정책 삭제
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- 2. SECURITY DEFINER 함수 생성 (RLS를 우회하여 admin 여부 확인)
-- 이 함수는 RLS 정책을 우회하므로 무한 재귀가 발생하지 않음
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

-- 3. 새로운 "Admins can view all users" 정책 생성 (무한 재귀 방지)
CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin(auth.uid()::text)
    );

-- 4. 함수 권한 설정 (authenticated 사용자가 사용 가능하도록)
GRANT EXECUTE ON FUNCTION public.is_admin(TEXT) TO authenticated;

-- 5. 정책 확인
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual as using_clause
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;
