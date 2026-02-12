-- ============================================
-- 완전한 회원탈퇴 시스템 설정
-- auth.users 삭제 → public.users 삭제 → 하위 데이터 삭제
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- ============================================
-- 1단계: CASCADE DELETE 설정 확인 및 추가
-- ============================================

-- 1-1. 현재 외래 키 제약조건 확인
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ CASCADE 설정됨'
        ELSE '❌ CASCADE 설정 안됨 - 수정 필요'
    END AS cascade_status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_name = 'users'
    AND ccu.column_name = 'user_id'
ORDER BY tc.table_name;

-- 1-2. 기존 외래 키 제약조건 삭제 (CASCADE 추가를 위해)
ALTER TABLE IF EXISTS public.calendar_events DROP CONSTRAINT IF EXISTS fk_calendar_events_user;
ALTER TABLE IF EXISTS public.career_profiles DROP CONSTRAINT IF EXISTS fk_career_profiles_user;
ALTER TABLE IF EXISTS public.career_roadmaps DROP CONSTRAINT IF EXISTS fk_career_roadmaps_user;
ALTER TABLE IF EXISTS public.consultation_analysis DROP CONSTRAINT IF EXISTS fk_consultation_analyses_user;
ALTER TABLE IF EXISTS public.consultations DROP CONSTRAINT IF EXISTS fk_consultations_user;
ALTER TABLE IF EXISTS public.document_exports DROP CONSTRAINT IF EXISTS fk_document_exports_user;
ALTER TABLE IF EXISTS public.resume_drafts DROP CONSTRAINT IF EXISTS fk_resume_drafts_user;

-- 1-3. CASCADE DELETE가 포함된 외래 키 제약조건 재생성
-- public.users의 user_id가 삭제되면 관련된 모든 데이터도 자동 삭제됨

-- calendar_events (일정)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'calendar_events') THEN
        ALTER TABLE public.calendar_events 
            ADD CONSTRAINT fk_calendar_events_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- career_profiles (내담자 프로필)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'career_profiles') THEN
        ALTER TABLE public.career_profiles 
            ADD CONSTRAINT fk_career_profiles_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- career_roadmaps (로드맵)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'career_roadmaps') THEN
        ALTER TABLE public.career_roadmaps 
            ADD CONSTRAINT fk_career_roadmaps_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- consultation_analysis (상담 분석)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consultation_analysis') THEN
        ALTER TABLE public.consultation_analysis 
            ADD CONSTRAINT fk_consultation_analyses_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- consultations (상담 기록)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consultations') THEN
        ALTER TABLE public.consultations 
            ADD CONSTRAINT fk_consultations_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- document_exports (문서 내보내기)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_exports') THEN
        ALTER TABLE public.document_exports 
            ADD CONSTRAINT fk_document_exports_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- resume_drafts (자기소개서 초안) - user_id 컬럼이 있는 경우
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
            AND table_name = 'resume_drafts' 
            AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.resume_drafts 
            ADD CONSTRAINT fk_resume_drafts_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- 2단계: auth.users와 public.users 연동 확인 및 트리거 설정
-- ============================================

-- 2-1. auth.users 삭제 시 public.users도 삭제하는 트리거 함수 생성
CREATE OR REPLACE FUNCTION public.delete_public_user_on_auth_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
    user_id_type TEXT;
    public_user_id TEXT;
BEGIN
    -- user_id 타입 확인
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    -- public.users에서 해당 사용자 삭제
    -- CASCADE DELETE가 설정되어 있으면 관련 데이터도 자동 삭제됨
    IF user_id_type = 'uuid' THEN
        DELETE FROM public.users WHERE user_id = OLD.id;
    ELSE
        -- VARCHAR인 경우
        DELETE FROM public.users WHERE user_id = OLD.id::text;
    END IF;
    
    RETURN OLD;
END;
$$;

-- 2-2. 트리거 생성 (auth.users 삭제 시 실행)
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.delete_public_user_on_auth_user_delete();

-- ============================================
-- 3단계: RPC 함수 생성 (auth.users 삭제용)
-- ============================================

-- 3-1. auth.users 삭제 RPC 함수 생성
CREATE OR REPLACE FUNCTION public.delete_auth_user(user_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
    -- 현재 사용자만 자신의 계정을 삭제할 수 있도록 확인
    IF auth.uid() IS NULL OR auth.uid() != user_id_param THEN
        RAISE EXCEPTION '자신의 계정만 삭제할 수 있습니다.';
    END IF;
    
    -- auth.users 삭제
    -- 트리거가 public.users도 자동 삭제하고
    -- CASCADE DELETE가 하위 데이터도 자동 삭제함
    DELETE FROM auth.users WHERE id = user_id_param;
END;
$$;

-- 3-2. 함수 권한 설정
GRANT EXECUTE ON FUNCTION public.delete_auth_user(UUID) TO authenticated;

-- ============================================
-- 4단계: 확인 쿼리
-- ============================================

-- 4-1. 트리거 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth' 
    AND event_object_table = 'users'
    AND trigger_name = 'on_auth_user_deleted';

-- 4-2. CASCADE DELETE 설정 확인
SELECT
    tc.table_name,
    tc.constraint_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ CASCADE 설정됨'
        ELSE '❌ CASCADE 설정 안됨'
    END AS cascade_status
FROM information_schema.table_constraints AS tc
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.constraint_name LIKE '%user%'
ORDER BY tc.table_name;

-- 4-3. RPC 함수 확인
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'delete_auth_user';

-- ============================================
-- 5단계: 동작 순서 설명
-- ============================================
-- 1. 사용자가 회원탈퇴 버튼 클릭
-- 2. RPC 함수 delete_auth_user() 호출 또는 auth.users 직접 삭제
-- 3. on_auth_user_deleted 트리거 실행 → public.users 삭제
-- 4. CASCADE DELETE로 다음 데이터 자동 삭제:
--    - calendar_events (일정)
--    - career_profiles (내담자 프로필)
--    - career_roadmaps (로드맵)
--    - consultation_analysis (상담 분석)
--    - consultations (상담 기록)
--    - document_exports (문서 내보내기)
--    - resume_drafts (자기소개서 초안)
-- ============================================
