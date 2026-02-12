-- ============================================
-- user_id가 UUID로 변경된 후 모든 테이블의 RLS 정책 재생성
-- migrate_user_id_to_uuid.sql 실행 후 실행
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블 RLS 정책 (update_rls_for_uuid.sql에서 처리됨)
-- 이 파일은 users 테이블 외의 다른 테이블들을 위한 것입니다

-- 2. SECURITY DEFINER 함수 업데이트 (UUID 타입용)
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

-- 3. user_id를 사용하는 모든 테이블에 RLS 정책 생성
-- auth.uid()는 이미 UUID 타입이므로 캐스팅 불필요

-- calendar_events 테이블
CREATE POLICY "Users can access own calendar events" ON public.calendar_events
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- career_profiles 테이블
CREATE POLICY "Users can access own career profiles" ON public.career_profiles
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- career_roadmaps 테이블
CREATE POLICY "Users can access own career roadmaps" ON public.career_roadmaps
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- consultation_analysis 테이블
CREATE POLICY "Users can access own consultation analysis" ON public.consultation_analysis
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- consultations 테이블
CREATE POLICY "Users can access own consultations" ON public.consultations
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- document_exports 테이블
CREATE POLICY "Users can access own document exports" ON public.document_exports
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- resume_drafts 테이블 (user_id가 없을 수 있으므로 확인 필요)
-- profile_id를 통해 간접적으로 접근 제어할 수 있음

-- 4. 관리자는 모든 데이터 조회 가능 (선택사항)
-- 필요시 각 테이블에 관리자 정책 추가 가능

-- 5. 정책 확인
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename IN (
    'users',
    'calendar_events',
    'career_profiles',
    'career_roadmaps',
    'consultation_analysis',
    'consultations',
    'document_exports'
)
ORDER BY tablename, policyname;
