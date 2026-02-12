-- resume_drafts 테이블에 user_id 컬럼이 없을 때 추가 (Supabase SQL Editor에서 실행)
-- 기존 스키마(supabase_schema.sql)에는 user_id가 없고, supabase_schema_final.sql에는 있음

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'resume_drafts' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.resume_drafts ADD COLUMN user_id VARCHAR(50);
        UPDATE public.resume_drafts rd
        SET user_id = cr.user_id
        FROM public.career_roadmaps cr
        WHERE rd.roadmap_id = cr.roadmap_id;
        UPDATE public.resume_drafts rd
        SET user_id = cp.user_id
        FROM public.career_profiles cp
        WHERE rd.user_id IS NULL AND rd.profile_id = cp.profile_id;
        ALTER TABLE public.resume_drafts ALTER COLUMN user_id SET NOT NULL;
        ALTER TABLE public.resume_drafts
            ADD CONSTRAINT fk_resume_drafts_user
            FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_resume_drafts_user_id ON public.resume_drafts(user_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'resume_drafts user_id migration: %', SQLERRM;
END $$;
