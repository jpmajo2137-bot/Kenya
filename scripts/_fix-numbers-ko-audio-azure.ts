/**
 * 숫자 카테고리의 한국어 단어/예문 TTS 를 Azure (ko-KR-SunHiNeural) 로 재합성.
 *
 * 다른 카테고리는 azure-tts edge function 이 만든 mp3 (Azure 한국어 여성 음성) 를
 * 사용 중인데, 숫자 카테고리만 OpenAI nova 로 생성돼 발음이 어색했음.
 *
 * 동작:
 *   1) NUMBER_WORDS 행을 조회 (영어 단어 기준)
 *   2) 각 행의 korean_meaning  → azure-tts (language=ko) 호출 → meaning_audio_url 패치
 *   3) 각 행의 korean_example  → azure-tts (language=ko) 호출 → korean_example_audio_url 패치
 *
 * 영어 단어/예문 음성은 사용자 요청 범위 밖이므로 건드리지 않는다.
 */

import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const APP_SECRET = process.env.VITE_APP_SECRET ?? ''
if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error('env missing: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const FN_URL = `${SUPABASE_URL}/functions/v1/azure-tts`

const NUMBER_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
]

interface Row {
  id: string
  word: string
  korean_meaning: string | null
  korean_example: string | null
  meaning_audio_url: string | null
  korean_example_audio_url: string | null
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

async function selectRows(): Promise<Row[]> {
  const cols = 'id,word,korean_meaning,korean_example,meaning_audio_url,korean_example_audio_url'
  const inList = NUMBER_WORDS.map((w) => `"${w}"`).join(',')
  const r = await pgFetch(`oxford_vocab?select=${cols}&word=in.(${inList})`)
  if (!r.ok) throw new Error(`select: ${r.status} ${await r.text()}`)
  return (await r.json()) as Row[]
}

async function updateRow(id: string, patch: Record<string, string>): Promise<void> {
  const r = await pgFetch(`oxford_vocab?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error(`update ${id}: ${r.status} ${await r.text()}`)
}

async function azureTts(text: string): Promise<string> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      apikey: ANON,
      authorization: `Bearer ${ANON}`,
      'content-type': 'application/json',
      ...(APP_SECRET ? { 'x-app-secret': APP_SECRET } : {}),
    },
    body: JSON.stringify({ text, language: 'ko' }),
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
    try { return await fn() }
    catch (e) {
      last = e
      console.warn(`  [retry ${i+1}/${retries}] ${label}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise(r => setTimeout(r, 1200 * (i + 1)))
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
      try { await fn(items[i]) } catch (e) { console.error(`pool ${i}:`, e) }
    }
  }
  await Promise.all(Array.from({ length: n }, () => run()))
}

async function main() {
  const conc = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) ?? '4')

  const rows = await selectRows()
  console.log(`대상 행: ${rows.length}`)

  const t0 = Date.now()
  let done = 0
  await pool(rows, conc, async (row) => {
    const patch: Record<string, string> = {}
    try {
      if (row.korean_meaning) {
        const url = await withRetry(`meaning ${row.word}/${row.korean_meaning}`,
          () => azureTts(row.korean_meaning!))
        patch.meaning_audio_url = url
      }
      if (row.korean_example) {
        const url = await withRetry(`example ${row.word}`,
          () => azureTts(row.korean_example!))
        patch.korean_example_audio_url = url
      }
      if (Object.keys(patch).length > 0) {
        await updateRow(row.id, patch)
        console.log(`  ✓ ${row.word}/${row.korean_meaning} → ${Object.keys(patch).join(', ')}`)
      } else {
        console.log(`  · skip ${row.word}/${row.korean_meaning}: 한국어 텍스트 없음`)
      }
    } catch (e) {
      console.error(`  ✗ ${row.word}/${row.korean_meaning}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      done++
      if (done % 5 === 0 || done === rows.length) {
        const elapsed = Math.round((Date.now() - t0) / 1000)
        console.log(`  진행 ${done}/${rows.length} · ${elapsed}s`)
      }
    }
  })

  const elapsed = Math.round((Date.now() - t0) / 1000)
  console.log('═'.repeat(50))
  console.log(`완료: ${rows.length} 행 · ${elapsed}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
