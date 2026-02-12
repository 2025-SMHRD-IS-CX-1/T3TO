-- ============================================
-- 회원가입 시 users 테이블 INSERT 문제 해결
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블의 모든 RLS 정책 확인
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

-- 2. 기존 INSERT 정책 삭제
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Individual data access" ON public.users;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.users;

-- 3. user_id 타입 확인
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'user_id';

-- 4. INSERT 정책 재생성
-- user_id가 UUID인 경우
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'user_id'
            AND data_type = 'uuid'
    ) THEN
        -- UUID 타입인 경우
        CREATE POLICY "Users can insert own record" ON public.users
            FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = user_id);
        
        RAISE NOTICE 'UUID 타입용 INSERT 정책 생성 완료';
    ELSE
        -- VARCHAR 타입인 경우
        CREATE POLICY "Users can insert own record" ON public.users
            FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid()::text = user_id::text);
        
        RAISE NOTICE 'VARCHAR 타입용 INSERT 정책 생성 완료';
    END IF;
END $$;

-- 5. 정책 확인
SELECT 
    policyname,
    cmd,
    with_check
FROM pg_policies
WHERE tablename = 'users' AND cmd = 'INSERT';

-- 6. 테스트용: 현재 인증된 사용자로 INSERT 테스트 (실제로는 실행하지 않음)
-- INSERT INTO public.users (user_id, email, login_id, password_hash, role)
-- VALUES (auth.uid(), 'test@example.com', 'test@example.com', 'SUPABASE_AUTH', 'counselor');
