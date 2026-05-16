/**
 * oxford_vocab 테이블에서 audio_url 컬럼이 NULL 인 행을 찾아 Azure TTS 로 재생성한다.
 *
 * 동작:
 *   - meaning_audio_url IS NULL          → korean_meaning  텍스트를 ko 로 합성
 *   - korean_example_audio_url IS NULL   → korean_example  텍스트를 ko 로 합성
 *   - english_example_audio_url IS NULL  → english_example 텍스트를 en 으로 합성
 *   - word_audio_url IS NULL             → word 텍스트를 en 으로 합성
 *
 * 전제: `apply-displayoverrides-to-oxford.ts --apply` 가 변경된 텍스트의 audio_url 만 NULL 로
 * 비워둔 직후 실행한다는 가정. 따라서 이 스크립트는 "필요한 행만" 정확히 합성한다.
 *
 * 사용법:
 *   npx tsx scripts/regen-corrected-oxford-audio.ts                  # dry-run (대상 행만 표시)
 *   npx tsx scripts/regen-corrected-oxford-audio.ts --apply          # 실제 합성/업로드/PATCH
 *   npx tsx scripts/regen-corrected-oxford-audio.ts --apply --concurrency=4
 *   npx tsx scripts/regen-corrected-oxford-audio.ts --apply --kinds=ko    # ko 음성만 재생성
 *
 * 필요 env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (선호) or VITE_SUPABASE_ANON_KEY
 *   VITE_APP_SECRET (선택, edge function 의 X-App-Secret 헤더와 일치해야 함)
 */

import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? SERVICE_ROLE
const APP_SECRET = process.env.VITE_APP_SECRET ?? ''

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('env missing: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (또는 VITE_SUPABASE_ANON_KEY)')
  process.exit(1)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const concurrencyArg = args.find((a) => a.startsWith('--concurrency='))?.slice('--concurrency='.length)
const CONCURRENCY = Math.max(1, Number(concurrencyArg ?? '4'))
const kindsArg = args.find((a) => a.startsWith('--kinds='))?.slice('--kinds='.length)
const KINDS_FILTER: Set<'word_en' | 'meaning_ko' | 'example_en' | 'example_ko'> = new Set()
if (kindsArg) {
  for (const k of kindsArg.split(',').map((s) => s.trim())) {
    if (k === 'word_en' || k === 'meaning_ko' || k === 'example_en' || k === 'example_ko') {
      KINDS_FILTER.add(k)
    } else if (k === 'ko') {
      KINDS_FILTER.add('meaning_ko')
      KINDS_FILTER.add('example_ko')
    } else if (k === 'en') {
      KINDS_FILTER.add('word_en')
      KINDS_FILTER.add('example_en')
    }
  }
}

const FN_URL = `${SUPABASE_URL}/functions/v1/azure-tts`

type Row = {
  id: string
  word: string
  korean_meaning: string | null
  english_example: string | null
  korean_example: string | null
  word_audio_url: string | null
  meaning_audio_url: string | null
  english_example_audio_url: string | null
  korean_example_audio_url: string | null
}

type AudioKind = 'word_en' | 'meaning_ko' | 'example_en' | 'example_ko'

const KIND_TO_TEXT_COL: Record<AudioKind, keyof Row> = {
  word_en: 'word',
  meaning_ko: 'korean_meaning',
  example_en: 'english_example',
  example_ko: 'korean_example',
}
const KIND_TO_URL_COL: Record<AudioKind, keyof Row> = {
  word_en: 'word_audio_url',
  meaning_ko: 'meaning_audio_url',
  example_en: 'english_example_audio_url',
  example_ko: 'korean_example_audio_url',
}
const KIND_TO_LANG: Record<AudioKind, 'ko' | 'en'> = {
  word_en: 'en',
  meaning_ko: 'ko',
  example_en: 'en',
  example_ko: 'ko',
}

async function pgFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
}

