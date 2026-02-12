-- ============================================
-- 회원탈퇴 기능 설정
-- auth.users 삭제 시 public.users 자동 삭제 확인 및 설정
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 외래 키 제약조건 확인
-- public.users의 다른 테이블들이 user_id를 참조하는 경우 CASCADE 설정 확인
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_name = 'users'
    AND ccu.column_name = 'user_id'
ORDER BY tc.table_name;

-- 2. auth.users 삭제 시 public.users 자동 삭제 트리거 생성
-- auth.users가 삭제되면 public.users도 자동으로 삭제되도록 설정
CREATE OR REPLACE FUNCTION public.delete_public_user_on_auth_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    IF user_id_type = 'uuid' THEN
        DELETE FROM public.users WHERE user_id = OLD.id;
    ELSE
        DELETE FROM public.users WHERE user_id = OLD.id::text;
    END IF;
    
    RETURN OLD;
END;
$$;

-- 트리거 생성
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.delete_public_user_on_auth_user_delete();

-- 3. 트리거 확인
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

-- 4. 참고: 회원탈퇴 프로세스
-- 1) 클라이언트에서 deleteAccount() 호출
-- 2) public.users 삭제 (수동)
-- 3) auth.users 삭제 (Supabase Admin API 또는 RPC 함수 필요)
-- 4) on_auth_user_deleted 트리거가 public.users 자동 삭제 (이미 삭제되었으므로 무시됨)

-- 5. RPC 함수로 auth.users 삭제 (선택사항)
-- SECURITY DEFINER 함수로 auth.users 삭제 가능
CREATE OR REPLACE FUNCTION public.delete_auth_user(user_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
    -- 현재 사용자만 자신의 계정을 삭제할 수 있도록 확인
    IF auth.uid() != user_id_param THEN
        RAISE EXCEPTION '자신의 계정만 삭제할 수 있습니다.';
    END IF;
    
    -- auth.users 삭제 (트리거가 public.users도 자동 삭제)
    DELETE FROM auth.users WHERE id = user_id_param;
END;
$$;

-- 함수 권한 설정
GRANT EXECUTE ON FUNCTION public.delete_auth_user(UUID) TO authenticated;
