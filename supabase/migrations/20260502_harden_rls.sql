-- =========================================
-- K-Kiswahili-Words: RLS 강화 마이그레이션
--   - generated_vocab: 익명 INSERT/UPDATE/DELETE 차단
--   - vocabaudio Storage: 익명 업로드/삭제 차단
--   - 쓰기 작업은 Edge Function (service_role) 만 가능
--   - 모든 사용자는 읽기만 가능
--
-- ⚠️ 적용 전 백업 필수. Supabase Dashboard > SQL Editor 에서 실행하세요.
-- =========================================

-- 1. generated_vocab 테이블 RLS 활성화
ALTER TABLE IF EXISTS public.generated_vocab ENABLE ROW LEVEL SECURITY;

-- 기존 정책 모두 제거 (재정의)
DO $$ DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generated_vocab'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.generated_vocab', r.policyname);
  END LOOP;
END $$;

-- 1-1. 모든 사용자(anon + authenticated) 읽기 허용
CREATE POLICY "vocab_public_read"
  ON public.generated_vocab
  FOR SELECT
  USING (true);

-- 1-2. INSERT/UPDATE/DELETE 는 service_role 만 (Edge Function 만 사용)
--      anon/authenticated 는 명시적으로 차단됨 (정책이 없으면 RLS 활성 시 거부)
CREATE POLICY "vocab_service_insert"
  ON public.generated_vocab
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "vocab_service_update"
  ON public.generated_vocab
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "vocab_service_delete"
  ON public.generated_vocab
  FOR DELETE
  TO service_role
  USING (true);


-- =========================================
-- 2. Storage 버킷: vocabaudio
--   - 모든 사용자: 공개 URL 읽기 가능 (이미 public 버킷)
--   - INSERT/UPDATE/DELETE: service_role 만
-- =========================================

-- 기존 정책 제거
DO $$ DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'vocabaudio%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- 2-1. 공개 읽기 (벅킷이 public 인 경우 자동이지만 명시)
CREATE POLICY "vocabaudio_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'vocabaudio');

-- 2-2. 쓰기는 service_role 만
CREATE POLICY "vocabaudio_service_insert"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'vocabaudio');

CREATE POLICY "vocabaudio_service_update"
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'vocabaudio')
  WITH CHECK (bucket_id = 'vocabaudio');

CREATE POLICY "vocabaudio_service_delete"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'vocabaudio');


-- =========================================
-- 3. 검증 쿼리 (수동 실행 권장)
-- =========================================
-- SELECT * FROM pg_policies WHERE tablename = 'generated_vocab';
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
