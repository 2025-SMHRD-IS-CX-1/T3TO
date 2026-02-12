-- ============================================
-- 회원탈퇴 기능 완전 수정
-- public.users 삭제 시 auth.users도 자동 삭제되도록 트리거 생성
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 기존 트리거 및 함수 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE (event_object_schema = 'public' AND event_object_table = 'users')
   OR (event_object_schema = 'auth' AND event_object_table = 'users');

-- 2. public.users 삭제 시 auth.users도 삭제하는 트리거 함수 생성
CREATE OR REPLACE FUNCTION public.delete_auth_user_on_public_users_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
    user_id_type TEXT;
    auth_user_id UUID;
BEGIN
    -- user_id 타입 확인
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    -- user_id를 UUID로 변환
    IF user_id_type = 'uuid' THEN
        auth_user_id := OLD.user_id;
    ELSE
        -- VARCHAR인 경우 UUID로 변환 시도
        BEGIN
            auth_user_id := OLD.user_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            -- UUID 변환 실패 시 텍스트로 비교
            DELETE FROM auth.users WHERE id::text = OLD.user_id;
            RETURN OLD;
        END;
    END IF;
    
    -- auth.users에서 해당 사용자 삭제
    DELETE FROM auth.users WHERE id = auth_user_id;
    
    RETURN OLD;
END;
$$;

-- 3. 트리거 생성 (public.users 삭제 시 실행)
DROP TRIGGER IF EXISTS on_public_users_deleted ON public.users;
CREATE TRIGGER on_public_users_deleted
    AFTER DELETE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.delete_auth_user_on_public_users_delete();

-- 4. RPC 함수 개선 (백업용)
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
    
    -- auth.users 삭제 (트리거가 public.users도 자동 삭제)
    DELETE FROM auth.users WHERE id = user_id_param;
END;
$$;

-- 함수 권한 설정
GRANT EXECUTE ON FUNCTION public.delete_auth_user(UUID) TO authenticated;

-- 5. 트리거 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
    AND event_object_table = 'users'
    AND trigger_name = 'on_public_users_deleted';

-- 6. 테스트 (주의: 실제 사용자 데이터를 삭제하지 마세요!)
-- SELECT * FROM public.users WHERE email = 'test@example.com';
-- DELETE FROM public.users WHERE email = 'test@example.com';
-- SELECT * FROM auth.users WHERE email = 'test@example.com';

-- 7. 중요: CASCADE DELETE 설정 확인
-- setup_cascade_delete.sql을 먼저 실행하여 외래 키에 CASCADE DELETE를 설정하세요.
-- 이렇게 하면 users 삭제 시 관련된 모든 데이터도 자동으로 삭제됩니다.
