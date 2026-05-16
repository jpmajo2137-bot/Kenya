import type { OxfordRow } from '../screens/OxfordCloudScreen'
import type { UserWord } from '../screens/FlashcardScreen'
import {
  WORD_DISPLAY_OVERRIDE,
  EXAMPLE_DISPLAY_OVERRIDE,
  EXAMPLE_TRANSLATION_EN_OVERRIDE,
  EXAMPLE_TRANSLATION_KO_OVERRIDE,
  EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD,
  applyEnOverride,
  applyKoOverride,
} from './displayOverrides'

/**
 * Oxford 행에서 화면(`OxfordCloudScreen` / `OxfordQuizScreen` / `OxfordWrongNoteScreen` /
 * `OxfordDictionaryScreen`) 과 동일한 교정 규칙을 적용해 표시용 텍스트 4종을 미리 계산.
 *
 * Flashcard 로 흘러가는 경로(`oxfordRowToUserWord` → `convertUserWordToCloudRow` →
 * `FlashcardScreen` 렌더링) 는 SW-KO 와 공유돼 있어 `applySwOverride` 가 잘못된
 * 시점에 끼어들 수 있다. 어댑터에서 미리 정답(=교정된 값) 만 채워 넘기면, FlashcardScreen
 * 내부에서 다시 호출되는 override 함수들이 입력=출력이 되어 안전하게 통과한다.
 */
function correctedTexts(r: OxfordRow): {
  correctedKoreanWord: string
  correctedKoreanWordPron: string | null
  correctedKoreanMeaning: string
  correctedEnglishMeaning: string
  correctedKoreanExample: string | null
  correctedEnglishExample: string | null
  correctedKoreanExampleTranslation: string | null
  correctedEnglishExampleTranslation: string | null
} {
  const koOverride = WORD_DISPLAY_OVERRIDE[r.korean_meaning]
  const correctedKoreanWord = koOverride?.word ?? r.korean_meaning
  const correctedKoreanWordPron = koOverride?.pron ?? null

  // KO meaning (학습 대상 = 영어 인 KO-EN 모드의 모국어 글로스)
  const correctedKoreanMeaning = applyKoOverride(r.word, correctedKoreanWord) ?? correctedKoreanWord

  // EN meaning (학습 대상 = 한국어 인 EN-KO 모드의 모국어 글로스)
  // 본 모드에서는 r.word(영어 단어) 자체가 모국어 글로스다.
  const correctedEnglishMeaning = applyEnOverride(r.word, r.korean_meaning) ?? r.word

  // 예문: 한국어 측은 EXAMPLE_DISPLAY_OVERRIDE.text (텍스트 교정).
  //   - EN-KO 모드에서는 학습 카드에 노출되는 예문 본문.
  //   - KO-EN 모드에서는 영어 예문 옆/뒷면의 모국어 번역.
  const koExampleOverride = r.korean_example
    ? EXAMPLE_DISPLAY_OVERRIDE[r.korean_example]
    : undefined
  const baseKoExample = koExampleOverride?.text ?? r.korean_example
  // 단어별 예문 번역 교정 (EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD) 우선 검색.
  // - EN-KO: 한국어 예문은 학습 본문이므로 보통 그대로 두고, 단어별 번역 교정의 ko 만 교정 대상.
  // - KO-EN: 한국어 예문은 영어 예문의 번역. 단어별 교정의 ko 가 들어오면 우선 적용.
  const wordTransOverride = r.word
    ? EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD[r.word]
    : undefined
  const koExampleByWord = wordTransOverride?.ko ?? null

  const correctedKoreanExample = baseKoExample ?? null

  // 예문 한국어 번역 (KO-EN 학습자가 영어 예문 아래에 보는 한국어 번역)
  const correctedKoreanExampleTranslation = (() => {
    if (koExampleByWord) return koExampleByWord
    if (!r.korean_example) return baseKoExample ?? null
    return EXAMPLE_TRANSLATION_KO_OVERRIDE[r.korean_example] ?? baseKoExample ?? null
  })()

  // 영어 예문 본문 / 영어 번역
  const baseEnExample = r.english_example
    ? (EXAMPLE_TRANSLATION_EN_OVERRIDE[r.english_example] ?? r.english_example)
    : r.english_example
  const correctedEnglishExample = wordTransOverride?.en ?? baseEnExample ?? null
  const correctedEnglishExampleTranslation = correctedEnglishExample

  return {
    correctedKoreanWord,
    correctedKoreanWordPron,
    correctedKoreanMeaning,
    correctedEnglishMeaning,
    correctedKoreanExample,
    correctedEnglishExample,
    correctedKoreanExampleTranslation,
    correctedEnglishExampleTranslation,
  }
}

