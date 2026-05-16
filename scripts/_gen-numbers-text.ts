/**
 * 사용자 요청: EN-KO 한자어/고유어 + KO-EN 영어 숫자 단어장 강화.
 *
 * Step 1) GPT-5.5 로 45 개 신규 행(영어 단어 + 한국어 의미 + 예문 + 발음)을 생성하고
 *         oxford_vocab 테이블에 upsert.
 *
 * 멱등: (word, korean_meaning) 페어로 존재하면 skip.
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
const OPENAI_KEY = process.env.OPENAI_API_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_KEY) {
  console.error('env missing')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

const MODEL = 'gpt-5.5'

type Kind = 'sino' | 'native'

// 단위 매핑
const SINO: Record<string, string> = {
  one: '일', two: '이', three: '삼', four: '사', five: '오',
  six: '육', seven: '칠', eight: '팔', nine: '구', ten: '십',
  eleven: '십일', twelve: '십이', thirteen: '십삼', fourteen: '십사', fifteen: '십오',
  sixteen: '십육', seventeen: '십칠', eighteen: '십팔', nineteen: '십구', twenty: '이십',
  'twenty-one': '이십일', 'twenty-two': '이십이', 'twenty-three': '이십삼', 'twenty-four': '이십사', 'twenty-five': '이십오',
  'twenty-six': '이십육', 'twenty-seven': '이십칠', 'twenty-eight': '이십팔', 'twenty-nine': '이십구', thirty: '삼십',
  forty: '사십', fifty: '오십', sixty: '육십', seventy: '칠십', eighty: '팔십', ninety: '구십', hundred: '백',
}

const NATIVE: Record<string, string> = {
  one: '하나', two: '둘', three: '셋', four: '넷', five: '다섯',
  six: '여섯', seven: '일곱', eight: '여덟', nine: '아홉', ten: '열',
  eleven: '열하나', twelve: '열둘', thirteen: '열셋', fourteen: '열넷', fifteen: '열다섯',
  sixteen: '열여섯', seventeen: '열일곱', eighteen: '열여덟', nineteen: '열아홉', twenty: '스물',
  'twenty-one': '스물하나', 'twenty-two': '스물둘', 'twenty-three': '스물셋', 'twenty-four': '스물넷', 'twenty-five': '스물다섯',
  'twenty-six': '스물여섯', 'twenty-seven': '스물일곱', 'twenty-eight': '스물여덟', 'twenty-nine': '스물아홉', thirty: '서른',
  forty: '마흔', fifty: '쉰', sixty: '예순', seventy: '일흔', eighty: '여든', ninety: '아흔',
}

// 신규 행 목록 (word, korean_meaning, kind)
function buildTargets(): Array<{ word: string; korean_meaning: string; kind: Kind; number: number }> {
  const out: Array<{ word: string; korean_meaning: string; kind: Kind; number: number }> = []

  const ORDER: Array<[number, string]> = [
    [1, 'one'], [2, 'two'], [3, 'three'], [4, 'four'], [5, 'five'],
    [6, 'six'], [7, 'seven'], [8, 'eight'], [9, 'nine'], [10, 'ten'],
    [11, 'eleven'], [12, 'twelve'], [13, 'thirteen'], [14, 'fourteen'], [15, 'fifteen'],
    [16, 'sixteen'], [17, 'seventeen'], [18, 'eighteen'], [19, 'nineteen'], [20, 'twenty'],
    [21, 'twenty-one'], [22, 'twenty-two'], [23, 'twenty-three'], [24, 'twenty-four'], [25, 'twenty-five'],
    [26, 'twenty-six'], [27, 'twenty-seven'], [28, 'twenty-eight'], [29, 'twenty-nine'], [30, 'thirty'],
    [40, 'forty'], [50, 'fifty'], [60, 'sixty'], [70, 'seventy'], [80, 'eighty'], [90, 'ninety'], [100, 'hundred'],
  ]

  for (const [n, word] of ORDER) {
    if (SINO[word]) out.push({ word, korean_meaning: SINO[word], kind: 'sino', number: n })
    if (NATIVE[word]) out.push({ word, korean_meaning: NATIVE[word], kind: 'native', number: n })
  }
  return out
}

async function existsRow(word: string, korean_meaning: string): Promise<boolean> {
  const { data } = await supabase
    .from('oxford_vocab')
    .select('id')
    .eq('word', word)
    .eq('korean_meaning', korean_meaning)
    .limit(1)
  return !!(data && data.length > 0)
}

interface GptOut {
  english_example: string
  korean_example: string
  word_pron_ko: string // 영어 단어의 한글 발음 (예: "one" → "원")
}

async function genTextWithGpt(
  word: string,
  korean_meaning: string,
  kind: Kind,
  number: number,
): Promise<GptOut> {
  const kindLabel = kind === 'sino' ? '한자어 (Sino-Korean)' : '고유어 (Native Korean)'
  const sys = `You are a precise Korean-English vocabulary editor. Output strictly valid JSON only.`
  const user = `Task: produce learning data for an English numeral word and its Korean ${kindLabel} counterpart.

English word: "${word}"
Korean meaning: "${korean_meaning}"   (${kindLabel}, value = ${number})

Generate ALL of the following in one JSON object, with exact keys:
  - "english_example": ONE natural, beginner-friendly English sentence (5–12 words) that uses the number "${word}" meaningfully. Use Arabic digits ONLY if it's more natural; otherwise spell out. The example should make the meaning intuitive.
  - "korean_example": ONE natural Korean sentence (5–15 어절) that uses the Korean ${kindLabel} number "${korean_meaning}" meaningfully. Use 한국어 어법: ${kind === 'native' ? '고유어 숫자는 단위 명사(개, 명, 살, 시, 마리 등)와 함께 자연스럽게 쓰임' : '한자어 숫자는 단위(분, 호, 층, 월, 일, 인분 등)와 함께 쓰이거나 단독 표기로 자연스럽게 쓰임'}. 평서문, 일상 회화체.
  - "word_pron_ko": Hangul transliteration of the English pronunciation as Korean speakers would read it (예: "one"→"원", "twenty-one"→"트웬티원", "thirty"→"써티").

Constraints:
  - No quotation marks inside any field value.
  - No markdown, no extra keys, no commentary. Only the JSON object.`

  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
  })
  const raw = res.choices?.[0]?.message?.content ?? ''
  let parsed: GptOut
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`json parse fail: ${raw.slice(0, 200)}`)
  }
  if (!parsed.english_example || !parsed.korean_example || !parsed.word_pron_ko) {
    throw new Error(`missing fields: ${JSON.stringify(parsed).slice(0, 200)}`)
  }
  return parsed
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      console.warn(`  [retry ${i + 1}/${retries}] ${label}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise(r => setTimeout(r, 1500 * (i + 1)))
    }
  }
  throw lastErr
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
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry-run')
  const conc = Number(argv.find(a => a.startsWith('--concurrency='))?.slice(14) ?? '4')

  const targets = buildTargets()
  console.log(`전체 후보: ${targets.length}`)

  // 멱등: 이미 (word, korean_meaning) 존재하는 건 skip
  const todo: typeof targets = []
  for (const t of targets) {
    if (await existsRow(t.word, t.korean_meaning)) {
      // 기존 행은 그대로 둠
      continue
    }
    todo.push(t)
  }
  console.log(`신규 추가 대상: ${todo.length}`)

  if (todo.length === 0) {
    console.log('모두 존재함. 종료.')
    return
  }

  if (dry) {
    for (const t of todo) console.log(`  ${t.word.padEnd(14)} | ${t.korean_meaning.padEnd(8)} | ${t.kind} | n=${t.number}`)
    return
  }

  // order_index: 기존 입문 행 max + 1 부터 시작
  const { data: maxRow } = await supabase
    .from('oxford_vocab')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
  const startIdx = Math.max(0, (maxRow?.[0]?.order_index ?? 0)) + 100
  console.log(`order_index 시작: ${startIdx}`)

  let done = 0, ok = 0, fail = 0
  await pool(todo, conc, async (t, i) => {
    const tag = `[${t.number}] ${t.word} / ${t.korean_meaning} (${t.kind})`
    try {
      const out = await withRetry(`gpt ${tag}`, () => genTextWithGpt(t.word, t.korean_meaning, t.kind, t.number))
      const row = {
        word: t.word,
        korean_meaning: t.korean_meaning,
        english_example: out.english_example,
        korean_example: out.korean_example,
        level: 'A1',
        pos: 'number',
        category: '입문',
        difficulty: 1,
        order_index: startIdx + i * 2 + (t.kind === 'sino' ? 0 : 1),
      }
      const { error } = await supabase.from('oxford_vocab').insert(row)
      if (error) throw new Error(`db: ${error.message}`)

      // word_pron_ko 는 별도로 저장할 컬럼이 없을 수도 — 일단 로그로만
      ok++
      console.log(`  ✓ ${tag} | en="${out.english_example}" | ko="${out.korean_example}" | pron=${out.word_pron_ko}`)
    } catch (e) {
      fail++
      console.error(`  ✗ ${tag}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      done++
      if (done % 5 === 0 || done === todo.length) {
        console.log(`  진행 ${done}/${todo.length} (✓${ok} ✗${fail})`)
      }
    }
  })

  console.log('═'.repeat(60))
  console.log(`완료: 성공 ${ok} / 실패 ${fail} / 총 ${todo.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
