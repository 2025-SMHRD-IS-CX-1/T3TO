-- ============================================
-- 회원탈퇴 완전 수정 (강제 적용)
-- 모든 설정을 다시 확인하고 수정합니다
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- ============================================
-- 1단계: 기존 트리거 및 함수 삭제
-- ============================================

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
DROP TRIGGER IF EXISTS on_public_users_deleted ON public.users;
DROP FUNCTION IF EXISTS public.delete_auth_user_on_public_users_delete();
DROP FUNCTION IF EXISTS public.delete_public_user_on_auth_user_delete();
DROP FUNCTION IF EXISTS public.delete_auth_user(UUID);
DROP FUNCTION IF EXISTS public.delete_auth_user(TEXT);

-- ============================================
-- 2단계: user_id 타입 확인
-- ============================================

DO $$
DECLARE
    user_id_type TEXT;
BEGIN
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    RAISE NOTICE 'user_id 타입: %', user_id_type;
END $$;

-- ============================================
-- 3단계: CASCADE DELETE 설정 (강제 적용)
-- ============================================

-- 기존 외래 키 제약조건 모두 삭제
ALTER TABLE IF EXISTS public.calendar_events DROP CONSTRAINT IF EXISTS fk_calendar_events_user;
ALTER TABLE IF EXISTS public.career_profiles DROP CONSTRAINT IF EXISTS fk_career_profiles_user;
ALTER TABLE IF EXISTS public.career_roadmaps DROP CONSTRAINT IF EXISTS fk_career_roadmaps_user;
ALTER TABLE IF EXISTS public.consultation_analysis DROP CONSTRAINT IF EXISTS fk_consultation_analyses_user;
ALTER TABLE IF EXISTS public.consultations DROP CONSTRAINT IF EXISTS fk_consultations_user;
ALTER TABLE IF EXISTS public.document_exports DROP CONSTRAINT IF EXISTS fk_document_exports_user;
ALTER TABLE IF EXISTS public.resume_drafts DROP CONSTRAINT IF EXISTS fk_resume_drafts_user;

-- CASCADE DELETE로 재생성
DO $$
DECLARE
    user_id_type TEXT;
BEGIN
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    -- calendar_events
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'calendar_events') THEN
        ALTER TABLE public.calendar_events 
            ADD CONSTRAINT fk_calendar_events_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
        RAISE NOTICE 'calendar_events CASCADE 설정 완료';
    END IF;
    
    -- career_profiles
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'career_profiles') THEN
        ALTER TABLE public.career_profiles 
            ADD CONSTRAINT fk_career_profiles_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
        RAISE NOTICE 'career_profiles CASCADE 설정 완료';
    END IF;
    
    -- career_roadmaps
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'career_roadmaps') THEN
        ALTER TABLE public.career_roadmaps 
            ADD CONSTRAINT fk_career_roadmaps_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
        RAISE NOTICE 'career_roadmaps CASCADE 설정 완료';
    END IF;
    
    -- consultation_analysis
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consultation_analysis') THEN
        ALTER TABLE public.consultation_analysis 
            ADD CONSTRAINT fk_consultation_analyses_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
        RAISE NOTICE 'consultation_analysis CASCADE 설정 완료';
    END IF;
    
    -- consultations
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consultations') THEN
        ALTER TABLE public.consultations 
            ADD CONSTRAINT fk_consultations_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
        RAISE NOTICE 'consultations CASCADE 설정 완료';
    END IF;
    
    -- document_exports
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_exports') THEN
        ALTER TABLE public.document_exports 
            ADD CONSTRAINT fk_document_exports_user 
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
            ON DELETE CASCADE;
        RAISE NOTICE 'document_exports CASCADE 설정 완료';
    END IF;
    
    -- resume_drafts
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
        RAISE NOTICE 'resume_drafts CASCADE 설정 완료';
    END IF;
END $$;

-- ============================================
-- 4단계: auth.users 삭제 시 public.users도 삭제하는 트리거 생성
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_public_user_on_auth_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
    user_id_type TEXT;
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
EXCEPTION WHEN OTHERS THEN
    -- 에러 발생 시에도 계속 진행
    RAISE WARNING '트리거 실행 중 에러: %', SQLERRM;
    RETURN OLD;
END;
$$;

-- 트리거 생성
CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.delete_public_user_on_auth_user_delete();

-- ============================================
-- 5단계: RPC 함수 생성 (auth.users 삭제용)
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_auth_user(user_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
    -- 현재 사용자 확인
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    -- 자신의 계정만 삭제 가능
    IF auth.uid() != user_id_param THEN
        RAISE EXCEPTION '자신의 계정만 삭제할 수 있습니다.';
    END IF;
    
    -- auth.users 삭제
    -- 트리거가 public.users도 자동 삭제하고
    -- CASCADE DELETE가 하위 데이터도 자동 삭제함
    DELETE FROM auth.users WHERE id = user_id_param;
    
    -- 삭제 확인
    IF NOT FOUND THEN
        RAISE EXCEPTION '사용자를 찾을 수 없습니다.';
    END IF;
END;
$$;

-- 함수 권한 설정
GRANT EXECUTE ON FUNCTION public.delete_auth_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_auth_user(UUID) TO anon;

-- ============================================
-- 6단계: 확인
-- ============================================

-- 트리거 확인
SELECT 
    '트리거' as check_type,
    trigger_name,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'auth' 
    AND event_object_table = 'users'
    AND trigger_name = 'on_auth_user_deleted'

UNION ALL

SELECT 
    'RPC 함수' as check_type,
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'delete_auth_user'

UNION ALL

SELECT 
    'CASCADE' as check_type,
    tc.table_name,
    tc.constraint_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.constraint_name LIKE '%user%'
ORDER BY check_type, table_name;
