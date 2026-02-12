-- ============================================
-- users 테이블에 role 컬럼 추가
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- role 컬럼이 없으면 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'counselor';
        CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
        RAISE NOTICE 'role 컬럼이 추가되었습니다.';
    ELSE
        RAISE NOTICE 'role 컬럼이 이미 존재합니다.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'role 컬럼 추가 중 오류 발생: %', SQLERRM;
END $$;

-- 기존 데이터에 role이 NULL인 경우 기본값 설정
UPDATE public.users 
SET role = 'counselor' 
WHERE role IS NULL;

-- users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
