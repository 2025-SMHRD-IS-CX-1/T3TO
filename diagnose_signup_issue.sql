-- ============================================
-- 회원가입 INSERT 실패 문제 즉시 진단
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. RLS 활성화 여부 확인
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'users';

-- 3. INSERT 정책 확인 (가장 중요!)
SELECT 
    policyname,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename = 'users' AND cmd = 'INSERT';

-- 4. 모든 RLS 정책 확인
SELECT 
    policyname,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY cmd, policyname;

-- 5. INSERT 정책이 없으면 생성
DO $$
DECLARE
    user_id_type TEXT;
    has_insert_policy BOOLEAN;
BEGIN
    -- user_id 타입 확인
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    -- INSERT 정책 존재 여부 확인
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND cmd = 'INSERT'
    ) INTO has_insert_policy;
    
    RAISE NOTICE 'user_id 타입: %', user_id_type;
    RAISE NOTICE 'INSERT 정책 존재: %', has_insert_policy;
    
    -- INSERT 정책이 없으면 생성
    IF NOT has_insert_policy THEN
        IF user_id_type = 'uuid' THEN
            CREATE POLICY "Users can insert own record" ON public.users
                FOR INSERT
                TO authenticated
                WITH CHECK (auth.uid() = user_id);
            RAISE NOTICE 'UUID 타입용 INSERT 정책 생성 완료';
        ELSE
            CREATE POLICY "Users can insert own record" ON public.users
                FOR INSERT
                TO authenticated
                WITH CHECK (auth.uid()::text = user_id::text);
            RAISE NOTICE 'VARCHAR 타입용 INSERT 정책 생성 완료';
        END IF;
    ELSE
        RAISE NOTICE 'INSERT 정책이 이미 존재합니다.';
    END IF;
END $$;

-- 6. 최종 확인
SELECT 
    'INSERT 정책 확인' as check_type,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'users' AND cmd = 'INSERT';
