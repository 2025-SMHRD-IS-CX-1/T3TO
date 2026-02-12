-- ============================================
-- users 테이블에 name 컬럼 추가 (선택사항)
-- name 컬럼이 필요하면 실행
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- name 컬럼이 없으면 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'name'
    ) THEN
        ALTER TABLE public.users ADD COLUMN name VARCHAR(100);
        RAISE NOTICE 'name 컬럼이 추가되었습니다.';
    ELSE
        RAISE NOTICE 'name 컬럼이 이미 존재합니다.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'name 컬럼 추가 중 오류: %', SQLERRM;
END $$;

-- users 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
