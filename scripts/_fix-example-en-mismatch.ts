/**
 * oxford_vocab 의 english_example 이 korean_example 과 의미가 안 맞는 행을 찾아
 * 한국어 예문을 기반으로 영어 예문을 재번역하고, 영어 예문 음성도 Azure 로 재합성한다.
 *
 * 동작:
 *   1) `--force=numbers` 인 경우 NUMBER_WORDS 73 행은 평가 없이 무조건 재번역 (사용자가 명시한 카테고리).
 *   2) 그 외 모든 행은 GPT-5.5 로 "이 영어 예문이 이 한국어 예문의 번역인가?" 평가.
 *      미일치(match=false)면 GPT-5.5 가 즉시 제안한 새 영어 예문으로 교체.
 *   3) 각 교체 행에 대해 새 english_example 을 Azure TTS(en-US-JennyNeural) 로 합성 →
 *      english_example_audio_url 패치.
 *
 * 사용:
 *   npx tsx scripts/_fix-example-en-mismatch.ts                              # 전체 점검
 *   npx tsx scripts/_fix-example-en-mismatch.ts --force=numbers              # 숫자만 강제 재생성
 *   npx tsx scripts/_fix-example-en-mismatch.ts --limit=100 --concurrency=4 # 디버그용
 */
import 'dotenv/config'
import OpenAI from 'openai'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const APP_SECRET = process.env.VITE_APP_SECRET ?? ''
const OPENAI_KEY = process.env.OPENAI_API_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE || !ANON || !OPENAI_KEY) {
  console.error('env missing')
  process.exit(1)
}

const MODEL = 'gpt-5.5'
const FN_URL = `${SUPABASE_URL}/functions/v1/azure-tts`
const openai = new OpenAI({ apiKey: OPENAI_KEY })

const NUMBER_WORDS = new Set([
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
])

interface Row {
  id: string
  word: string
  korean_meaning: string | null
  english_example: string | null
  korean_example: string | null
  english_example_audio_url: string | null
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a?.slice(name.length + 3)
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

async function fetchAllRows(): Promise<Row[]> {
  const cols = 'id,word,korean_meaning,english_example,korean_example,english_example_audio_url'
  const all: Row[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const r = await pgFetch(
      `oxford_vocab?select=${cols}&order=order_index.asc&offset=${from}&limit=${PAGE}`,
    )
    if (!r.ok) throw new Error(`select: ${r.status} ${await r.text()}`)
    const data = (await r.json()) as Row[]
    all.push(...data)
    if (data.length < PAGE) break
    from += data.length
  }
  return all
}

async function updateRow(id: string, patch: Partial<Row>): Promise<void> {
  const r = await pgFetch(`oxford_vocab?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  if (!r.ok) throw new Error(`update ${id}: ${r.status} ${await r.text()}`)
}

async function azureTtsEn(text: string): Promise<string> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      apikey: ANON,
      authorization: `Bearer ${ANON}`,
      'content-type': 'application/json',
      ...(APP_SECRET ? { 'x-app-secret': APP_SECRET } : {}),
    },
    body: JSON.stringify({ text, language: 'en' }),
  })
  if (!res.ok) throw new Error(`azure-tts ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = (await res.json()) as { url?: string }
  if (!j.url) throw new Error('azure-tts: no url')
  return j.url
}

// GPT 호출: 영어 예문이 한국어 예문의 자연스러운 번역인지 평가하고, 미일치면 제안.
async function evalAndTranslate(row: Row): Promise<{ match: boolean; suggested: string | null }> {
  const sys = [
    'You are a bilingual reviewer (Korean ↔ English).',
    'Given a Korean sentence and an English sentence, decide whether the English sentence is a faithful translation of the Korean sentence in meaning (paraphrasing OK, but the core proposition must match).',
    'If they do NOT match, also rewrite the English so that it is a natural, daily-conversation translation of the Korean sentence.',
    'Output strict JSON: { "match": boolean, "suggested": string }. When match=true, suggested can be an empty string.',
  ].join('\n')
  const user = [
    `Korean sentence: ${row.korean_example ?? ''}`,
    `English sentence: ${row.english_example ?? ''}`,
    `(Context: the headword is "${row.word}" meaning "${row.korean_meaning ?? ''}". The new English MUST use the headword naturally.)`,
  ].join('\n')
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
  })
  const raw = res.choices[0]?.message?.content ?? '{}'
  let parsed: { match?: boolean; suggested?: string } = {}
  try { parsed = JSON.parse(raw) } catch { parsed = {} }
  const match = Boolean(parsed.match)
  const suggested = typeof parsed.suggested === 'string' ? parsed.suggested.trim() : ''
  return { match, suggested: suggested.length > 0 ? suggested : null }
}

