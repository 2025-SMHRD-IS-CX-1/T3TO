-- ============================================
-- 회원탈퇴 문제 진단
-- 현재 상태를 확인하고 문제를 찾습니다
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. users 테이블의 user_id 타입 확인
SELECT 
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'user_id';

-- 2. 트리거 확인
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    event_object_schema,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE (event_object_schema = 'public' AND event_object_table = 'users')
   OR (event_object_schema = 'auth' AND event_object_table = 'users')
ORDER BY event_object_schema, event_object_table, trigger_name;

-- 3. RPC 함수 확인
SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'delete_auth_user';

-- 4. RPC 함수 권한 확인
SELECT 
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
    AND routine_name = 'delete_auth_user';

-- 5. CASCADE DELETE 설정 확인
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ CASCADE 설정됨'
        WHEN rc.delete_rule = 'RESTRICT' THEN '❌ RESTRICT - CASCADE 필요'
        WHEN rc.delete_rule = 'NO ACTION' THEN '❌ NO ACTION - CASCADE 필요'
        ELSE '❌ ' || rc.delete_rule || ' - CASCADE 필요'
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

-- 6. 외래 키 제약조건이 없는 테이블 확인
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
    AND column_name = 'user_id'
    AND table_name IN (
        'calendar_events',
        'career_profiles',
        'career_roadmaps',
        'consultation_analysis',
        'consultations',
        'document_exports',
        'resume_drafts'
    )
    AND table_name NOT IN (
        SELECT DISTINCT tc.table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND kcu.column_name = 'user_id'
    )
ORDER BY table_name;

-- 7. 함수 존재 여부 확인
SELECT 
    EXISTS (
        SELECT 1 
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name = 'delete_auth_user'
    ) as rpc_function_exists,
    EXISTS (
        SELECT 1 
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name = 'delete_public_user_on_auth_user_delete'
    ) as trigger_function_exists;
