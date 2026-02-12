-- ============================================
-- CASCADE DELETE 설정
-- 상담사 계정 탈퇴 시 관련 데이터도 자동 삭제되도록 설정
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. 현재 외래 키 제약조건 확인
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

-- 2. 기존 외래 키 제약조건 삭제 (CASCADE 추가를 위해)
ALTER TABLE IF EXISTS public.calendar_events DROP CONSTRAINT IF EXISTS fk_calendar_events_user;
ALTER TABLE IF EXISTS public.career_profiles DROP CONSTRAINT IF EXISTS fk_career_profiles_user;
ALTER TABLE IF EXISTS public.career_roadmaps DROP CONSTRAINT IF EXISTS fk_career_roadmaps_user;
ALTER TABLE IF EXISTS public.consultation_analysis DROP CONSTRAINT IF EXISTS fk_consultation_analyses_user;
ALTER TABLE IF EXISTS public.consultations DROP CONSTRAINT IF EXISTS fk_consultations_user;
ALTER TABLE IF EXISTS public.document_exports DROP CONSTRAINT IF EXISTS fk_document_exports_user;
ALTER TABLE IF EXISTS public.resume_drafts DROP CONSTRAINT IF EXISTS fk_resume_drafts_user;

-- 3. CASCADE DELETE가 포함된 외래 키 제약조건 재생성
-- users 테이블의 user_id가 삭제되면 관련된 모든 데이터도 자동 삭제됨

-- calendar_events
ALTER TABLE public.calendar_events 
    ADD CONSTRAINT fk_calendar_events_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
    ON DELETE CASCADE;

-- career_profiles (내담자 프로필)
ALTER TABLE public.career_profiles 
    ADD CONSTRAINT fk_career_profiles_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
    ON DELETE CASCADE;

-- career_roadmaps (로드맵)
ALTER TABLE public.career_roadmaps 
    ADD CONSTRAINT fk_career_roadmaps_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
    ON DELETE CASCADE;

-- consultation_analysis (상담 분석)
ALTER TABLE public.consultation_analysis 
    ADD CONSTRAINT fk_consultation_analyses_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
    ON DELETE CASCADE;

-- consultations (상담 기록)
ALTER TABLE public.consultations 
    ADD CONSTRAINT fk_consultations_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
    ON DELETE CASCADE;

-- document_exports (문서 내보내기)
ALTER TABLE public.document_exports 
    ADD CONSTRAINT fk_document_exports_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id) 
    ON DELETE CASCADE;

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

-- 4. 확인: CASCADE DELETE가 설정되었는지 확인
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ CASCADE 설정됨'
        ELSE '❌ CASCADE 설정 안됨'
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

-- 5. 참고: 삭제 순서
-- users 삭제 시 자동으로 다음 순서로 삭제됨:
-- 1. resume_drafts (roadmap_id, profile_id를 통해 간접 참조)
-- 2. career_roadmaps
-- 3. career_profiles
-- 4. consultation_analysis
-- 5. consultations
-- 6. calendar_events
-- 7. document_exports
-- 8. auth.users (트리거에 의해)

-- 6. 주의사항
-- - career_profiles는 내담자 정보를 포함하므로, 상담사 탈퇴 시 내담자 정보도 함께 삭제됩니다.
-- - 만약 내담자 정보를 보존해야 한다면, 별도의 테이블로 분리하거나 soft delete를 고려하세요.