async function translate(row: Row): Promise<string> {
  const sys = [
    'You are a Korean→English translator focused on natural, daily-conversation English.',
    'Output strict JSON: { "english": string } — one sentence only, must use the headword naturally.',
  ].join('\n')
  const user = [
    `Korean sentence: ${row.korean_example ?? ''}`,
    `Headword (must appear in English): "${row.word}" (Korean meaning: "${row.korean_meaning ?? ''}")`,
  ].join('\n')
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
  })
  const raw = res.choices[0]?.message?.content ?? '{}'
  let parsed: { english?: string } = {}
  try { parsed = JSON.parse(raw) } catch { parsed = {} }
  return (parsed.english ?? '').trim()
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < retries; i++) {
    try { return await fn() }
    catch (e) {
      last = e
      console.warn(`  [retry ${i+1}/${retries}] ${label}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)))
    }
  }
  throw last
}

async function pool<T>(items: T[], n: number, fn: (it: T, i: number) => Promise<void>) {
  let next = 0
  const run = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try { await fn(items[i], i) } catch (e) { console.error(`pool ${i}:`, e) }
    }
  }
  await Promise.all(Array.from({ length: n }, () => run()))
}

async function main() {
  const force = arg('force') ?? ''
  const conc = Number(arg('concurrency') ?? '4')
  const limit = arg('limit') ? Number(arg('limit')) : undefined

  let rows = await fetchAllRows()
  if (limit) rows = rows.slice(0, limit)
  console.log(`전체 행: ${rows.length}`)

  // 평가 대상: 영어/한국어 둘 다 있는 행만
  const evalRows = rows.filter((r) => (r.english_example ?? '').trim() && (r.korean_example ?? '').trim())
  console.log(`예문 양쪽 보유: ${evalRows.length}`)

  const forceNumbers = force === 'numbers'

  let nMatch = 0
  let nMismatch = 0
  let nForced = 0
  let nFail = 0
  let nAudio = 0

  const t0 = Date.now()
  await pool(evalRows, conc, async (row, idx) => {
    try {
      const isNumber = NUMBER_WORDS.has(row.word.toLowerCase())
      let newEnglish: string | null = null

      if (isNumber || forceNumbers) {
        if (isNumber) {
          // 숫자: 무조건 한국어 → 영어 재번역
          newEnglish = await withRetry(`translate ${row.word}/${row.korean_meaning}`, () => translate(row))
          nForced++
        }
      }
      if (newEnglish === null && !forceNumbers) {
        // 일반 카테고리: 평가 후 미일치만 교체
        const { match, suggested } = await withRetry(
          `eval ${row.word}/${row.korean_meaning}`,
          () => evalAndTranslate(row),
        )
        if (match) {
          nMatch++
          return
        }
        nMismatch++
        if (suggested) newEnglish = suggested
        else newEnglish = await withRetry(`re-translate ${row.word}`, () => translate(row))
      }

      if (!newEnglish || newEnglish.length === 0) {
        nFail++
        return
      }

      const patch: Partial<Row> = { english_example: newEnglish }

      // Azure 영어 TTS 재합성 (예문 음성)
      try {
        const url = await withRetry(`tts ${row.word}`, () => azureTtsEn(newEnglish!))
        patch.english_example_audio_url = url
        nAudio++
      } catch (e) {
        console.warn(`  ! audio skip ${row.word}: ${e instanceof Error ? e.message : String(e)}`)
      }

      await updateRow(row.id, patch)
      console.log(`  ✓ [${idx + 1}] ${row.word}/${row.korean_meaning}`)
      console.log(`     - KO: ${row.korean_example}`)
      console.log(`     - old EN: ${row.english_example}`)
      console.log(`     - new EN: ${newEnglish}`)
    } catch (e) {
      nFail++
      console.error(`  ✗ ${row.word}/${row.korean_meaning}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if ((idx + 1) % 50 === 0) {
      const elapsed = Math.round((Date.now() - t0) / 1000)
      console.log(`  ─ 진행 ${idx + 1}/${evalRows.length} · ${elapsed}s · match=${nMatch} mismatch=${nMismatch} forced=${nForced} fail=${nFail}`)
    }
  })

  const elapsed = Math.round((Date.now() - t0) / 1000)
  console.log('═'.repeat(60))
  console.log(`완료 · ${elapsed}s`)
  console.log(`  일치(skip): ${nMatch}`)
  console.log(`  미일치(교체): ${nMismatch}`)
  console.log(`  숫자 강제 재생성: ${nForced}`)
  console.log(`  Azure 음성 패치: ${nAudio}`)
  console.log(`  실패: ${nFail}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