/**
 * Oxford 5000 행을 FlashcardScreen 의 `UserWord` 형태로 매핑한다.
 *
 * FlashcardScreen 내부 규약:
 *  - `convertUserWordToCloudRow` 는 `word: item.sw` 를 항상 사용 (학습 대상 단어 슬롯)
 *  - mode === 'sw' → meaning은 `meaning_sw → meaning_en` 순서로 사용 (Oxford EN-KO에서는 영어 meaning이 en 슬롯)
 *  - mode === 'ko' → meaning은 `meaning_ko → meaning_en` 순서로 사용 (Oxford KO-EN에서는 한국어 meaning이 ko 슬롯)
 *  - 카드 앞면 단어 audio lang = `mode === 'ko' ? 'sw' : 'ko'` (URL 있으면 그대로 재생됨)
 *
 * 두 방향:
 *  - EN-KO (영어 사용자가 한국어 학습): koreanIsTarget = true, mode='sw'
 *      sw 슬롯 = 한국어 단어, en 슬롯 = 영어 뜻
 *  - KO-EN (한국어 사용자가 영어 학습): koreanIsTarget = false, mode='ko'
 *      sw 슬롯 = 영어 단어, ko 슬롯 = 한국어 뜻
 *
 * 어댑터는 `displayOverrides.ts` 의 모든 교정(단어 표기, 한국어/영어 뜻, 예문, 예문 번역)을
 * 미리 적용해 UserWord 에 채운다 → 다운스트림(FlashcardScreen) 의 후속 override 가
 * idempotent 하게 통과한다.
 */
export function oxfordRowToUserWord(r: OxfordRow, koreanIsTarget: boolean): UserWord {
  const c = correctedTexts(r)

  if (koreanIsTarget) {
    return {
      id: r.id,
      sw: c.correctedKoreanWord,
      ko: c.correctedKoreanMeaning,
      en: c.correctedEnglishMeaning,
      example: c.correctedKoreanExample ?? undefined,
      exampleKo: c.correctedKoreanExample ?? undefined,
      exampleEn: c.correctedEnglishExample ?? undefined,
      word_audio_url: r.meaning_audio_url ?? null,
      image_url: r.image_url ?? null,
      meaning_audio_url: r.word_audio_url ?? null,
      example_audio_url: r.korean_example_audio_url ?? null,
      example_translation_audio_url: r.english_example_audio_url ?? null,
      // EN-KO: 한국어 단어 발음 가이드 (예: 한자어/고유어 활용형)
      word_pronunciation: c.correctedKoreanWordPron,
      isOxford: true,
    }
  }
  return {
    id: r.id,
    sw: r.word,
    ko: c.correctedKoreanMeaning,
    en: c.correctedEnglishMeaning,
    example: c.correctedEnglishExample ?? undefined,
    exampleKo: c.correctedKoreanExampleTranslation ?? undefined,
    exampleEn: c.correctedEnglishExample ?? undefined,
    word_audio_url: r.word_audio_url ?? null,
    image_url: r.image_url ?? null,
    meaning_audio_url: r.meaning_audio_url ?? null,
    example_audio_url: r.english_example_audio_url ?? null,
    example_translation_audio_url: r.korean_example_audio_url ?? null,
    // KO-EN: 영어 단어 아래 한글 발음 가이드(예: one→"원")
    word_pronunciation: r.word_pron_ko ?? null,
    isOxford: true,
  }
}

export function oxfordRowsToUserWords(rows: OxfordRow[], koreanIsTarget: boolean): UserWord[] {
  return rows.map((r) => oxfordRowToUserWord(r, koreanIsTarget))
}
