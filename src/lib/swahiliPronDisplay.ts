/**
 * KO 모드(한국인 학습자): DB에 한글 식 발음(예: 모자)이 있을 때
 * 스와힐리어 라틴 철자에서 로마자 음절 분리 표기(예: Mo-ja)로 바꿔 표시합니다.
 */

const HANGUL_RE = /[\uAC00-\uD7A3\u3131-\u3163\u3165-\u3186]/

export function pronunciationLooksLikeHangulStyle(s: string | null | undefined): boolean {
  if (!s?.trim()) return false
  return HANGUL_RE.test(s)
}

function isVowel(c: string): boolean {
  return 'aeiou'.includes(c)
}

/** 스와힐리어 단어(라틴)를 음절 단위로 나눔 — 최대 성모(다자모 포함) + 모음 덩어리 */
function syllabifyLatinWord(raw: string): string[] {
  const w = raw
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^a-z']/g, '')
  if (!w) return []

  const syllables: string[] = []
  let i = 0

  const skipConsonants = (j: number): number => {
    if (j >= w.length || isVowel(w[j])) return j
    if (w.startsWith("ng'", j)) return j + 3
    if (w[j] === 'n' && w[j + 1] === 'g' && w[j + 2] && isVowel(w[j + 2])) return j + 2
    const digraphs = ['ch', 'sh', 'th', 'dh', 'gh', 'kh', 'ny', 'mb', 'nd', 'nz', 'mv', 'mw', 'nj']
    for (const d of digraphs) {
      if (w.startsWith(d, j)) return j + d.length
    }
    if (/[bcdfghjklmnpqrstvwxyz']/i.test(w[j])) return j + 1
    return j
  }

  while (i < w.length) {
    let j = i
    while (j < w.length) {
      const next = skipConsonants(j)
      if (next === j) break
      j = next
    }
    if (j >= w.length) break
    if (!isVowel(w[j])) {
      i++
      continue
    }
    let k = j
    while (k < w.length && isVowel(w[k])) k++
    syllables.push(w.slice(i, k))
    i = k
  }

  if (syllables.length && i < w.length) {
    syllables[syllables.length - 1] += w.slice(i)
  }

  return syllables.length ? syllables : [w]
}

function capitalizeSyllable(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1).toLowerCase()
}

/** 단어 내 음절: 첫 음절만 대문자 시작, 나머지는 소문자 (예: Ni-na, ki-mo-ja) */
function joinSyllablesReadable(syl: string[]): string {
  if (!syl.length) return ''
  return syl
    .map((s, i) => (i === 0 ? capitalizeSyllable(s) : s.toLowerCase()))
    .join('-')
}

/** 단어 토큰(끝 문장부호 분리) → 음절 표기 */
function formatWordToken(token: string): string {
  const trailing = token.match(/[.!?,:;…]+$/u)?.[0] ?? ''
  const core = trailing ? token.slice(0, -trailing.length) : token
  const leading = core.match(/^['"([{«]+/u)?.[0] ?? ''
  const inner = leading ? core.slice(leading.length) : core
  const innerTrailing = inner.match(/['")\]}».,!?;:…]+$/u)?.[0] ?? ''
  const word = innerTrailing ? inner.slice(0, -innerTrailing.length) : inner
  if (!word || !/[a-z]/i.test(word)) return token
  const syl = syllabifyLatinWord(word)
  const body = joinSyllablesReadable(syl)
  return `${leading}${body}${innerTrailing}${trailing}`
}

/**
 * 스와힐리어 문장/구를 공백 기준으로 나눠 각 라틴 단어에 음절 하이픈 표기 적용
 */
export function romanSyllableGuideFromSwahiliLatin(text: string | null | undefined): string | null {
  if (!text?.trim()) return null
  const parts = text.split(/(\s+)/)
  const out = parts.map((p) => {
    if (/^\s+$/.test(p)) return p
    return formatWordToken(p)
  })
  return out.join('')
}

/**
 * KO 모드 단어/예문 발음 표시값
 * - 수동 오버라이드(로마자)는 그대로
 * - 한글 식·비어 있으면 스와힐리어 원문에서 생성
 */
export function koModeSwahiliPronDisplay(
  swahiliSource: string | null | undefined,
  dbPron: string | null | undefined,
  overridePron?: string | null,
): string | null {
  const chosen = (overridePron ?? '').trim() || (dbPron ?? '').trim()
  if (chosen && !pronunciationLooksLikeHangulStyle(chosen)) {
    return chosen
  }
  if (!swahiliSource?.trim()) return chosen || null
  const guide = romanSyllableGuideFromSwahiliLatin(swahiliSource)
  return guide ?? (chosen || null)
}
