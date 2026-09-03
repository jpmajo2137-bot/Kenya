import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import type { TargetLang } from './types'
import type { OxfordRow } from '../screens/OxfordCloudScreen'
import { getFirebaseDb, hasFirebase } from './firebase'
import { putOxfordCache } from './offlineCache'

export const OXFORD_CHUNKS = 'oxford_ko_en_chunks'
export const OXFORD_META = 'oxford_ko_en_meta'

/** 한국어→영어(Oxford) 만 Firestore. en-ko 는 기존 Supabase. */
export function isKoEnOxford(targetLang: TargetLang): boolean {
  return targetLang === 'en'
}

export type OxfordQuery = {
  level?: string
  category?: string
  pos?: string
  words?: string[] | null
  ids?: string[]
  search?: string
  offset?: number
  limit?: number
}

let memory: OxfordRow[] | null = null
let inflight: Promise<OxfordRow[]> | null = null

function asRow(raw: Record<string, unknown>): OxfordRow {
  const n = (v: unknown): string | null => {
    if (v == null) return null
    const s = String(v)
    return s.length ? s : null
  }
  return {
    id: String(raw.id ?? ''),
    word: String(raw.word ?? ''),
    korean_meaning: String(raw.korean_meaning ?? ''),
    level: n(raw.level),
    pos: n(raw.pos),
    english_example: n(raw.english_example),
    korean_example: n(raw.korean_example),
    word_audio_url: n(raw.word_audio_url),
    meaning_audio_url: n(raw.meaning_audio_url),
    english_example_audio_url: n(raw.english_example_audio_url),
    korean_example_audio_url: n(raw.korean_example_audio_url),
    image_url: n(raw.image_url),
    order_index: typeof raw.order_index === 'number' ? raw.order_index : Number(raw.order_index) || null,
    category: n(raw.category),
    difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : Number(raw.difficulty) || null,
    word_pron_ko: n(raw.word_pron_ko),
    created_at: String(raw.created_at ?? ''),
  }
}

async function loadBundled(): Promise<OxfordRow[]> {
  const mod = await import('../data/oxfordKoEn.json')
  const data = (mod as { default: Record<string, unknown>[] }).default
  return data.map(asRow)
}

async function loadFromFirestore(): Promise<OxfordRow[]> {
  const db = getFirebaseDb()
  if (!db) throw new Error('Firebase is not configured')
  const snap = await getDocs(query(collection(db, OXFORD_CHUNKS), orderBy('index')))
  const rows: OxfordRow[] = []
  snap.forEach((docSnap) => {
    const items = (docSnap.data().items ?? []) as Record<string, unknown>[]
    for (const item of items) rows.push(asRow(item))
  })
  rows.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  return rows
}

export async function loadOxfordKoEnAll(): Promise<OxfordRow[]> {
  if (memory) return memory
  if (inflight) return inflight
  inflight = (async () => {
    if (hasFirebase()) {
      try {
        const rows = await loadFromFirestore()
        if (rows.length > 0) {
          memory = rows
          void putOxfordCache(rows)
          return rows
        }
      } catch (err) {
        console.warn('[oxford] Firestore load failed, using bundled PDF data', err)
      }
    }
    const bundled = await loadBundled()
    memory = bundled
    void putOxfordCache(bundled)
    return bundled
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function filterOxfordRows(all: OxfordRow[], q: OxfordQuery): OxfordRow[] {
  let rows = all
  if (q.level) rows = rows.filter((r) => r.level === q.level)
  if (q.category) rows = rows.filter((r) => r.category === q.category)
  if (q.pos) {
    const p = q.pos.toLowerCase()
    rows = rows.filter((r) => (r.pos ?? '').toLowerCase() === p)
  }
  if (q.words) {
    const set = new Set(q.words.map((w) => w.toLowerCase().trim()))
    rows = rows.filter((r) => set.has((r.word ?? '').toLowerCase().trim()))
  }
  if (q.ids && q.ids.length > 0) {
    const set = new Set(q.ids)
    rows = rows.filter((r) => set.has(r.id))
  }
  if (q.search) {
    const raw = q.search.trim()
    const s = raw.toLowerCase()
    rows = rows.filter(
      (r) =>
        r.word.toLowerCase().includes(s) ||
        (r.korean_meaning ?? '').toLowerCase().includes(s) ||
        (r.korean_meaning ?? '').includes(raw),
    )
  }
  rows = [...rows].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  const offset = q.offset ?? 0
  if (q.limit != null) return rows.slice(offset, offset + q.limit)
  if (offset) return rows.slice(offset)
  return rows
}

export async function queryOxfordKoEn(
  q: OxfordQuery = {},
): Promise<{ rows: OxfordRow[]; total: number }> {
  const all = await loadOxfordKoEnAll()
  const filtered = filterOxfordRows(all, { ...q, offset: undefined, limit: undefined })
  const offset = q.offset ?? 0
  const rows = q.limit != null ? filtered.slice(offset, offset + q.limit) : offset ? filtered.slice(offset) : filtered
  return { rows, total: filtered.length }
}

export async function countOxfordKoEn(q: OxfordQuery = {}): Promise<number> {
  const { total } = await queryOxfordKoEn({ ...q, offset: undefined, limit: undefined })
  return total
}
