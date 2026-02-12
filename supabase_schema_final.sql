-- ============================================
-- 진로 상담 서비스 ERD 생성 SQL (최종 표준화 버전)
-- ============================================

-- 1. 사용자 (상담사)
CREATE TABLE public.users (
    user_id VARCHAR(50) PRIMARY KEY,
    login_id VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_users_login_id ON public.users(login_id);
CREATE INDEX idx_users_email ON public.users(email);

-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- users 테이블 트리거
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. 상담 내역 테이블
CREATE TABLE public.consultations (
    consultation_id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    user_id VARCHAR(50) NOT NULL,
    consultation_content TEXT NOT NULL,
    consultation_round integer NOT NULL DEFAULT 1,
    session_date DATE DEFAULT CURRENT_DATE,
    duration_minutes integer,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    profile_id VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_consultations_user 
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_consultations_profile 
        FOREIGN KEY (profile_id) REFERENCES public.career_profiles(profile_id) ON DELETE CASCADE,
    CONSTRAINT chk_consultation_round 
        CHECK (consultation_round > 0),
    CONSTRAINT chk_duration_minutes 
        CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    CONSTRAINT chk_status 
        CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled'))
);

-- 인덱스 생성
CREATE INDEX idx_consultations_user_id ON public.consultations(user_id);
CREATE INDEX idx_consultations_session_date ON public.consultations(session_date);
CREATE INDEX idx_consultations_status ON public.consultations(status);

-- 트리거 생성
CREATE TRIGGER trigger_consultations_updated_at
    BEFORE UPDATE ON public.consultations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. 상담 분석 결과 
CREATE TABLE public.consultation_analysis (
    analysis_id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    consultation_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    interest_keywords TEXT,
    concern_factors TEXT,
    career_values TEXT,
    preference_conditions TEXT,
    avoidance_conditions TEXT,
    personality_traits TEXT,
    strengths TEXT,
    weaknesses TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_consultation_analysis_consultation 
        FOREIGN KEY (consultation_id) REFERENCES public.consultations(consultation_id) ON DELETE CASCADE,
    CONSTRAINT fk_consultation_analysis_user 
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE
);

-- 인덱스 생성
CREATE INDEX idx_consultation_analysis_consultation_id ON public.consultation_analysis(consultation_id);
CREATE INDEX idx_consultation_analysis_user_id ON public.consultation_analysis(user_id);

-- 트리거 생성
CREATE TRIGGER trigger_consultation_analysis_updated_at
    BEFORE UPDATE ON public.consultation_analysis
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. 진로 프로필 테이블
CREATE TABLE public.career_profiles (
    profile_id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    user_id VARCHAR(50) NOT NULL,
    analysis_id VARCHAR(50),
    client_name VARCHAR(100),
    client_email VARCHAR(100),
    gender VARCHAR(10),
    age_group VARCHAR(20),
    career_orientation TEXT,
    skill_vector TEXT,
    recommended_careers TEXT,
    career_match_scores TEXT,
    education_level VARCHAR(50),
    major VARCHAR(100),
    work_experience_years integer,
    target_company TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_career_profiles_user 
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_career_profiles_analysis 
        FOREIGN KEY (analysis_id) REFERENCES public.consultation_analysis(analysis_id) ON DELETE SET NULL,
    CONSTRAINT chk_work_experience_years 
        CHECK (work_experience_years IS NULL OR work_experience_years >= 0),
    CONSTRAINT chk_gender 
        CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say'))
);

-- 인덱스 생성
CREATE INDEX idx_career_profiles_user_id ON public.career_profiles(user_id);
CREATE INDEX idx_career_profiles_analysis_id ON public.career_profiles(analysis_id);

-- 트리거 생성
CREATE TRIGGER trigger_career_profiles_updated_at
    BEFORE UPDATE ON public.career_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. 진로 로드맵 테이블
CREATE TABLE public.career_roadmaps (
    roadmap_id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    user_id VARCHAR(50) NOT NULL,
    profile_id VARCHAR(50),
    target_job VARCHAR(100) NOT NULL,
    target_company VARCHAR(100),
    roadmap_stage VARCHAR(50) NOT NULL DEFAULT 'planning',
    milestones TEXT NOT NULL,
    required_skills TEXT,
    certifications TEXT,
    job_postings TEXT,
    timeline_months integer,
    completion_percentage integer NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_career_roadmaps_user 
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_career_roadmaps_profile 
        FOREIGN KEY (profile_id) REFERENCES public.career_profiles(profile_id) ON DELETE CASCADE, -- 내담자 삭제 시 로드맵도 삭제
    CONSTRAINT chk_completion_percentage 
        CHECK (completion_percentage BETWEEN 0 AND 100),
    CONSTRAINT chk_timeline_months 
        CHECK (timeline_months IS NULL OR timeline_months > 0),
    CONSTRAINT chk_roadmap_stage 
        CHECK (roadmap_stage IN ('planning', 'in_progress', 'review', 'completed'))
);

-- 인덱스 생성
CREATE INDEX idx_career_roadmaps_user_id ON public.career_roadmaps(user_id);
CREATE INDEX idx_career_roadmaps_profile_id ON public.career_roadmaps(profile_id);
CREATE INDEX idx_career_roadmaps_is_active ON public.career_roadmaps(is_active);

-- 트리거 생성
CREATE TRIGGER trigger_career_roadmaps_updated_at
    BEFORE UPDATE ON public.career_roadmaps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. 자기소개서 초안 테이블
CREATE TABLE public.resume_drafts (
    draft_id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    user_id VARCHAR(50) NOT NULL, -- 상담사 ID 추가
    roadmap_id VARCHAR(50), 
    profile_id VARCHAR(50) NOT NULL,
    target_position VARCHAR(100),
    target_company VARCHAR(100),
    version_type VARCHAR(20) NOT NULL DEFAULT 'initial',
    draft_content TEXT NOT NULL,
    word_count integer,
    is_selected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_resume_drafts_user
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_resume_drafts_roadmap 
        FOREIGN KEY (roadmap_id) REFERENCES public.career_roadmaps(roadmap_id) ON DELETE SET NULL,
    CONSTRAINT fk_resume_drafts_profile 
        FOREIGN KEY (profile_id) REFERENCES public.career_profiles(profile_id) ON DELETE CASCADE,
    CONSTRAINT chk_word_count 
        CHECK (word_count IS NULL OR word_count >= 0),
    CONSTRAINT chk_version_type 
        CHECK (version_type IN ('initial', 'revised', 'final', 'custom'))
);

-- 인덱스 생성
CREATE INDEX idx_resume_drafts_user_id ON public.resume_drafts(user_id);
CREATE INDEX idx_resume_drafts_roadmap_id ON public.resume_drafts(roadmap_id);
CREATE INDEX idx_resume_drafts_profile_id ON public.resume_drafts(profile_id);
CREATE INDEX idx_resume_drafts_is_selected ON public.resume_drafts(is_selected);

-- 트리거 생성
CREATE TRIGGER trigger_resume_drafts_updated_at
    BEFORE UPDATE ON public.resume_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. 캘린더 이벤트 테이블
CREATE TABLE public.calendar_events (
    event_id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    user_id VARCHAR(50) NOT NULL,
    event_title VARCHAR(200) NOT NULL,
    event_description TEXT,
    event_date DATE,
    start_time TIME,
    end_time TIME,
    event_type VARCHAR(30),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    profile_id VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_calendar_events_user 
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_calendar_events_profile
        FOREIGN KEY (profile_id) REFERENCES public.career_profiles(profile_id) ON DELETE CASCADE,
    CONSTRAINT chk_event_type 
        CHECK (event_type IS NULL OR event_type IN ('consultation', 'deadline', 'interview', 'study', 'other', 'online', 'offline'))
);

-- 인덱스 생성
CREATE INDEX idx_calendar_events_user_id ON public.calendar_events(user_id);
CREATE INDEX idx_calendar_events_event_date ON public.calendar_events(event_date);
CREATE INDEX idx_calendar_events_event_type ON public.calendar_events(event_type);
CREATE INDEX idx_calendar_events_profile_id ON public.calendar_events(profile_id);

-- 트리거 생성
CREATE TRIGGER trigger_calendar_events_updated_at
    BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- DB 차원에서 날짜 오류 해결
ALTER TABLE public.calendar_events
ADD CONSTRAINT chk_event_time_order
CHECK (
    start_time IS NULL
    OR end_time IS NULL
    OR end_time > start_time
);


-- 8. 문서 내보내기 테이블 
CREATE TABLE public.document_exports (
    export_id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    user_id VARCHAR(50) NOT NULL,
    export_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(50),
    file_format VARCHAR(20) NOT NULL,
    file_path VARCHAR(500),
    file_size_kb integer,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_document_exports_user 
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_file_size_kb 
        CHECK (file_size_kb IS NULL OR file_size_kb >= 0),
    CONSTRAINT chk_export_type 
        CHECK (export_type IN ('roadmap', 'resume', 'analysis', 'profile', 'consultation')),
    CONSTRAINT chk_file_format 
        CHECK (file_format IN ('pdf', 'docx', 'xlsx', 'json', 'html'))
);

-- 인덱스 생성
CREATE INDEX idx_document_exports_user_id ON public.document_exports(user_id);
CREATE INDEX idx_document_exports_export_type ON public.document_exports(export_type);
CREATE INDEX idx_document_exports_created_at ON public.document_exports(created_at);

-- RLS 설정 및 철저한 격리 (본인의 데이터만 조작 가능)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public') LOOP
        -- 모든 테이블 RLS 활성화
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        
        -- 기존 정책 삭제
        EXECUTE format('DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Individual data access" ON public.%I', t);
        
        -- 사용자별 데이터 격리 정책 적용 (auth.uid()와 테이블의 user_id 일치 여부 확인)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'user_id') THEN
            EXECUTE format('CREATE POLICY "Tenant isolation policy" ON public.%I 
                            FOR ALL TO authenticated 
                            USING (auth.uid()::text = user_id::text) 
                            WITH CHECK (auth.uid()::text = user_id::text)', t);
        ELSE
            -- user_id가 없는 테이블(예: 메타데이터 등)은 모든 인증된 사용자에게 허용
            EXECUTE format('CREATE POLICY "Authenticated access policy" ON public.%I 
                            FOR ALL TO authenticated 
                            USING (true) WITH CHECK (true)', t);
        END IF;
    END LOOP;
END $$;
