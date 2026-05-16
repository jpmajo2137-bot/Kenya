/**
 * Oxford 5000 단어를 GPT 로 분류한다.
 *
 *   1) 12개 주제(topic) 중 0~2개 매칭:
 *      일상생활, 숫자/수량, 음식/음료, 가족/관계, 자연/동물, 집/생활용품,
 *      인사/기본표현, 신체/건강, 시간/날짜, 색상/외모, 교통/이동
 *   2) 4개 품사(pos) 중 1개:
 *      noun, verb, adjective, adverb
 *      (Oxford 단어가 여러 품사로 쓰일 수 있을 때는 가장 흔한 1개를 선택)
 *
 * 출력:
 *   - `oxford_vocab.pos` 컬럼 UPDATE (이미 값이 있으면 덮어쓰지 않음 — `--force-pos` 로 강제)
 *   - `src/lib/oxfordTopicClassification.ts` 의 `data` 객체 갱신 (멱등하게 머지)
 *
 * 환경 변수 (.env):
 *   - OPENAI_API_KEY (필수)
 *   - OPENAI_MODEL (선택, 기본 'gpt-4o-mini')
 *   - VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (필수)
 *
 * 사용법:
 *   npx tsx scripts/classify-oxford-topics-pos.ts
 *   옵션:
 *     --limit=100         처음 N 개만 처리 (디버그)
 *     --batch=50          한 GPT 요청당 단어 수 (기본 50)
 *     --concurrency=4     동시 요청 수 (기본 4)
 *     --force-pos         이미 pos 가 있어도 덮어쓰기
 *     --skip-db           DB 업데이트 건너뛰고 데이터 파일만 갱신
 *     --skip-file         데이터 파일 갱신 건너뛰고 DB 만 업데이트
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================
// 설정
// ============================================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY 가 .env 에 필요합니다.')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const argValue = (key: string): string | undefined => {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(`--${key}=`)) return a.slice(key.length + 3)
  }
  return undefined
}
const LIMIT = argValue('limit') ? Number(argValue('limit')) : undefined
const BATCH = Number(argValue('batch') ?? '50')
const CONCURRENCY = Number(argValue('concurrency') ?? '4')
const FORCE_POS = args.has('--force-pos')
const SKIP_DB = args.has('--skip-db')
const SKIP_FILE = args.has('--skip-file')
// 이미 데이터 파일에 등록된 단어는 GPT 호출에서 제외 (이전 실행이 중간에 끊긴 경우 이어받기)
const ONLY_MISSING = args.has('--only-missing')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const TOPICS = [
  '색상/외모',
  '음식/음료',
  '가족/관계',
  '자연/동물',
  '집/생활용품',
  '인사/기본표현',
  '신체/건강',
  '시간/날짜',
  '교통/이동',
  '숫자/수량',
  '일상생활',
] as const
type Topic = (typeof TOPICS)[number]

type Pos = 'noun' | 'verb' | 'adjective' | 'adverb'
const POS_VALUES: ReadonlySet<Pos> = new Set(['noun', 'verb', 'adjective', 'adverb'])

// ============================================================
// 1) DB 에서 Oxford 단어 로딩
// ============================================================
type OxfordWord = {
  id: string
  word: string
  korean_meaning: string
  pos: string | null
}

async function fetchAllOxford(): Promise<OxfordWord[]> {
  const out: OxfordWord[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('oxford_vocab')
      .select('id, word, korean_meaning, pos')
      .order('order_index', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...(data as OxfordWord[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

// ============================================================
// 2) GPT 호출
// ============================================================
type ClassifyResult = {
  word: string
  pos: Pos | null
  topics: Topic[]
}

const SYSTEM_PROMPT = `You are a meticulous English-Korean lexicographer.
For each English word given (with its primary Korean meaning), output:
  - "pos": ONE of {"noun", "verb", "adjective", "adverb"} — the most common part of speech.
  - "topics": ZERO to TWO labels from the fixed Korean topic list.

Topic list (use the EXACT Korean string verbatim):
  - "색상/외모"        — colors / appearance / physical look
  - "음식/음료"        — food, drinks, ingredients, cooking
  - "가족/관계"        — family members, relationships, social roles
  - "자연/동물"        — nature, weather, plants, animals, environment
  - "집/생활용품"      — house, rooms, furniture, household items
  - "인사/기본표현"    — greetings, basic expressions, please/thanks/yes/no
  - "신체/건강"        — body parts, health, illness, medicine, fitness
  - "시간/날짜"        — time, dates, days, months, schedules
  - "교통/이동"        — transport, vehicles, travel motion, directions
  - "숫자/수량"        — numbers, quantity, counting, ordinals
  - "일상생활"         — common everyday-life actions/objects that don't fit a more specific topic

Rules:
  1. ALWAYS choose exactly one "pos". If unsure, pick the one most learners encounter first.
  2. Topics: usually 1, sometimes 0 (abstract or function words), rarely 2.
  3. Use the EXACT Korean strings. Never translate them.
  4. Output STRICT JSON of the form: {"results": [ ... ]}
     where "results" is an array of {"word": string, "pos": string, "topics": string[]}
     in the SAME order as the input.

Example input: [{"word":"apple","korean":"사과"}, {"word":"run","korean":"달리다"}]
Example output: {"results":[{"word":"apple","pos":"noun","topics":["음식/음료"]},{"word":"run","pos":"verb","topics":["신체/건강"]}]}`

async function classifyBatch(words: OxfordWord[]): Promise<ClassifyResult[]> {
  const userInput = words.map((w) => ({
    word: w.word,
    korean: w.korean_meaning,
  }))

  // 일부 신모델(gpt-5+) 은 temperature 가 1 만 허용하므로 항상 기본값을 사용한다.
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Classify these ${userInput.length} words. Respond with a JSON array (no prose) of length ${userInput.length} in the SAME order:\n${JSON.stringify(userInput)}`,
      },
    ],
    response_format: { type: 'json_object' as const },
  }

  // 일시적 에러 (5xx, 429) 는 지수 백오프로 최대 3회 재시도
  let resp: Response | null = null
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    })
    if (resp.ok) break
    const text = await resp.text()
    lastErr = `OpenAI ${resp.status}: ${text.slice(0, 200)}`
    // 5xx 또는 429 는 재시도, 그 외(4xx 영구 에러)는 즉시 실패
    if (resp.status < 500 && resp.status !== 429) {
      throw new Error(lastErr)
    }
    const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500
    console.warn(`  재시도 ${attempt + 1}/3 (${Math.round(delay)}ms 대기): ${lastErr.slice(0, 80)}`)
    await new Promise((r) => setTimeout(r, delay))
  }
  if (!resp || !resp.ok) {
    throw new Error(lastErr || 'OpenAI 호출 실패')
  }
  const json = (await resp.json()) as { choices: { message: { content: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI 응답에 content 없음')

  // response_format: json_object → 객체로 감싸야 함. 보통 {"results": [...]} 또는 [...] 형태.
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error(`OpenAI JSON parse 실패: ${e}\n${content.slice(0, 300)}`)
  }
  let arr: unknown[] = []
  if (Array.isArray(parsed)) arr = parsed
  else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    // 우선 'results' 키를 시도하고, 그게 없으면 첫 배열 값을 찾는다.
    if (Array.isArray(obj.results)) arr = obj.results as unknown[]
    else {
      for (const v of Object.values(obj)) {
        if (Array.isArray(v)) {
          arr = v
          break
        }
      }
    }
  }
  if (arr.length !== words.length) {
    console.warn(
      `[batch] 단어 ${words.length}개 → 응답 ${arr.length}개. 매칭 가능한 만큼 처리.`,
    )
    if (arr.length === 0) {
      console.warn(`  raw response: ${content.slice(0, 500)}`)
    }
  }

  const out: ClassifyResult[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const r = arr[i] as { word?: string; pos?: string; topics?: string[] } | undefined
    if (!r) {
      out.push({ word: w.word, pos: null, topics: [] })
      continue
    }
    const pos = r.pos && POS_VALUES.has(r.pos as Pos) ? (r.pos as Pos) : null
    const rawTopics = Array.isArray(r.topics) ? r.topics : []
    const topics = rawTopics.filter((t): t is Topic => (TOPICS as readonly string[]).includes(t))
    out.push({ word: w.word, pos, topics })
  }
  return out
}

// ============================================================
// 3) 동시 실행 풀
// ============================================================
async function pool<T, R>(items: T[], concurrency: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[]
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try {
        out[i] = await fn(items[i], i)
      } catch (e) {
        console.error(`[pool ${i}]`, e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))
  return out
}

// ============================================================
// 4) DB 업데이트 (pos)
// ============================================================
async function updatePosBatch(updates: { word: string; pos: Pos }[]): Promise<void> {
  if (updates.length === 0) return
  // upsert 가 아니라 word 기준으로 update — supabase 는 .update().eq() 만 batch 지원이 약하므로
  // 한 번에 한 행씩 업데이트한다 (작지만 4949 정도면 수 분 내 완료).
  await pool(updates, 8, async (u) => {
    const { error } = await supabase
      .from('oxford_vocab')
      .update({ pos: u.pos })
      .eq('word', u.word)
    if (error) console.warn(`[pos update ${u.word}]`, error.message)
  })
}

// ============================================================
// 5) 데이터 파일 갱신 (src/lib/oxfordTopicClassification.ts)
// ============================================================
const DATA_FILE = path.join(__dirname, '..', 'src', 'lib', 'oxfordTopicClassification.ts')

function loadExistingData(): Record<string, string[]> {
  if (!fs.existsSync(DATA_FILE)) return {}
  const text = fs.readFileSync(DATA_FILE, 'utf-8')
  // `const data: Record<string, OxfordTopic[]> = { ... } as Record<string, OxfordTopic[]>`
  // 또는 `... = { ... }` 형태 — non-greedy 로 `}` 까지 매치.
  const m = text.match(/const\s+data\s*:[^=]+=\s*({[\s\S]*?})\s*(?:as\s+[^\n]+)?\s*\n\s*export\s+default\s+data/)
  if (!m) return {}
  try {
    // 우리 writeDataFile 은 항상 JSON.stringify 결과를 그대로 박으므로 이미 valid JSON 이다.
    // (단어 키에 들어갈 수 있는 작은따옴표 — 예: o'clock — 를 보존하기 위해 치환하지 않는다.)
    const literal = m[1].replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(literal) as Record<string, string[]>
  } catch (e) {
    console.warn('기존 데이터 파싱 실패, 빈 객체로 시작:', e)
    return {}
  }
}

function writeDataFile(data: Record<string, string[]>): void {
  // 키 정렬 (안정적인 diff 를 위해)
  const sorted: Record<string, string[]> = {}
  for (const k of Object.keys(data).sort()) sorted[k] = data[k]

  const json = JSON.stringify(sorted, null, 2)
  const out = `// Oxford 5000 단어 → 주제(topic) 매핑.
// scripts/classify-oxford-topics-pos.ts 가 자동 생성한다.
// 키는 lowercase trim 된 영어 단어, 값은 토픽 배열이다.

export const TOPICS = [
  '색상/외모',
  '음식/음료',
  '가족/관계',
  '자연/동물',
  '집/생활용품',
  '인사/기본표현',
  '신체/건강',
  '시간/날짜',
  '교통/이동',
  '숫자/수량',
  '일상생활',
] as const

export type OxfordTopic = (typeof TOPICS)[number]

const data: Record<string, OxfordTopic[]> = ${json} as Record<string, OxfordTopic[]>

export default data
`
  fs.writeFileSync(DATA_FILE, out, 'utf-8')
}

// ============================================================
// 6) 메인
// ============================================================
async function main() {
  console.log('Oxford 단어 로딩...')
  const all = await fetchAllOxford()
  console.log(`총 ${all.length} 개`)

  const existingData = SKIP_FILE ? {} : loadExistingData()

  let targets = LIMIT ? all.slice(0, LIMIT) : all
  if (ONLY_MISSING) {
    const before = targets.length
    targets = targets.filter((w) => !(w.word.toLowerCase().trim() in existingData))
    console.log(`이미 분류된 단어 제외: ${before - targets.length}개 (남은 ${targets.length}개만 처리)`)
  }

  // 배치 분할
  const batches: OxfordWord[][] = []
  for (let i = 0; i < targets.length; i += BATCH) {
    batches.push(targets.slice(i, i + BATCH))
  }
  console.log(`${batches.length} 배치 (${BATCH} 단어/배치, 동시 ${CONCURRENCY})`)
  const allResults: ClassifyResult[] = []

  let done = 0
  await pool(batches, CONCURRENCY, async (batch, idx) => {
    try {
      const results = await classifyBatch(batch)
      allResults.push(...results)
      done += 1
      process.stdout.write(`  ${done}/${batches.length} 배치 완료\r`)
      void idx
    } catch (e) {
      console.error(`\n[batch ${idx}] 실패:`, e)
    }
  })
  console.log(`\n분류 ${allResults.length} 단어 완료`)

  // 7) DB pos 업데이트
  if (!SKIP_DB) {
    const posUpdates: { word: string; pos: Pos }[] = []
    const posLookup = new Map(all.map((w) => [w.word, w.pos]))
    for (const r of allResults) {
      if (!r.pos) continue
      const existing = posLookup.get(r.word)
      if (existing && !FORCE_POS) continue
      posUpdates.push({ word: r.word, pos: r.pos })
    }
    console.log(`DB pos 업데이트: ${posUpdates.length} 개`)
    await updatePosBatch(posUpdates)
  }

  // 8) 데이터 파일 갱신
  if (!SKIP_FILE) {
    const merged = { ...existingData }
    for (const r of allResults) {
      const key = r.word.toLowerCase().trim()
      if (r.topics.length > 0) merged[key] = r.topics
      else if (!(key in merged)) merged[key] = []
    }
    writeDataFile(merged)
    console.log(`데이터 파일 갱신: ${DATA_FILE}`)
    console.log(`  총 ${Object.keys(merged).length} 단어, ` +
      `${Object.values(merged).filter((v) => v.length > 0).length} 분류됨`)
  }

  // 9) 통계
  const topicStats: Record<string, number> = {}
  const posStats: Record<string, number> = { noun: 0, verb: 0, adjective: 0, adverb: 0, none: 0 }
  for (const r of allResults) {
    for (const t of r.topics) topicStats[t] = (topicStats[t] ?? 0) + 1
    posStats[r.pos ?? 'none'] = (posStats[r.pos ?? 'none'] ?? 0) + 1
  }
  console.log('\n주제별:')
  for (const t of TOPICS) console.log(`  ${t}\t${topicStats[t] ?? 0}`)
  console.log('\n품사별:')
  for (const p of Object.keys(posStats)) console.log(`  ${p}\t${posStats[p]}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
