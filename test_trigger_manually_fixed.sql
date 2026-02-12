-- ============================================
-- 트리거 수동 테스트 (타입 불일치 수정 버전)
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. user_id 타입 확인
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'user_id';

-- 2. 트리거 함수가 존재하는지 확인
SELECT 
    routine_name,
    routine_type,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'sync_auth_user_to_public';

-- 3. 트리거가 존재하는지 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth' 
    AND event_object_table = 'users'
    AND trigger_name = 'on_auth_user_created';

-- 4. 최근 생성된 auth.users 확인
SELECT 
    id::text as auth_id,
    email as auth_email,
    created_at,
    raw_user_meta_data->>'role' as metadata_role
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- 5. 해당 사용자들이 public.users에 있는지 확인 (타입별로 분리)
-- 먼저 user_id 타입을 확인한 후 적절한 쿼리 실행

-- 5-1. user_id가 UUID인 경우 (아래 쿼리 실행)
-- SELECT 
--     au.id::text as auth_id,
--     au.email as auth_email,
--     u.user_id::text as users_user_id,
--     u.email as users_email,
--     u.role as users_role,
--     CASE 
--         WHEN u.user_id IS NULL THEN '❌ 트리거가 작동하지 않음'
--         ELSE '✅ 트리거 작동함'
--     END as status
-- FROM auth.users au
-- LEFT JOIN public.users u ON au.id = u.user_id
-- ORDER BY au.created_at DESC
-- LIMIT 5;

-- 5-2. user_id가 VARCHAR인 경우 (아래 쿼리 실행)
-- SELECT 
--     au.id::text as auth_id,
--     au.email as auth_email,
--     u.user_id as users_user_id,
--     u.email as users_email,
--     u.role as users_role,
--     CASE 
--         WHEN u.user_id IS NULL THEN '❌ 트리거가 작동하지 않음'
--         ELSE '✅ 트리거 작동함'
--     END as status
-- FROM auth.users au
-- LEFT JOIN public.users u ON au.id::text = u.user_id
-- ORDER BY au.created_at DESC
-- LIMIT 5;

-- 6. 동적 쿼리로 자동 타입 감지하여 조회
DO $$
DECLARE
    user_id_type TEXT;
    result_count INTEGER;
BEGIN
    -- user_id 타입 확인
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    RAISE NOTICE 'user_id 타입: %', user_id_type;
    
    -- 타입에 따라 다른 쿼리 실행
    IF user_id_type = 'uuid' THEN
        RAISE NOTICE '=== UUID 타입으로 조회 ===';
        -- 결과를 변수에 저장 (실제로는 출력되지 않지만 확인 가능)
        SELECT COUNT(*) INTO result_count
        FROM auth.users au
        LEFT JOIN public.users u ON au.id = u.user_id
        WHERE u.user_id IS NOT NULL;
        
        RAISE NOTICE '매칭된 사용자 수: %', result_count;
        
        -- 실제 결과는 별도 쿼리로 확인 필요
        RAISE NOTICE '아래 쿼리를 실행하여 상세 결과 확인:';
        RAISE NOTICE 'SELECT au.id::text, au.email, u.user_id::text, u.email, u.role FROM auth.users au LEFT JOIN public.users u ON au.id = u.user_id ORDER BY au.created_at DESC LIMIT 5;';
    ELSE
        RAISE NOTICE '=== VARCHAR 타입으로 조회 ===';
        SELECT COUNT(*) INTO result_count
        FROM auth.users au
        LEFT JOIN public.users u ON au.id::text = u.user_id
        WHERE u.user_id IS NOT NULL;
        
        RAISE NOTICE '매칭된 사용자 수: %', result_count;
        
        RAISE NOTICE '아래 쿼리를 실행하여 상세 결과 확인:';
        RAISE NOTICE 'SELECT au.id::text, au.email, u.user_id, u.email, u.role FROM auth.users au LEFT JOIN public.users u ON au.id::text = u.user_id ORDER BY au.created_at DESC LIMIT 5;';
    END IF;
END $$;

-- 7. 트리거 함수 수동 실행 테스트 (가장 최근 사용자로)
DO $$
DECLARE
    test_user_id UUID;
    test_user_email TEXT;
    user_id_type TEXT;
    user_exists BOOLEAN;
BEGIN
    -- user_id 타입 확인
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    -- 가장 최근 생성된 사용자 선택
    SELECT id, email INTO test_user_id, test_user_email
    FROM auth.users
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        RAISE NOTICE '테스트 사용자: % (%)', test_user_id, test_user_email;
        RAISE NOTICE 'user_id 타입: %', user_id_type;
        
        -- public.users에 이미 있는지 확인 (타입에 따라)
        IF user_id_type = 'uuid' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.users WHERE user_id = test_user_id
            ) INTO user_exists;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM public.users WHERE user_id = test_user_id::text
            ) INTO user_exists;
        END IF;
        
        IF user_exists THEN
            RAISE NOTICE '✅ 이미 public.users에 존재합니다. 트리거가 작동했습니다.';
        ELSE
            RAISE NOTICE '❌ public.users에 없습니다. 트리거가 작동하지 않았을 수 있습니다.';
        END IF;
    ELSE
        RAISE NOTICE '테스트할 사용자가 없습니다.';
    END IF;
END $$;
