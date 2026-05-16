-- Add category + difficulty columns to oxford_vocab
-- Mirrors generated_vocab structure for SW-KO/KO-SW parity in the wordbook UI.
--   category   : '입문' | '초급' | '중급' | '고급' | '여행' | '비즈니스' | '쇼핑' | '위기탈출'
--   difficulty : 1..4 (1=입문 ... 4=고급, situational categories also get a difficulty for sorting)

ALTER TABLE oxford_vocab
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS difficulty SMALLINT;

CREATE INDEX IF NOT EXISTS idx_oxford_category ON oxford_vocab(category);
CREATE INDEX IF NOT EXISTS idx_oxford_difficulty ON oxford_vocab(difficulty);
