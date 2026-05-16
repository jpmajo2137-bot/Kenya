// Oxford 전용 필터 유틸 (SW-KO 의 `filterUtils.ts` 와 같은 역할).
//
// Oxford 단어장은 두 종류의 필터를 지원한다:
//   - DB `category` 컬럼 기반 (입문/초급/중급/고급/여행/비즈니스/쇼핑/위기탈출)
//   - 클라이언트 분류 데이터 기반:
//       * `classified:음식/음료` 등 → `oxfordTopicClassification.ts`
//       * `pos:noun` 등           → DB `pos` 컬럼 (oxford_vocab.pos)
//       * `ordered:숫자1-50`      → 하드코딩된 숫자 단어 목록 (one~fifty)

import classification from './oxfordTopicClassification'

/**
 * EN-KO 모드(영어→한국어 학습자)에서 같은 한국어 의미를 가진 행이 여러 개
 * 보이는 것을 막기 위한 클라이언트 측 중복 제거.
 *
 * - `korean_meaning` 을 정규화한 키 기준으로 첫 등장 행만 남김.
 * - 원본 정렬을 유지하므로 호출부에서 정렬을 미리 끝낸 뒤 적용해야 한다.
 * - DB 자체는 손대지 않으므로 KO-EN(한국어→영어) 사용자에게는 영향 없음.
 */
export function dedupRowsByKoreanMeaning<T extends { korean_meaning: string | null }>(
  rows: T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    const key = (r.korean_meaning ?? '').trim()
    if (!key) {
      out.push(r)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/**
 * KO-EN(한국어→영어) 단어장 전용 dedup: 동일 `word` 가 여러 행(예: one=일/하나)
 * 으로 존재해도 화면에는 1개만 노출.
 *
 * - 카드/플래시카드/퀴즈에서 영어 단어 입장에서 보면 중복으로 보이는 문제 해결.
 * - DB 는 손대지 않으며, EN-KO 화면에는 적용하지 않는다(거기서는 한국어 의미가 다른 별개 카드).
 */
export function dedupRowsByEnglishWord<T extends { word: string | null }>(
  rows: T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    const key = (r.word ?? '').trim().toLowerCase()
    if (!key) {
      out.push(r)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export type ParsedOxfordFilter = {
  category?: string
  classified?: string
  pos?: string
  ordered?: string
}

export function parseOxfordFilter(filter: string | undefined | null): ParsedOxfordFilter {
  if (!filter) return {}
  if (filter.startsWith('classified:')) return { classified: filter.slice('classified:'.length) }
  if (filter.startsWith('pos:')) return { pos: filter.slice('pos:'.length) }
  if (filter.startsWith('ordered:')) return { ordered: filter.slice('ordered:'.length) }
  if (filter.startsWith('category:')) return { category: filter.slice('category:'.length) }
  // prefix 없는 값은 category 로 간주 (구버전 호환)
  return { category: filter }
}

/**
 * `classified:<topic>` 으로 매칭되는 Oxford 단어들의 lowercase 키 배열을 돌려준다.
 * Supabase 쿼리에서 `.in('word', words)` 로 사용한다.
 */
export function getOxfordWordsByTopic(topic: string): string[] {
  const out: string[] = []
  for (const [word, topics] of Object.entries(classification)) {
    if (topics.includes(topic as never)) out.push(word)
  }
  return out
}

/**
 * 주제별 단어 수.
 */
export function getOxfordTopicCount(topic: string): number {
  let count = 0
  for (const topics of Object.values(classification)) {
    if (topics.includes(topic as never)) count += 1
  }
  return count
}

/**
 * `ordered:숫자1-50` 등에서 사용할 숫자 단어 목록.
 * 1..30 까지 1단위 + 30 이후 10단위(40,50,60,70,80,90,100).
 * KO-EN(영어 학습자) 화면에서 표시되는 영어 단어 집합이자
 * EN-KO(한국어 학습자) 화면에서 한자어/고유어 매핑의 영어 키이다.
 */
export const NUMBER_WORDS_1_50: string[] = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
]

export function getOrderedOxfordWords(orderedKey: string): string[] {
  if (orderedKey === '숫자1-50') return NUMBER_WORDS_1_50
  return []
}

/**
 * 단일 word 에 대한 라벨 — Oxford 토픽이 비어있을 때 fallback 용.
 */
export function isOxfordWordInTopic(word: string, topic: string): boolean {
  const t = classification[word.toLowerCase().trim()]
  if (!t) return false
  return t.includes(topic as never)
}
