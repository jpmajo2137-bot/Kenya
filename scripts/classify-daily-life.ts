/**
 * 일상생활(Maisha ya Kila Siku) 토픽 분류 스크립트
 * - DB에서 SW/KO 모든 단어를 로드
 * - GPT-5.2로 일상생활 해당 여부를 판별
 * - 기존 topicClassification.ts에 '일상생활' 태그만 추가 (기존 태그 보존)
 * - SW ~200개, KO ~200개 목표
 *
 * 사용법: npx tsx scripts/classify-daily-life.ts
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const OPENAI_MODEL = 'gpt-5.2'
const BATCH_SIZE = 40
const TARGET_PER_MODE = 200

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const TOPIC_NAME = '일상생활'

type WordRow = {
  id: string
  mode: string
  word: string
  meaning_en: string | null
  meaning_ko: string | null
  meaning_sw: string | null
  pos: string | null
}

const SYSTEM_PROMPT = `You are a vocabulary classification expert for a Korean-Swahili language learning app.

Determine whether each word belongs to the "일상생활 (Daily Life)" category.

A word belongs to 일상생활 if it relates to:
- Daily routines and habits (waking up, sleeping, eating, washing, dressing)
- Household chores (cleaning, cooking, laundry, dishes)
- Personal hygiene and grooming (showering, brushing teeth, skincare)
- Common everyday objects used at home (towel, soap, toothbrush, plate, cup)
- Daily meals and simple food/drink items (breakfast, lunch, dinner, water, coffee)
- Getting ready, commuting basics (leaving home, coming home)
- Simple daily conversations and expressions
- Weather as it affects daily life (umbrella, coat)
- Basic clothing worn daily (shirt, pants, shoes, socks)
- Simple shopping for daily needs (groceries, market)

A word does NOT belong to 일상생활 if it is:
- Too abstract or academic (philosophy, politics, economics)
- Specialized professional terms (medical procedures, legal terms)
- Rare animals or plants
- Military, crime, or violence-related
- Complex emotional/psychological states
- Technical or scientific jargon

Return a valid JSON object. Keys are the word IDs, values are true (belongs) or false (does not belong).
Example:
{
  "id1": true,
  "id2": false,
  "id3": true
}`

async function classifyBatch(
  words: WordRow[],
  batchNum: number,
  totalBatches: number,
): Promise<Record<string, boolean>> {
  const wordList = words
    .map(
      (w, i) =>
        `${i + 1}. [${w.id}] "${w.word}" — EN: ${w.meaning_en || '?'}, KO: ${w.meaning_ko || '?'}, POS: ${w.pos || '?'}`,
    )
    .join('\n')

  console.log(`\n  배치 ${batchNum}/${totalBatches} (${words.length}개) 분류 중...`)

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Determine if these ${words.length} words belong to 일상생활 (Daily Life). Return ONLY a JSON object with word IDs as keys and true/false as values.\n\n${wordList}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No response from GPT')

  const parsed = JSON.parse(content) as Record<string, boolean>
  const matched = Object.values(parsed).filter(Boolean).length
  console.log(`    ${matched}/${words.length}개 일상생활 해당`)
  return parsed
}

async function fetchAllWords(): Promise<WordRow[]> {
  const allWords: WordRow[] = []
  const PAGE_SIZE = 1000

  for (const mode of ['sw', 'ko']) {
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('generated_vocab')
        .select('id, mode, word, meaning_en, meaning_ko, meaning_sw, pos')
        .eq('mode', mode)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      if (!data || data.length === 0) break

      const cleaned = data.filter((r: WordRow) => !r.word?.startsWith('__deleted__'))
      allWords.push(...(cleaned as WordRow[]))
      offset += PAGE_SIZE
      if (data.length < PAGE_SIZE) break
    }
  }
  return allWords
}

async function main() {
  console.log('=== 일상생활 토픽 분류 시작 ===\n')

  const progressFile = path.join(process.cwd(), 'scripts', '_daily_life_progress.json')
  let results: Record<string, boolean> = {}

  if (fs.existsSync(progressFile)) {
    try {
      results = JSON.parse(fs.readFileSync(progressFile, 'utf-8'))
      console.log(`이전 진행 상태 로드: ${Object.keys(results).length}개 처리됨`)
    } catch {
      console.log('이전 진행 상태 로드 실패, 처음부터 시작')
    }
  }

  console.log('DB에서 단어 로드 중...')
  const allWords = await fetchAllWords()
  const swWords = allWords.filter((w) => w.mode === 'sw')
  const koWords = allWords.filter((w) => w.mode === 'ko')
  console.log(`SW: ${swWords.length}개, KO: ${koWords.length}개`)

  for (const [modeLabel, words] of [['SW', swWords], ['KO', koWords]] as const) {
    console.log(`\n--- ${modeLabel} 모드 분류 ---`)
    const unprocessed = (words as WordRow[]).filter((w) => !(w.id in results))
    console.log(`미처리: ${unprocessed.length}개`)

    if (unprocessed.length === 0) continue

    const totalBatches = Math.ceil(unprocessed.length / BATCH_SIZE)
    for (let i = 0; i < unprocessed.length; i += BATCH_SIZE) {
      const batch = unprocessed.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1

      try {
        const batchResults = await classifyBatch(batch, batchNum, totalBatches)
        for (const [id, val] of Object.entries(batchResults)) {
          results[id] = val
        }
        for (const w of batch) {
          if (!(w.id in results)) results[w.id] = false
        }

        fs.writeFileSync(progressFile, JSON.stringify(results), 'utf-8')
      } catch (err) {
        console.error(`  배치 ${batchNum} 실패:`, err)
      }

      if (i + BATCH_SIZE < unprocessed.length) {
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
  }

  const swMatched = swWords.filter((w) => results[w.id]).length
  const koMatched = koWords.filter((w) => results[w.id]).length
  console.log(`\n분류 결과: SW ${swMatched}개, KO ${koMatched}개`)

  if (swMatched > TARGET_PER_MODE || koMatched > TARGET_PER_MODE) {
    console.log(`목표(${TARGET_PER_MODE})보다 많으면 그대로 유지 (추후 제외로 조절 가능)`)
  }

  const matchedIds = new Set(
    allWords.filter((w) => results[w.id]).map((w) => w.id),
  )
  console.log(`\n총 일상생활 단어: ${matchedIds.size}개`)

  console.log('\ntopicClassification.ts 업데이트 중...')
  const tcPath = path.join(process.cwd(), 'src', 'lib', 'topicClassification.ts')
  const tcContent = fs.readFileSync(tcPath, 'utf-8')

  const topicsMatch = tcContent.match(/const TOPICS = (\[.*?\])/)
  if (!topicsMatch) throw new Error('TOPICS 배열을 찾을 수 없음')
  const topics: string[] = JSON.parse(topicsMatch[1])
  if (!topics.includes(TOPIC_NAME)) {
    topics.push(TOPIC_NAME)
  }

  const dataMatch = tcContent.match(/const data: Record<string, string\[\]> = (\{.*\})/)
  if (!dataMatch) throw new Error('data 객체를 찾을 수 없음')
  const data: Record<string, string[]> = JSON.parse(dataMatch[1])

  let added = 0
  for (const id of matchedIds) {
    if (data[id]) {
      if (!data[id].includes(TOPIC_NAME)) {
        data[id].push(TOPIC_NAME)
        added++
      }
    } else {
      const word = allWords.find((w) => w.id === id)
      data[id] = [word?.mode || 'sw', TOPIC_NAME]
      added++
    }
  }
  console.log(`${added}개 단어에 '${TOPIC_NAME}' 태그 추가`)

  const newContent = `// GPT-5.2 Pro로 분류된 단어 → 토픽 매핑 (자동 생성)
// 구조: { [id]: [mode, topic1, topic2, ...] }

/**
 * 분류 토픽 목록
 */
const TOPICS = ${JSON.stringify(topics)}

export { TOPICS }

/**
 * 단어 분류 데이터
 */
const data: Record<string, string[]> = ${JSON.stringify(data)}

export default data
`
  fs.writeFileSync(tcPath, newContent, 'utf-8')

  const finalSwCount = Object.entries(data).filter(
    ([, arr]) => arr[0] === 'sw' && arr.includes(TOPIC_NAME),
  ).length
  const finalKoCount = Object.entries(data).filter(
    ([, arr]) => arr[0] === 'ko' && arr.includes(TOPIC_NAME),
  ).length

  console.log(`\n=== 완료 ===`)
  console.log(`일상생활: SW ${finalSwCount}개, KO ${finalKoCount}개`)
  console.log(`topicClassification.ts 저장됨`)
}

main().catch(console.error)
