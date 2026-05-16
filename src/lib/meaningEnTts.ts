/** 영어 뜻에 섞인 한글(예: necessarily; 반드시) 제거 — 표시·TTS 공통 */
export function stripKoreanFromEnDisplay(text: string): string {
  if (!text.trim()) return text
  const segments = text.split(';').map((s) => s.trim()).filter(Boolean)
  const enOnly = segments.filter((s) => !/[\uAC00-\uD7A3]/.test(s))
  return enOnly.length ? enOnly.join('; ') : text
}

/**
 * 영어 뜻 TTS용 교정: 슬래시를 읽지 않게 함.
 * - "A / B" (띄어쓴 병기) → 앞 구절만
 * - "at/on", "jump at/on" → "at or on", "jump at or on"
 * - "and/or" → "and or"
 */
export function sanitizeEnglishGlossForTts(text: string): string {
  let s = text.trim()
  if (!s || s === '—') return s
  s = (s.split(/\s+\/\s+/, 2)[0] ?? s).trim()
  s = s.replace(/\band\/or\b/gi, 'and or')
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/([a-zA-Z]+)\/([a-zA-Z]+)/g, '$1 or $2')
  }
  return s.trim()
}

/** 첫 `;` 구절 기준 — 저장된 meaning_en mp3 대신 클라이언트 TTS를 쓸지 */
export function meaningEnGlossNeedsSlashTtsFix(displayEn: string): boolean {
  const first = stripKoreanFromEnDisplay(displayEn).split(';')[0].trim()
  if (!first || first === '—') return false
  if (/\s+\/\s+/.test(first)) return true
  if (/\band\/or\b/i.test(first)) return true
  return /[a-zA-Z]\/[a-zA-Z]/.test(first)
}

/** meaning_en 한 줄(또는 첫 `;` 앞)에 대해 TTS에 넘길 문자열 */
export function englishGlossLineForTts(raw: string): string {
  const first = stripKoreanFromEnDisplay(raw).split(';')[0].trim()
  return sanitizeEnglishGlossForTts(first)
}

export type TtsCompareLang = 'sw' | 'ko' | 'en'

/**
 * 한국어 TTS 발음 교정 맵.
 * TTS 엔진이 발음 규칙(예: 조사 '의'→'에')으로 잘못 읽는 단어를
 * 음가가 동일한 다른 표기로 교체하여 올바르게 발음시킨다.
 */
const KO_TTS_PHONETIC_OVERRIDE: Record<string, string> = {
  '최근의': '최근 으이',
}

/**
 * 한국어/스와힐리어 단어·예문 TTS용 정제.
 * - 괄호 내용 제거(예: "예비(의)" → "예비")
 * - 슬래시는 ", " 로 (병기처럼 발음)
 * - 양 끝 문장부호/공백 정리
 */
export function sanitizeWordPhraseForTts(text: string): string {
  let s = (text ?? '').trim()
  if (!s) return s
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ')
  s = s.replace(/\s*\[[^\]]*\]\s*/g, ' ')
  s = s.replace(/\s*\/\s*/g, ', ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/** 화면 표시 텍스트를 언어별 TTS용 문자열로 변환 */
export function ttsTextFor(displayText: string, lang: TtsCompareLang): string {
  if (!displayText) return displayText
  if (lang === 'en') return englishGlossLineForTts(displayText)
  if (lang === 'ko' && KO_TTS_PHONETIC_OVERRIDE[displayText]) {
    return KO_TTS_PHONETIC_OVERRIDE[displayText]
  }
  return sanitizeWordPhraseForTts(displayText)
}

/** 비교용 정규화 — 공백/대소문자/문장부호 차이는 무시 */
export function normalizeForTtsCompare(text: string, lang: TtsCompareLang): string {
  if (!text) return ''
  let s = lang === 'en' ? stripKoreanFromEnDisplay(text).split(';')[0] : text
  s = s.toLowerCase()
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ')
  s = s.replace(/\s*\[[^\]]*\]\s*/g, ' ')
  s = s.replace(/[~·.,!?;:'"`/\\—–\-]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/** 화면 표시 텍스트가 DB 원본과 다르면 클라이언트 TTS(브라우저/캐시)로 읽어야 함 */
export function shouldUseClientTts(
  displayText: string | null | undefined,
  dbText: string | null | undefined,
  lang: TtsCompareLang,
): boolean {
  const d = (displayText ?? '').trim()
  if (!d) return false
  const db = (dbText ?? '').trim()
  if (!db) return true
  return normalizeForTtsCompare(d, lang) !== normalizeForTtsCompare(db, lang)
}
