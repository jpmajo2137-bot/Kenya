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
