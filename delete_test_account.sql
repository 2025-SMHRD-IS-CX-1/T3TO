-- ============================================
-- Test 계정 완전 삭제
-- ⚠️ 주의: 이 스크립트는 test 계정을 완전히 삭제합니다.
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 삭제할 test 계정 확인
SELECT 
    pu.user_id,
    pu.email,
    pu.login_id,
    au.id as auth_id,
    au.email as auth_email
FROM public.users pu
LEFT JOIN auth.users au ON (
    au.id::text = pu.user_id::text OR au.id = pu.user_id::uuid
)
WHERE pu.email LIKE '%test%' OR pu.login_id LIKE '%test%'
ORDER BY pu.created_at DESC;

-- 2. Test 계정의 user_id 타입 확인
DO $$
DECLARE
    user_id_type TEXT;
    test_user_id TEXT;
    test_user_id_uuid UUID;
BEGIN
    -- user_id 타입 확인
    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'user_id';
    
    RAISE NOTICE 'user_id 타입: %', user_id_type;
    
    -- test 계정 찾기
    SELECT user_id INTO test_user_id
    FROM public.users
    WHERE email LIKE '%test%' OR login_id LIKE '%test%'
    LIMIT 1;
    
    IF test_user_id IS NULL THEN
        RAISE NOTICE 'Test 계정을 찾을 수 없습니다.';
        RETURN;
    END IF;
    
    RAISE NOTICE '삭제할 계정: %', test_user_id;
    
    -- UUID로 변환 시도
    IF user_id_type = 'uuid' THEN
        test_user_id_uuid := test_user_id::uuid;
    ELSE
        BEGIN
            test_user_id_uuid := test_user_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'UUID 변환 실패, 텍스트로 처리: %', test_user_id;
            test_user_id_uuid := NULL;
        END;
    END IF;
    
    -- public.users 삭제 (트리거가 auth.users도 자동 삭제)
    -- CASCADE DELETE가 설정되어 있으면 관련 데이터도 자동 삭제됨
    IF user_id_type = 'uuid' THEN
        DELETE FROM public.users WHERE user_id = test_user_id_uuid;
        RAISE NOTICE 'public.users에서 UUID로 삭제 완료';
    ELSE
        DELETE FROM public.users WHERE user_id = test_user_id;
        RAISE NOTICE 'public.users에서 VARCHAR로 삭제 완료';
        
        -- auth.users도 수동 삭제 (트리거가 작동하지 않은 경우)
        IF test_user_id_uuid IS NOT NULL THEN
            DELETE FROM auth.users WHERE id = test_user_id_uuid;
            RAISE NOTICE 'auth.users에서 UUID로 삭제 완료';
        ELSE
            DELETE FROM auth.users WHERE id::text = test_user_id;
            RAISE NOTICE 'auth.users에서 텍스트로 삭제 완료';
        END IF;
    END IF;
    
    RAISE NOTICE 'Test 계정 삭제 완료!';
END $$;

-- 3. 삭제 확인
SELECT 
    'public.users' as table_name,
    COUNT(*) as remaining_test_accounts
FROM public.users
WHERE email LIKE '%test%' OR login_id LIKE '%test%'

UNION ALL

SELECT 
    'auth.users' as table_name,
    COUNT(*) as remaining_test_accounts
FROM auth.users
WHERE email LIKE '%test%' AND deleted_at IS NULL;

-- 4. 관련 데이터 삭제 확인 (CASCADE가 작동했다면 모두 삭제되어야 함)
SELECT 
    'consultations' as table_name,
    COUNT(*) as remaining_records
FROM public.consultations c
WHERE EXISTS (
    SELECT 1 FROM public.users u
    WHERE (u.user_id::text = c.user_id::text OR u.user_id = c.user_id::uuid)
    AND (u.email LIKE '%test%' OR u.login_id LIKE '%test%')
)

UNION ALL

SELECT 
    'career_profiles' as table_name,
    COUNT(*) as remaining_records
FROM public.career_profiles cp
WHERE EXISTS (
    SELECT 1 FROM public.users u
    WHERE (u.user_id::text = cp.user_id::text OR u.user_id = cp.user_id::uuid)
    AND (u.email LIKE '%test%' OR u.login_id LIKE '%test%')
)

UNION ALL

SELECT 
    'career_roadmaps' as table_name,
    COUNT(*) as remaining_records
FROM public.career_roadmaps cr
WHERE EXISTS (
    SELECT 1 FROM public.users u
    WHERE (u.user_id::text = cr.user_id::text OR u.user_id = cr.user_id::uuid)
    AND (u.email LIKE '%test%' OR u.login_id LIKE '%test%')
)

UNION ALL

SELECT 
    'calendar_events' as table_name,
    COUNT(*) as remaining_records
FROM public.calendar_events ce
WHERE EXISTS (
    SELECT 1 FROM public.users u
    WHERE (u.user_id::text = ce.user_id::text OR u.user_id = ce.user_id::uuid)
    AND (u.email LIKE '%test%' OR u.login_id LIKE '%test%')
);
