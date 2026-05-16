-- Oxford 5000 vocabulary table
-- Used by app versions: en-ko (English speakers learning Korean), ko-en (Korean speakers learning English)

CREATE TABLE IF NOT EXISTS oxford_vocab (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL,
  korean_meaning TEXT NOT NULL,
  level TEXT,                        -- A1, A2, B1, B2, C1
  pos TEXT,                          -- noun, verb, adjective, adverb, phrase
  english_example TEXT,
  korean_example TEXT,
  word_audio_url TEXT,               -- TTS English word
  meaning_audio_url TEXT,            -- TTS Korean meaning
  english_example_audio_url TEXT,
  korean_example_audio_url TEXT,
  image_url TEXT,
  order_index INT,                   -- Stable ordering for Day pagination (CSV order)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT oxford_vocab_word_unique UNIQUE (word)
);

CREATE INDEX IF NOT EXISTS idx_oxford_level ON oxford_vocab(level);
CREATE INDEX IF NOT EXISTS idx_oxford_order ON oxford_vocab(order_index);

ALTER TABLE oxford_vocab ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'oxford_vocab' AND policyname = 'public read'
  ) THEN
    CREATE POLICY "public read" ON oxford_vocab FOR SELECT USING (true);
  END IF;
END$$;

-- Storage buckets:
--   oxford-images  (public)  - {word}.png
--   oxford-tts     (public)  - {word}/{word}_word_en.mp3
--                              {word}/{word}_meaning_ko.mp3
--                              {word}/{word}_example_en.mp3
--                              {word}/{word}_example_ko.mp3
--
-- Run in Supabase dashboard -> Storage -> New bucket (public).
