-- ============================================
-- 자동 회원탈퇴 시스템 설정
-- 회원탈퇴 버튼 클릭 시에만 RPC로 auth.users 삭제 권한을 사용하고,
-- 트리거로 public.users 및 하위 데이터 연동 삭제
-- Supabase 대시보드 → SQL Editor에서 실행 (한 번만)
-- ============================================

-- ============================================
-- 0단계: auth.users 삭제 권한 부여 (트리거/RPC용)
-- ============================================
-- 트리거 함수와 RPC가 auth.users를 삭제할 수 있도록 권한 부여
-- 실행 주체(현재 사용자)에게 권한을 부여합니다.
DO $$
BEGIN
    EXECUTE format('GRANT USAGE ON SCHEMA auth TO %I', current_user);
    EXECUTE format('GRANT DELETE ON auth.users TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '권한 부여 중 일부 실패 (무시 가능): %', SQLERRM;
END $$;

-- ============================================
-- 1단계: CASCADE DELETE 설정
-- ============================================

ALTER TABLE IF EXISTS public.calendar_events DROP CONSTRAINT IF EXISTS fk_calendar_events_user;
ALTER TABLE IF EXISTS public.career_profiles DROP CONSTRAINT IF EXISTS fk_career_profiles_user;
ALTER TABLE IF EXISTS public.career_roadmaps DROP CONSTRAINT IF EXISTS fk_career_roadmaps_user;
ALTER TABLE IF EXISTS public.consultation_analysis DROP CONSTRAINT IF EXISTS fk_consultation_analyses_user;
ALTER TABLE IF EXISTS public.consultations DROP CONSTRAINT IF EXISTS fk_consultations_user;
ALTER TABLE IF EXISTS public.document_exports DROP CONSTRAINT IF EXISTS fk_document_exports_user;
ALTER TABLE IF EXISTS public.resume_drafts DROP CONSTRAINT IF EXISTS fk_resume_drafts_user;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'calendar_events') THEN
        ALTER TABLE public.calendar_events ADD CONSTRAINT fk_calendar_events_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'career_profiles') THEN
        ALTER TABLE public.career_profiles ADD CONSTRAINT fk_career_profiles_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'career_roadmaps') THEN
        ALTER TABLE public.career_roadmaps ADD CONSTRAINT fk_career_roadmaps_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consultation_analysis') THEN
        ALTER TABLE public.consultation_analysis ADD CONSTRAINT fk_consultation_analyses_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consultations') THEN
        ALTER TABLE public.consultations ADD CONSTRAINT fk_consultations_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_exports') THEN
        ALTER TABLE public.document_exports ADD CONSTRAINT fk_document_exports_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'resume_drafts' AND column_name = 'user_id') THEN
        ALTER TABLE public.resume_drafts ADD CONSTRAINT fk_resume_drafts_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- 2단계: auth.users 삭제 시 public.users도 삭제하는 트리거 추가
-- ============================================
-- RPC가 auth.users를 삭제하면 이 트리거가 public.users를 지우고, CASCADE로 하위 데이터도 삭제

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
DROP FUNCTION IF EXISTS public.delete_public_user_on_auth_user_delete();

CREATE OR REPLACE FUNCTION public.delete_public_user_on_auth_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
    user_id_type TEXT;
BEGIN
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id';

    IF user_id_type = 'uuid' THEN
        DELETE FROM public.users WHERE user_id = OLD.id;
    ELSE
        DELETE FROM public.users WHERE user_id = OLD.id::text;
    END IF;
    RETURN OLD;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '트리거 delete_public_user_on_auth_user_delete: %', SQLERRM;
    RETURN OLD;
END;
$$;

CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.delete_public_user_on_auth_user_delete();

-- ============================================
-- 3단계: 회원탈퇴 전용 RPC (버튼 클릭 시에만 사용, 본인 계정만 삭제)
-- ============================================
-- counselor는 평소에는 auth.users DELETE 권한이 없음.
-- 이 RPC만 회원탈퇴 버튼을 눌렀을 때 호출되며, 본인 계정만 삭제 가능하도록 제한.

DROP FUNCTION IF EXISTS public.delete_auth_user(UUID);
DROP FUNCTION IF EXISTS public.delete_auth_user(TEXT);

CREATE OR REPLACE FUNCTION public.delete_auth_user(user_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
    -- 회원탈퇴 버튼을 눌렀을 때만 호출됨. 본인 계정만 삭제 가능.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;
    IF auth.uid() != user_id_param THEN
        RAISE EXCEPTION '자신의 계정만 삭제할 수 있습니다.';
    END IF;

    -- auth.users 삭제 → 트리거가 public.users 삭제 → CASCADE로 하위 데이터 삭제
    DELETE FROM auth.users WHERE id = user_id_param;

    IF NOT FOUND THEN
        RAISE EXCEPTION '해당 사용자를 찾을 수 없습니다.';
    END IF;
END;
$$;

-- authenticated 사용자만 이 RPC 실행 가능 (회원탈퇴 버튼으로만 호출)
GRANT EXECUTE ON FUNCTION public.delete_auth_user(UUID) TO authenticated;

-- ============================================
-- 4단계: (선택) public.users 삭제 시 auth.users 삭제 트리거
-- ============================================
-- RPC 실패 시 앱에서 public.users를 먼저 삭제하는 경우를 위한 연동

DROP TRIGGER IF EXISTS on_public_users_deleted ON public.users;
DROP FUNCTION IF EXISTS public.delete_auth_user_on_public_users_delete();

CREATE OR REPLACE FUNCTION public.delete_auth_user_on_public_users_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
    user_id_type TEXT;
BEGIN
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id';

    IF user_id_type = 'uuid' THEN
        DELETE FROM auth.users WHERE id = OLD.user_id;
    ELSE
        DELETE FROM auth.users WHERE id::text = OLD.user_id;
    END IF;
    RETURN OLD;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '트리거 delete_auth_user_on_public_users_delete: %', SQLERRM;
    RETURN OLD;
END;
$$;

CREATE TRIGGER on_public_users_deleted
    AFTER DELETE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.delete_auth_user_on_public_users_delete();

-- ============================================
-- 5단계: 확인
-- ============================================

SELECT '✅ 트리거(on_auth_user_deleted)'::text as status, trigger_name::text as item_name, event_object_table::text as item_table, action_timing::text as item_detail
FROM information_schema.triggers
WHERE event_object_schema = 'auth' AND event_object_table = 'users' AND trigger_name = 'on_auth_user_deleted'
UNION ALL
SELECT '✅ 트리거(on_public_users_deleted)'::text, trigger_name::text, event_object_table::text, action_timing::text
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'users' AND trigger_name = 'on_public_users_deleted'
UNION ALL
SELECT '✅ CASCADE'::text, tc.table_name, tc.constraint_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.constraint_name LIKE '%user%' AND rc.delete_rule = 'CASCADE'
ORDER BY status, item_name;

-- ============================================
-- 동작 요약
-- 회원탈퇴 버튼 클릭 시:
-- 1. 앱이 RPC delete_auth_user(user_id) 호출 (본인만 가능, 예외적 권한)
-- 2. RPC가 auth.users 삭제
-- 3. 트리거 on_auth_user_deleted → public.users 삭제 → CASCADE로 하위 데이터 삭제
-- 4. (또는 앱이 public.users 삭제 시) 트리거 on_public_users_deleted → auth.users 삭제
-- ============================================
