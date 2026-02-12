-- Drop previous tables if they exist to avoid conflicts (Optional)
-- DROP TABLE IF EXISTS public.document_exports;
-- DROP TABLE IF EXISTS public.calendar_events;
-- DROP TABLE IF EXISTS public.resume_drafts;
-- DROP TABLE IF EXISTS public.career_roadmaps;
-- DROP TABLE IF EXISTS public.career_profiles;
-- DROP TABLE IF EXISTS public.consultation_analysis;
-- DROP TABLE IF EXISTS public.consultations;
-- DROP TABLE IF EXISTS public.users_info;

-- 1. USER TABLE (Counselor Information)
CREATE TABLE public.users_info (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  login_id varchar(50),
  email varchar(100) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. CONSULTATION TABLE
CREATE TABLE public.consultations (
  consultation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_info(user_id),
  consultation_content text NOT NULL,
  consultation_round integer DEFAULT 1 NOT NULL,
  session_date date,
  duration_minutes integer,
  status varchar(20) DEFAULT 'draft' NOT NULL, -- draft, completed, analyzed
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. CONSULTATION ANALYSIS TABLE
CREATE TABLE public.consultation_analysis (
  analysis_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(consultation_id),
  user_id uuid NOT NULL REFERENCES public.users_info(user_id),
  interest_keywords text,
  concern_factors text,
  "values" text,
  preference_conditions text,
  avoidance_conditions text,
  personality_traits text,
  strengths text,
  weaknesses text
);

-- 4. CAREER PROFILE TABLE
-- Note: 'user_id' is NOT unique here to allow one Counselor to manage multiple Clients.
-- Added 'client_name' and 'client_email' for UI requirements.
CREATE TABLE public.career_profiles (
  profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_info(user_id),
  analysis_id uuid REFERENCES public.consultation_analysis(analysis_id),
  client_name varchar(100) NOT NULL, -- Added for UI
  client_email varchar(100), -- Added for UI
  gender varchar(10),
  age_group varchar(20),
  career_orientation text,
  skill_vector text,
  recommended_careers text,
  career_match_scores text,
  education_level varchar(50),
  major varchar(100),
  work_experience_years integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. CAREER ROADMAP TABLE
CREATE TABLE public.career_roadmaps (
  roadmap_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_info(user_id),
  profile_id uuid REFERENCES public.career_profiles(profile_id),
  target_job varchar(100) NOT NULL,
  target_company varchar(100),
  roadmap_stage varchar(50) DEFAULT 'planning' NOT NULL,
  milestones text NOT NULL,
  required_skills text,
  certifications text,
  job_postings text,
  timeline_months integer,
  completion_percentage integer DEFAULT 0,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. RESUME DRAFT TABLE
CREATE TABLE public.resume_drafts (
  draft_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.career_roadmaps(roadmap_id),
  profile_id uuid NOT NULL REFERENCES public.career_profiles(profile_id),
  target_position varchar(100),
  target_company varchar(100),
  version_type varchar(20) NOT NULL,
  draft_content text NOT NULL,
  word_count integer,
  selected boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. CALENDAR EVENT TABLE
CREATE TABLE public.calendar_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_info(user_id),
  event_title varchar(200) NOT NULL,
  event_content text,
  start_datetime timestamp with time zone DEFAULT now(), -- Uncommented and enabled
  event_type varchar(50) DEFAULT 'online', -- Added for UI
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 8. DOCUMENT EXPORT TABLE
CREATE TABLE public.document_exports (
  export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_info(user_id),
  export_type varchar(50) NOT NULL,
  reference_id uuid,
  file_format varchar(20) NOT NULL,
  file_path varchar(500),
  file_size_kb integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- RLS & Triggers
ALTER TABLE public.users_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for authenticated users" ON public.users_info FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.consultations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.consultation_analysis FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.career_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.career_roadmaps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.resume_drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.calendar_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.document_exports FOR ALL TO authenticated USING (true) WITH CHECK (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users_info (user_id, email, login_id)
  values (new.id, new.email, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
