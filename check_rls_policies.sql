-- ============================================
-- RLS 정책 확인 및 진단 스크립트
-- 로그인 후 대시보드 접근 문제 진단용
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 현재 users 테이블의 모든 RLS 정책 확인
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- 2. RLS가 활성화되어 있는지 확인
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'users';

-- 3. users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 4. 현재 인증된 사용자로 테스트 (실제 사용자 ID로 변경 필요)
-- 예시: 'your-user-id-here'를 실제 auth.users.id로 변경
-- SELECT auth.uid() as current_auth_uid;

-- 5. users 테이블의 샘플 데이터 확인 (RLS 정책 테스트용)
-- 주의: 이 쿼리는 RLS 정책에 따라 결과가 달라질 수 있습니다
SELECT 
    user_id,
    email,
    role,
    created_at
FROM public.users
LIMIT 10;
