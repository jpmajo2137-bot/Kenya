/**
 * Oxford 5000 전체 단어 중 "일상생활" 토픽에 가장 적합한 200 개를 GPT-5.5 로 선정.
 *
 * 동작:
 *   1) oxford_vocab 의 전체 (word, korean_meaning) 로드
 *   2) 배치(BATCH 단어/요청) 단위로 GPT-5.5 에게 각 단어가 "일상생활"(daily routine/
 *      activities — 먹기, 자기, 씻기, 옷, 가족, 통근, 학교/직장 일과 등)에 얼마나 적합한지
 *      0~10 점수로 응답하도록 요청 (JSON)
 *   3) 모든 단어 점수 수집 → 상위 200 개 선정
 *   4) src/lib/oxfordTopicClassification.ts 의 `data` 객체에서
 *      - 선정된 200 개 단어의 토픽 배열에 "일상생활" 이 없으면 추가
 *      - 기존 "일상생활" 분류된 단어 중 200 개에 없는 것은 "일상생활" 만 제거
 *      (다른 토픽은 보존)
 *
 * Idempotent. Re-run 안전.
 *
 * 사용:
 *   npx tsx scripts/_classify-daily-life-200.ts
 *   옵션:
 *     --batch=50          한 GPT 요청당 단어 수 (기본 50)
 *     --concurrency=8     동시 요청 수 (기본 8)
 *     --target=200        선정 단어 수 (기본 200)
 *     --dry-run           파일/DB 변경 없이 상위 N 미리보기
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_KEY = process.env.OPENAI_API_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_KEY) {
  console.error('env missing'); process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

const MODEL = 'gpt-5.5'
const TOPIC = '일상생활'

const argv = process.argv.slice(2)
const argVal = (k: string): string | undefined => {
  for (const a of argv) if (a.startsWith(`--${k}=`)) return a.slice(k.length + 3)
  return undefined
}
const BATCH = Number(argVal('batch') ?? '50')
const CONCURRENCY = Number(argVal('concurrency') ?? '8')
const TARGET = Number(argVal('target') ?? '200')
const DRY = argv.includes('--dry-run')

interface Word {
  word: string
  korean_meaning: string
}

async function fetchAllWords(): Promise<Word[]> {
  const PAGE = 1000
  const out: Word[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('oxford_vocab')
      .select('word, korean_meaning')
      .order('word', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as Word[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

interface GptScores { [word: string]: number }

async function scoreBatch(batch: Word[]): Promise<GptScores> {
  const list = batch.map((w, i) => `${i + 1}. ${w.word}  —  ${w.korean_meaning}`).join('\n')
  const sys = `You score English vocabulary words by how strongly they belong to the topic "${TOPIC}" (일상생활, i.e. everyday/daily life routines: eating, sleeping, washing, clothing, family at home, commuting, school/work routine, basic household chores, shopping for daily essentials, basic social interaction). Output strict JSON only.`
  const user = `For each word below, output an integer score 0..10 where:
  10 = clearly a core daily-life routine word (e.g. eat, sleep, wash, kitchen, breakfast, commute, work, shower, toothbrush)
  6-9 = often used in daily life contexts but not exclusive
  3-5 = occasionally appears in daily life
  0-2 = rarely or never about daily life (abstract, scientific, political, technical, geographic, sports, art, etc.)

Words:
${list}

Return JSON with key "scores" mapping each lowercase word to its integer 0..10. Do not include any other keys or commentary. Example: {"scores":{"eat":10,"abolish":1,...}}`

  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
  })
  const raw = res.choices?.[0]?.message?.content ?? ''
  let parsed: { scores?: Record<string, number> }
  try { parsed = JSON.parse(raw) } catch { throw new Error(`json parse fail: ${raw.slice(0, 200)}`) }
  const scores = parsed.scores ?? {}
  const out: GptScores = {}
  for (const w of batch) {
    const key = w.word.toLowerCase().trim()
    const v = scores[key] ?? scores[w.word] ?? 0
    const n = typeof v === 'number' ? v : Number(v)
    out[key] = Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0
  }
  return out
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < retries; i++) {
    try { return await fn() }
    catch (e) {
      last = e
      console.warn(`  [retry ${i+1}/${retries}] ${label}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise(r => setTimeout(r, 2000 * (i + 1)))
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

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function loadClassificationFile(): Promise<string> {
  const p = path.join(__dirname, '..', 'src', 'lib', 'oxfordTopicClassification.ts')
  return fs.promises.readFile(p, 'utf8')
}

function updateClassificationFile(src: string, selected: Set<string>): string {
  // 파일 형식: `  "word": [\n    "토픽",\n  ...\n  ],` 또는 `  "word": [],`
  // 정규식으로 각 단어 블록을 찾아 topics 배열을 재구성한다.
  const blockRe = /(^ {2}"([^"]+)": \[)([^\]]*)(\],?$)/gm
  let unchanged = 0, addedTopic = 0, removedTopic = 0
  const next = src.replace(blockRe, (full, head: string, key: string, body: string, tail: string) => {
    const lc = key.toLowerCase().trim()
    const topics = Array.from(body.matchAll(/"([^"]+)"/g)).map((m) => m[1])
    const hasTopic = topics.includes(TOPIC)
    const shouldHave = selected.has(lc)
    if (hasTopic === shouldHave) {
      unchanged++
      return full
    }
    let newTopics: string[]
    if (shouldHave) {
      newTopics = [...topics, TOPIC]
      addedTopic++
    } else {
      newTopics = topics.filter((t) => t !== TOPIC)
      removedTopic++
    }
    if (newTopics.length === 0) return `${head}${tail}`
    const inner = newTopics.map((t) => `\n    "${t}"`).join(',')
    return `${head}${inner}\n  ${tail}`
  })
  console.log(`  파일 갱신: 변경 없음 ${unchanged}, 토픽 추가 ${addedTopic}, 토픽 제거 ${removedTopic}`)
  return next
}

async function main() {
  console.log(`모델: ${MODEL}`)
  console.log(`타겟 단어 수: ${TARGET}`)
  console.log(`배치/동시: ${BATCH}/${CONCURRENCY}`)
  console.log('전체 단어 로드 중...')

  const words = await fetchAllWords()
  console.log(`총 ${words.length} 단어`)

  const batches = chunk(words, BATCH)
  console.log(`배치 수: ${batches.length}`)

  const scores: GptScores = {}
  const t0 = Date.now()
  let done = 0
  await pool(batches, CONCURRENCY, async (b, i) => {
    try {
      const out = await withRetry(`batch ${i+1}`, () => scoreBatch(b))
      Object.assign(scores, out)
    } catch (e) {
      console.error(`  ✗ batch ${i+1}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      done++
      if (done % 10 === 0 || done === batches.length) {
        const elapsed = Math.round((Date.now() - t0) / 1000)
        console.log(`  진행 ${done}/${batches.length} · ${elapsed}s`)
      }
    }
  })

  console.log(`점수 매겨진 단어: ${Object.keys(scores).length}`)

  // 정렬: 점수 desc, tie-break: 알파벳 asc
  const ranked = Object.entries(scores)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
  const selected = ranked.slice(0, TARGET).map((e) => e[0])
  const selectedSet = new Set(selected)

  console.log(`상위 ${TARGET} 단어 (점수 분포):`)
  const minScore = scores[selected[selected.length - 1]] ?? 0
  const maxScore = scores[selected[0]] ?? 0
  console.log(`  최고 점수: ${maxScore}, 200번째 컷오프 점수: ${minScore}`)
  console.log('  샘플 상위 20:')
  for (const w of selected.slice(0, 20)) console.log(`    ${w} (${scores[w]})`)
  console.log('  샘플 컷오프 부근 (190~210):')
  for (let i = Math.max(0, 190); i < Math.min(ranked.length, 210); i++) {
    const mark = i < TARGET ? '✓' : '·'
    console.log(`    ${mark} ${ranked[i][0]} (${ranked[i][1]})`)
  }

  if (DRY) {
    console.log('--dry-run → 파일/DB 변경 없이 종료')
    return
  }

  // 클라이언트 분류 파일 갱신
  console.log('oxfordTopicClassification.ts 갱신 중...')
  const src = await loadClassificationFile()
  const next = updateClassificationFile(src, selectedSet)
  if (next !== src) {
    const p = path.join(__dirname, '..', 'src', 'lib', 'oxfordTopicClassification.ts')
    await fs.promises.writeFile(p, next, 'utf8')
    console.log('  ✓ 파일 갱신 완료')
  } else {
    console.log('  · 변경 사항 없음')
  }

  console.log('═'.repeat(60))
  console.log(`완료: 일상생활 = ${TARGET} 단어`)
}

main().catch(e => { console.error(e); process.exit(1) })
