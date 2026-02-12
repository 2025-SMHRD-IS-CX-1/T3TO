-- ============================================
-- 트리거 확인 및 수정 (user_id UUID 타입 지원)
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 현재 트리거 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'auth' 
    AND event_object_table = 'users'
    AND trigger_name LIKE '%user%';

-- 2. 트리거 함수 확인
SELECT 
    routine_name,
    routine_type,
    security_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name IN ('sync_auth_user_to_public', 'handle_new_user')
ORDER BY routine_name;

-- 3. user_id 타입 확인
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'user_id';

-- 4. 트리거 함수 재생성 (UUID/VARCHAR 자동 감지)
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_id_type TEXT;
    user_id_value TEXT;
    role_value TEXT;
BEGIN
    -- user_id 타입 확인
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    -- UUID 타입이면 UUID로, VARCHAR면 텍스트로 변환
    IF user_id_type = 'uuid' THEN
        user_id_value := NEW.id::uuid;
    ELSE
        user_id_value := NEW.id::text;
    END IF;
    
    -- role 값 가져오기 (metadata에서 또는 기본값)
    role_value := COALESCE(NEW.raw_user_meta_data->>'role', 'counselor');
    
    -- public.users에 INSERT (트리거는 SECURITY DEFINER이므로 RLS 우회)
    -- name 컬럼이 있으면 포함, 없으면 제외
    BEGIN
        INSERT INTO public.users (user_id, email, login_id, password_hash, role, name, created_at, updated_at)
        VALUES (
            user_id_value,
            COALESCE(NEW.email, ''),
            COALESCE(NEW.email, user_id_value),
            'SUPABASE_AUTH',
            role_value,
            COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
            COALESCE(NEW.created_at, CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            login_id = EXCLUDED.login_id,
            role = COALESCE(EXCLUDED.role, public.users.role),
            updated_at = CURRENT_TIMESTAMP;
    EXCEPTION WHEN undefined_column THEN
        -- name 컬럼이 없으면 name 없이 INSERT
        INSERT INTO public.users (user_id, email, login_id, password_hash, role, created_at, updated_at)
        VALUES (
            user_id_value,
            COALESCE(NEW.email, ''),
            COALESCE(NEW.email, user_id_value),
            'SUPABASE_AUTH',
            role_value,
            COALESCE(NEW.created_at, CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            login_id = EXCLUDED.login_id,
            role = COALESCE(EXCLUDED.role, public.users.role),
            updated_at = CURRENT_TIMESTAMP;
    END;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- 에러 발생 시 상세 로그
    RAISE WARNING '트리거 실행 중 에러: %, SQLSTATE: %', SQLERRM, SQLSTATE;
    -- 트리거는 에러가 발생해도 계속 진행 (auth.users 생성은 성공)
    RETURN NEW;
END;
$$;

-- 5. 트리거 재생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_auth_user_to_public();

-- 6. 트리거 확인
SELECT 
    '트리거 설정 완료' as status,
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'auth' 
    AND event_object_table = 'users'
    AND trigger_name = 'on_auth_user_created';

-- 7. 함수 권한 확인
SELECT 
    routine_name,
    security_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'sync_auth_user_to_public';
