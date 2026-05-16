/**
 * 한국어 → 라틴 로마자 표기 변환 (Revised Romanization 간이판 + 연음 규칙).
 *
 * 목적: 한국어 학습자(EN/SW 모국어)가 한글을 못 읽어도 발음을 가늠할 수 있게
 * 단어 바로 아래에 표시할 가이드를 만든다.
 *
 * 정책:
 *   - 음절 단위로 초성+중성+종성을 매핑하고 음절 사이 하이픈으로 연결.
 *     예) "자전거" → "Ja-jeon-geo"
 *         "안녕하세요" → "An-nyeong-ha-se-yo"
 *   - 연음 규칙: 받침이 있고 다음 음절의 초성이 ㅇ(무음)이면
 *     받침을 다음 음절의 초성 자리로 이동.
 *     예) "있어요" → "I-sseo-yo"  (받침 ㅆ → 다음 sseo)
 *         "걸었어요" → "Geo-reo-sseo-yo"
 *         "음악" → "Eu-mak"
 *         "좋아" → "Jo-a" (받침 ㅎ 소실)
 *   - 받침 ㅇ(ng)은 연음 안 함. 복합 받침은 단순화 표기 유지.
 *   - 자음동화/구개음화 등 추가 음운변화는 적용하지 않음 — 가독성 우선.
 *   - 한글이 한 글자도 없으면 null 반환.
 */

const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3

const INITIALS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj',
  'ch', 'k', 't', 'p', 'h',
] as const

const MEDIALS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe',
  'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
] as const

// 종성 매핑: [받침 그대로 표기, 연음 시 다음 초성 표기]
// - 받침 그대로 표기는 한국어 7대 받침 발음(k/n/t/l/m/p/ng)으로 단순화.
// - 연음 표기는 원래 자음의 라틴 표기.
// - ㅇ받침(21)의 link='' → 연음하지 않음.
// - ㅎ받침(27)의 link='' → 연음 시 ㅎ 소실 (좋아 → "Jo-a").
const FINALS: ReadonlyArray<readonly [string, string]> = [
  ['', ''],     // 0: 받침 없음
  ['k', 'g'],   // 1: ㄱ
  ['k', 'kk'],  // 2: ㄲ
  ['k', 'ks'],  // 3: ㄳ (복합)
  ['n', 'n'],   // 4: ㄴ
  ['n', 'nj'], // 5: ㄵ (복합)
  ['n', 'nh'], // 6: ㄶ (복합)
  ['t', 'd'],   // 7: ㄷ
  ['l', 'r'],   // 8: ㄹ
  ['k', 'lg'], // 9: ㄺ (복합)
  ['m', 'lm'], // 10: ㄻ (복합)
  ['l', 'lb'], // 11: ㄼ (복합)
  ['l', 'ls'], // 12: ㄽ (복합)
  ['l', 'lt'], // 13: ㄾ (복합)
  ['p', 'lp'], // 14: ㄿ (복합)
  ['l', 'lh'], // 15: ㅀ (복합)
  ['m', 'm'],   // 16: ㅁ
  ['p', 'b'],   // 17: ㅂ
  ['p', 'bs'], // 18: ㅄ (복합)
  ['t', 's'],   // 19: ㅅ
  ['t', 'ss'],  // 20: ㅆ
  ['ng', ''],   // 21: ㅇ (연음 안 함)
  ['t', 'j'],   // 22: ㅈ
  ['t', 'ch'],  // 23: ㅊ
  ['k', 'k'],   // 24: ㅋ
  ['t', 't'],   // 25: ㅌ
  ['p', 'p'],   // 26: ㅍ
  ['t', ''],    // 27: ㅎ (연음 시 소실)
] as const

// 복합 받침: 연음 시 해석이 복잡하므로 가독성 위해 단순 표기 유지.
const COMPOUND_FINALS = new Set([3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18])

function isHangulSyllable(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= HANGUL_BASE && code <= HANGUL_LAST
}

