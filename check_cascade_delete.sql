-- ============================================
-- 외래 키 CASCADE 설정 확인
-- public.users 삭제 시 auth.users도 삭제되는지 확인
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블의 외래 키 제약조건 확인
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    rc.update_rule
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
    AND (tc.table_name = 'users' OR ccu.table_name = 'users')
ORDER BY tc.table_name, tc.constraint_name;

-- 2. auth.users와 public.users 관계 확인
-- 일반적으로 public.users.user_id가 auth.users.id를 참조하지만,
-- CASCADE는 public.users → auth.users 방향이 아니라 auth.users → public.users 방향입니다.

-- 3. auth.users 삭제 시 public.users 자동 삭제 확인
-- auth.users에 CASCADE 트리거가 있는지 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth' 
    AND event_object_table = 'users'
    AND event_manipulation = 'DELETE';

-- 4. public.users 삭제 시 auth.users 삭제 트리거 생성 (필요 시)
-- 주의: 일반적으로는 auth.users를 삭제하면 public.users가 삭제되어야 함
-- 반대 방향(public.users 삭제 시 auth.users 삭제)은 보안상 권장되지 않음
-- 하지만 요구사항에 따라 생성 가능:

-- CREATE OR REPLACE FUNCTION public.delete_auth_user_on_public_users_delete()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = auth, public
-- AS $$
-- BEGIN
--     -- public.users 삭제 시 해당하는 auth.users도 삭제
--     DELETE FROM auth.users WHERE id::text = OLD.user_id OR id = OLD.user_id::uuid;
--     RETURN OLD;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS on_public_users_deleted ON public.users;
-- CREATE TRIGGER on_public_users_deleted
--     AFTER DELETE ON public.users
--     FOR EACH ROW
--     EXECUTE FUNCTION public.delete_auth_user_on_public_users_delete();

-- 5. 참고: 일반적인 패턴
-- auth.users 삭제 → public.users 자동 삭제 (CASCADE 또는 트리거)
-- public.users 삭제 → auth.users는 유지 (일반적)
-- 회원탈퇴 시: auth.users 삭제 → public.users 자동 삭제
