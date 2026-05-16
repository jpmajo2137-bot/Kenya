/**
 * "모든 단어" 온라인 로드: DB `.range` 후 클라이언트에서 삭제·제외 행을 걸러
 * Day당 행 수가 줄어드는 문제를 방지하기 위해, 오프라인 캐시와 동일하게
 * 유효 행만 모아 번호 순서대로 Day 페이지를 자름.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { GLOBAL_WORD_EXCLUSIONS, getAllWordsNumberTailIds } from './filterUtils'

export type VocabModeDense = 'ko' | 'sw'

function isDisplayedWord(word: string | null | undefined): boolean {
  const w = word ?? ''
  if (!w || w.startsWith('__deleted__')) return false
  return !GLOBAL_WORD_EXCLUSIONS.includes(w)
}

let cachedKey = ''
let cachedIds: string[] | null = null

/** 새로고침 등 데이터 동기화 후 호출 */
export function invalidateDenseAllWordsOrderCache(): void {
  cachedKey = ''
  cachedIds = null
}

async function computeDenseOrderedValidIds(client: SupabaseClient, mode: VocabModeDense): Promise<string[]> {
  const tailIds = getAllWordsNumberTailIds(mode)
  const tailFilter = tailIds.length > 0 ? `(${tailIds.join(',')})` : ''

  const nonTailIds: string[] = []
  let from = 0
  const PAGE = 500
  for (;;) {
    let q = client
      .from('generated_vocab')
      .select('id, word')
      .eq('mode', mode)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (tailFilter) q = q.not('id', 'in', tailFilter)
    const { data, error } = await q
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) break
    for (const r of rows) {
      if (isDisplayedWord(r.word)) nonTailIds.push(String(r.id))
    }
    if (rows.length < PAGE) break
    from += PAGE
  }

  const tailOrderedValid: string[] = []
  if (tailIds.length > 0) {
    const BATCH = 100
    for (let i = 0; i < tailIds.length; i += BATCH) {
      const chunk = tailIds.slice(i, i + BATCH)
      const { data, error } = await client
        .from('generated_vocab')
        .select('id, word')
        .eq('mode', mode)
        .in('id', chunk)
      if (error) throw error
      const wordById = new Map((data ?? []).map((r) => [String(r.id), r.word]))
      for (const id of chunk) {
        if (isDisplayedWord(wordById.get(id))) tailOrderedValid.push(id)
      }
    }
  }

  return [...nonTailIds, ...tailOrderedValid]
}

/** 유효 단어만 모은 전역 순서 (숫자 꼬리 포함). 세션 내 메모이즈 */
export async function getDenseOrderedValidVocabIdsCached(
  client: SupabaseClient,
  mode: VocabModeDense,
): Promise<string[]> {
  const tailSig = getAllWordsNumberTailIds(mode).join('|')
  const key = `${mode}:${tailSig}`
  if (cachedKey === key && cachedIds != null) return cachedIds
  const ids = await computeDenseOrderedValidIds(client, mode)
  cachedKey = key
  cachedIds = ids
  return ids
}

export async function fetchGeneratedVocabByIdsOrdered(
  client: SupabaseClient,
  orderedIds: string[],
): Promise<Record<string, unknown>[]> {
  if (!orderedIds.length) return []
  const BATCH = 100
  const byId = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < orderedIds.length; i += BATCH) {
    const chunk = orderedIds.slice(i, i + BATCH)
    const { data, error } = await client.from('generated_vocab').select('*').in('id', chunk)
    if (error) throw error
    for (const r of data ?? []) {
      const row = r as Record<string, unknown>
      const id = row.id != null ? String(row.id) : ''
      if (id) byId.set(id, row)
    }
  }
  return orderedIds.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[]
}