function decompose(ch: string): [number, number, number] {
  const offset = ch.charCodeAt(0) - HANGUL_BASE
  const i = Math.floor(offset / 588)
  const m = Math.floor((offset % 588) / 28)
  const f = offset % 28
  return [i, m, f]
}

/** 받침이 다음 음절(초성 ㅇ)로 연음되어야 하는가? */
function shouldLink(finalIdx: number, nextInitialIdx: number): boolean {
  if (finalIdx === 0) return false           // 받침 없음
  if (finalIdx === 21) return false          // ㅇ받침
  if (COMPOUND_FINALS.has(finalIdx)) return false // 복합 받침은 그대로
  if (nextInitialIdx !== 11) return false    // 다음 초성이 ㅇ(무음)이 아님
  return true
}

function capitalize(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

/** 연속된 한글 음절들을 받아 연음 적용된 로마자 음절 시퀀스로 변환. */
function romanizeRun(triples: ReadonlyArray<readonly [number, number, number]>): string {
  if (triples.length === 0) return ''
  const n = triples.length

  // 다음 음절의 초성을 연음 결과로 덮어쓰는 경우의 값.
  const overrideInitial: (string | null)[] = new Array(n).fill(null)
  // 각 음절의 받침이 연음으로 빠지는가?
  const finalLinked: boolean[] = new Array(n).fill(false)

  for (let i = 0; i < n - 1; i++) {
    const [, , f] = triples[i]
    const [nextI] = triples[i + 1]
    if (shouldLink(f, nextI)) {
      overrideInitial[i + 1] = FINALS[f][1]
      finalLinked[i] = true
    }
  }

  const syllables: string[] = []
  for (let i = 0; i < n; i++) {
    const [iIdx, mIdx, fIdx] = triples[i]
    const initial = overrideInitial[i] ?? INITIALS[iIdx]
    const medial = MEDIALS[mIdx]
    const final = finalLinked[i] ? '' : FINALS[fIdx][0]
    syllables.push(initial + medial + final)
  }

  return syllables
    .map((s, i) => (i === 0 ? capitalize(s) : s.toLowerCase()))
    .join('-')
}

/**
 * 한국어 텍스트 → 음절별 로마자 가이드 (연음 적용).
 * 한글이 없으면 null.
 */
export function romanizeKoreanText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null
  const normalized = text.normalize('NFC')

  let hasHangul = false
  const result: string[] = []
  let buf: Array<readonly [number, number, number]> = []

  const flush = () => {
    if (buf.length === 0) return
    result.push(romanizeRun(buf))
    buf = []
  }

  for (const ch of normalized) {
    if (isHangulSyllable(ch)) {
      hasHangul = true
      buf.push(decompose(ch))
    } else {
      flush()
      result.push(ch)
    }
  }
  flush()

  if (!hasHangul) return null
  const out = result.join('').trim()
  return out || null
}

/**
 * 단어 발음 표시값 결정.
 *
 * 두 가지 컨텍스트:
 *  1) EN-KO (영어 사용자 → 한국어): source 가 한글이고 라틴 변환 가이드 필요.
 *  2) KO-EN (한국어 사용자 → 영어): source 가 영어이고 dbPron 에 한글 발음("원" 등) 저장됨.
 *
 * 우선순위:
 *  - 수동 오버라이드(`override`) 가 있으면 우선.
 *  - DB 발음(`dbPron`) 이 비어있지 않으면 그대로 사용 (한글이든 라틴이든).
 *  - 그 외에는 한글 → 라틴 자동 변환.
 */
export function koreanPronDisplay(
  source: string | null | undefined,
  dbPron?: string | null,
  override?: string | null,
): string | null {
  const overrideTrim = (override ?? '').trim()
  if (overrideTrim) return overrideTrim

  const dbTrim = (dbPron ?? '').trim()
  if (dbTrim) return dbTrim

  return romanizeKoreanText(source)
}
