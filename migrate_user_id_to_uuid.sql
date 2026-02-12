-- ============================================
-- user_id 컬럼 타입을 character varying에서 uuid로 변경
-- Supabase 대시보드 → SQL Editor에서 실행
-- 주의: 기존 데이터가 있는 경우 데이터 마이그레이션이 필요합니다
-- ============================================

-- 0. 모든 테이블의 user_id 관련 RLS 정책 삭제 (컬럼 타입 변경 전 필수)
-- RLS 정책이 컬럼에 의존하고 있으면 타입 변경이 불가능합니다

-- users 테이블 RLS 정책 삭제
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Individual data access" ON public.users;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.users;
DROP POLICY IF EXISTS "Authenticated access policy" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- user_id를 사용하는 모든 테이블의 RLS 정책 삭제
DROP POLICY IF EXISTS "Individual data access" ON public.calendar_events;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.calendar_events;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.calendar_events;

DROP POLICY IF EXISTS "Individual data access" ON public.career_profiles;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.career_profiles;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.career_profiles;

DROP POLICY IF EXISTS "Individual data access" ON public.career_roadmaps;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.career_roadmaps;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.career_roadmaps;

DROP POLICY IF EXISTS "Individual data access" ON public.consultation_analysis;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.consultation_analysis;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.consultation_analysis;

DROP POLICY IF EXISTS "Individual data access" ON public.consultations;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.consultations;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.consultations;

DROP POLICY IF EXISTS "Individual data access" ON public.document_exports;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.document_exports;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.document_exports;

DROP POLICY IF EXISTS "Individual data access" ON public.resume_drafts;
DROP POLICY IF EXISTS "Tenant isolation policy" ON public.resume_drafts;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.resume_drafts;

-- 1. 기존 외래 키 제약조건 삭제
ALTER TABLE IF EXISTS public.calendar_events DROP CONSTRAINT IF EXISTS fk_calendar_events_user;
ALTER TABLE IF EXISTS public.career_profiles DROP CONSTRAINT IF EXISTS fk_career_profiles_user;
ALTER TABLE IF EXISTS public.career_roadmaps DROP CONSTRAINT IF EXISTS fk_career_roadmaps_user;
ALTER TABLE IF EXISTS public.consultation_analysis DROP CONSTRAINT IF EXISTS fk_consultation_analyses_user;
ALTER TABLE IF EXISTS public.consultations DROP CONSTRAINT IF EXISTS fk_consultations_user;
ALTER TABLE IF EXISTS public.document_exports DROP CONSTRAINT IF EXISTS fk_document_exports_user;

-- 2. users 테이블의 user_id를 uuid로 변경
-- 기존 데이터가 UUID 형식이 아닌 경우 에러가 발생할 수 있음
ALTER TABLE public.users 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- 3. 참조하는 테이블들의 user_id도 uuid로 변경
ALTER TABLE public.calendar_events 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE public.career_profiles 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE public.career_roadmaps 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE public.consultation_analysis 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE public.consultations 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE public.document_exports 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- 4. 외래 키 제약조건 재생성
ALTER TABLE public.calendar_events 
    ADD CONSTRAINT fk_calendar_events_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE public.career_profiles 
    ADD CONSTRAINT fk_career_profiles_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE public.career_roadmaps 
    ADD CONSTRAINT fk_career_roadmaps_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE public.consultation_analysis 
    ADD CONSTRAINT fk_consultation_analyses_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE public.consultations 
    ADD CONSTRAINT fk_consultations_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE public.document_exports 
    ADD CONSTRAINT fk_document_exports_user 
    FOREIGN KEY (user_id) REFERENCES public.users(user_id);

-- 5. users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 6. 참조 테이블들의 user_id 타입 확인
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
        'document_exports'
    )
ORDER BY table_name;

-- 참고: RLS 정책 재생성은 update_rls_for_uuid.sql 파일을 실행하세요
