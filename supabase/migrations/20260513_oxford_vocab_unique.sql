-- oxford_vocab.word UNIQUE → (word, korean_meaning) 복합 UNIQUE 로 변경.
--
-- 배경:
--   같은 영어 단어 "one"에 한국어 의미를 한자어("일")와 고유어("하나")로
--   두 행 보관할 수 있어야 한다 (EN-KO 학습자에게 두 카드 노출).
--   기존 word-only UNIQUE 제약은 이를 막아 두 번째 INSERT 가 실패한다.

BEGIN;

ALTER TABLE public.oxford_vocab
  DROP CONSTRAINT IF EXISTS oxford_vocab_word_unique;

-- 동일 (word, korean_meaning) 페어 중복만 막는 새 제약.
ALTER TABLE public.oxford_vocab
  ADD CONSTRAINT oxford_vocab_word_meaning_unique
  UNIQUE (word, korean_meaning);

COMMIT;