async function fetchTargetRows(): Promise<Row[]> {
  // 변경된 audio_url 컬럼들에 한해 NULL 인 행만 수집.
  // 페이지네이션 (Supabase REST 는 기본 1000 행 제한).
  const cols =
    'id,word,korean_meaning,english_example,korean_example,word_audio_url,meaning_audio_url,english_example_audio_url,korean_example_audio_url'
  const collected: Row[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const r = await pgFetch(
      `oxford_vocab?select=${cols}&or=(word_audio_url.is.null,meaning_audio_url.is.null,english_example_audio_url.is.null,korean_example_audio_url.is.null)&limit=${PAGE}&offset=${from}`,
    )
    if (!r.ok) throw new Error(`select rows: ${r.status} ${await r.text()}`)
    const data = (await r.json()) as Row[]
    if (data.length === 0) break
    collected.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return collected
}

async function azureTts(text: string, language: 'ko' | 'en'): Promise<string> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      apikey: ANON,
      authorization: `Bearer ${ANON}`,
      'content-type': 'application/json',
      ...(APP_SECRET ? { 'x-app-secret': APP_SECRET } : {}),
    },
    body: JSON.stringify({ text, language }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`azure-tts ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as { url?: string }
  if (!json.url) throw new Error('azure-tts: no url in response')
  return json.url
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      console.warn(`  [retry ${i + 1}/${retries}] ${label}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)))
    }
  }
  throw last
}

async function pool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let next = 0
  const run = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try {
        await fn(items[i])
      } catch (e) {
        console.error(`pool ${i}:`, e)
      }
    }
  }
  await Promise.all(Array.from({ length: n }, () => run()))
}

function neededKinds(row: Row): AudioKind[] {
  const all: AudioKind[] = ['word_en', 'meaning_ko', 'example_en', 'example_ko']
  return all.filter((k) => {
    if (KINDS_FILTER.size > 0 && !KINDS_FILTER.has(k)) return false
    const urlCol = KIND_TO_URL_COL[k]
    const textCol = KIND_TO_TEXT_COL[k]
    return row[urlCol] == null && row[textCol] != null && String(row[textCol]).trim().length > 0
  })
}

async function patchRow(id: string, patch: Record<string, string>): Promise<void> {
  const r = await pgFetch(`oxford_vocab?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error(`update ${id}: ${r.status} ${await r.text()}`)
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`concurrency: ${CONCURRENCY}`)
  console.log(`kinds filter: ${KINDS_FILTER.size === 0 ? '(all)' : [...KINDS_FILTER].join(',')}`)
  console.log()

  console.log('1) audio_url 이 NULL 인 oxford_vocab 행 조회 중...')
  const rows = await fetchTargetRows()
  const targets = rows
    .map((r) => ({ row: r, kinds: neededKinds(r) }))
    .filter((x) => x.kinds.length > 0)
  console.log(`   대상: ${targets.length} 행 / 합성 슬롯 ${targets.reduce((s, x) => s + x.kinds.length, 0)} 개`)
  console.log()

  if (targets.length === 0) {
    console.log('재생성할 행이 없습니다. 종료.')
    return
  }

  // 보고
  for (const { row, kinds } of targets.slice(0, 50)) {
    console.log(`  • [${row.word}] ${kinds.join(', ')}`)
  }
  if (targets.length > 50) console.log(`  ... +${targets.length - 50} more`)
  console.log()

  if (!APPLY) {
    console.log('--apply 가 없어 합성을 실행하지 않았습니다. 검토 후 다시 실행하세요.')
    return
  }

  console.log('2) Azure TTS 합성 + DB PATCH 진행...')
  const t0 = Date.now()
  let done = 0
  let synthFailed = 0

  await pool(targets, CONCURRENCY, async ({ row, kinds }) => {
    const patch: Record<string, string> = {}
    for (const kind of kinds) {
      const text = String(row[KIND_TO_TEXT_COL[kind]] ?? '').trim()
      if (!text) continue
      try {
        const url = await withRetry(`${row.word}/${kind}`, () =>
          azureTts(text, KIND_TO_LANG[kind]),
        )
        patch[KIND_TO_URL_COL[kind] as string] = url
      } catch (e) {
        synthFailed++
        console.error(
          `  ✗ ${row.word}/${kind}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    if (Object.keys(patch).length === 0) return
    try {
      await patchRow(row.id, patch)
      console.log(`  ✓ ${row.word} → ${Object.keys(patch).join(', ')}`)
    } catch (e) {
      console.error(`  ✗ ${row.word} update: ${e instanceof Error ? e.message : String(e)}`)
    }
    done++
    if (done % 10 === 0 || done === targets.length) {
      const elapsed = Math.round((Date.now() - t0) / 1000)
      console.log(`  진행 ${done}/${targets.length} · ${elapsed}s · 합성실패 ${synthFailed}`)
    }
  })

  const elapsed = Math.round((Date.now() - t0) / 1000)
  console.log('═'.repeat(50))
  console.log(`완료: ${done} 행 처리 · 합성실패 ${synthFailed} · ${elapsed}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
