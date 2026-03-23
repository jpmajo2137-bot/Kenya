/**
 * GPT-5.2 Pro를 사용한 단어 주제별 분류 스크립트
 * - Supabase에서 모든 단어를 가져옴
 * - GPT-5.2 Pro로 각 단어를 주제별 카테고리에 분류
 * - 결과를 src/lib/topicClassification.ts에 저장
 *
 * 사용법: npx tsx scripts/classify-words.ts
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const OPENAI_MODEL = 'gpt-5.2'
const BATCH_SIZE = 40

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const TOPIC_CATEGORIES = [
  '숫자/수량',
  '음식/음료',
  '가족/관계',
  '자연/동물',
  '집/생활용품',
  '인사/기본표현',
  '신체/건강',
  '시간/날짜',
  '색상/외모',
  '교통/이동',
  '감정/성격',
  '직업/교육',
] as const

type WordRow = {
  id: string
  mode: string
  word: string
  meaning_en: string | null
  meaning_ko: string | null
  meaning_sw: string | null
  pos: string | null
  category: string | null
}

const SYSTEM_PROMPT = `You are a vocabulary classification expert for a Korean-Swahili language learning app.

Classify each word into one or more of these topic categories:
${TOPIC_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Classification rules:
- Assign EVERY word to at least one category based on its meaning.
- A word CAN belong to multiple categories if it genuinely fits.
- Consider the PRIMARY meaning and usage context.
- Be strict and accurate. Only assign a category if the word clearly belongs there.
- Numbers, counting words → 숫자/수량
- Food, drinks, cooking, ingredients → 음식/음료
- Family members, relationships, people → 가족/관계
- Animals, plants, nature, weather → 자연/동물
- House, furniture, daily objects, tools → 집/생활용품
- Greetings, basic phrases, yes/no, polite expressions → 인사/기본표현
- Body parts, health, illness, medicine → 신체/건강
- Time, dates, days, months, seasons → 시간/날짜
- Colors, appearance, shapes, size → 색상/외모
- Vehicles, directions, movement verbs → 교통/이동
- Emotions, feelings, personality traits, states → 감정/성격
- Jobs, professions, school, education, study → 직업/교육

Return a valid JSON object. Keys are the word IDs, values are arrays of category names.
Example:
{
  "id1": ["숫자/수량"],
  "id2": ["음식/음료", "집/생활용품"],
  "id3": ["감정/성격"]
}`

async function classifyBatch(
  words: WordRow[],
  batchNum: number,
  totalBatches: number,
): Promise<Record<string, string[]>> {
  const wordList = words
    .map(
      (w, i) =>
        `${i + 1}. [${w.id}] "${w.word}" — EN: ${w.meaning_en || '?'}, KO: ${w.meaning_ko || '?'}, SW: ${w.meaning_sw || '?'}, POS: ${w.pos || '?'}`,
    )
    .join('\n')

  console.log(`\n🤖 배치 ${batchNum}/${totalBatches} (${words.length}개) 분류 중...`)

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Classify these ${words.length} words into topic categories. Return ONLY a JSON object.\n\n${wordList}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No response from GPT')

  const parsed = JSON.parse(content) as Record<string, string[]>

  // 결과 검증
  let classified = 0
  for (const w of words) {
    if (parsed[w.id] && Array.isArray(parsed[w.id]) && parsed[w.id].length > 0) {
      classified++
    } else {
      console.log(`   ⚠️ 미분류: "${w.word}" (${w.id})`)
      parsed[w.id] = ['감정/성격'] // 미분류시 기본값
    }
  }

  console.log(`   ✅ ${classified}/${words.length}개 분류 완료`)
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
        .select('id, mode, word, meaning_en, meaning_ko, meaning_sw, pos, category')
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
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🚀 GPT-5.2 Pro 단어 주제별 분류 시작')
  console.log('═══════════════════════════════════════════════════════════')

  const progressFile = path.join(process.cwd(), 'scripts', '_classify_progress.json')
  let existingResults: Record<string, string[]> = {}
  const existingModes: Record<string, string> = {}

  if (fs.existsSync(progressFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(progressFile, 'utf-8'))
      existingResults = saved.results || {}
      Object.assign(existingModes, saved.modes || {})
      console.log(`📂 이전 진행 상태 로드: ${Object.keys(existingResults).length}개 완료`)
    } catch {
      console.log('📂 이전 진행 상태 로드 실패, 처음부터 시작')
    }
  }

  console.log('\n📡 Supabase에서 단어 로드 중...')
  const allWords = await fetchAllWords()
  console.log(`   📊 총 ${allWords.length}개 단어 로드됨`)

  const swCount = allWords.filter((w) => w.mode === 'sw').length
  const koCount = allWords.filter((w) => w.mode === 'ko').length
  console.log(`   SW: ${swCount}개, KO: ${koCount}개`)

  const unclassified = allWords.filter((w) => !existingResults[w.id])
  console.log(`   🔄 미분류: ${unclassified.length}개`)

  if (unclassified.length === 0) {
    console.log('\n✅ 모든 단어가 이미 분류됨!')
  } else {
    const totalBatches = Math.ceil(unclassified.length / BATCH_SIZE)

    for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
      const batch = unclassified.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1

      try {
        const result = await classifyBatch(batch, batchNum, totalBatches)
        Object.assign(existingResults, result)

        for (const w of batch) {
          existingModes[w.id] = w.mode
        }

        // 진행 상태 저장
        fs.writeFileSync(
          progressFile,
          JSON.stringify({ results: existingResults, modes: existingModes }, null, 2),
          'utf-8',
        )
      } catch (err) {
        console.error(`   ❌ 배치 ${batchNum} 실패:`, err)
        console.log('   💾 진행 상태 저장 후 계속...')
      }

      // Rate limit
      if (i + BATCH_SIZE < unclassified.length) {
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
  }

  // mode 정보 보완
  for (const w of allWords) {
    if (!existingModes[w.id]) existingModes[w.id] = w.mode
  }

  // 최종 분류 데이터 생성 (compact format: [mode, ...tags])
  const classificationData: Record<string, string[]> = {}
  for (const [id, tags] of Object.entries(existingResults)) {
    const mode = existingModes[id] || 'sw'
    classificationData[id] = [mode, ...tags]
  }

  // 통계
  const tagStats: Record<string, { sw: number; ko: number }> = {}
  for (const cats of TOPIC_CATEGORIES) {
    tagStats[cats] = { sw: 0, ko: 0 }
  }
  for (const [, arr] of Object.entries(classificationData)) {
    const mode = arr[0]
    const tags = arr.slice(1)
    for (const t of tags) {
      if (tagStats[t]) {
        if (mode === 'sw') tagStats[t].sw++
        else tagStats[t].ko++
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('📊 분류 통계:')
  for (const [tag, counts] of Object.entries(tagStats)) {
    console.log(`   ${tag}: SW ${counts.sw}개, KO ${counts.ko}개 (총 ${counts.sw + counts.ko}개)`)
  }

  // TypeScript 파일로 저장
  const outputPath = path.join(process.cwd(), 'src', 'lib', 'topicClassification.ts')
  const tsContent = `// GPT-5.2 Pro로 자동 분류된 단어 주제 데이터
// 형식: { word_id: [mode, tag1, tag2, ...] }
// 생성일: ${new Date().toISOString()}
// 총 ${Object.keys(classificationData).length}개 단어

export const CLASSIFIED_TOPICS = ${JSON.stringify(TOPIC_CATEGORIES)} as const

export type TopicName = typeof CLASSIFIED_TOPICS[number]

const data: Record<string, string[]> = ${JSON.stringify(classificationData)}

export default data
`
  fs.writeFileSync(outputPath, tsContent, 'utf-8')

  console.log(`\n✅ 분류 파일 저장: ${outputPath}`)
  console.log(`   총 ${Object.keys(classificationData).length}개 단어 분류 완료`)
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(console.error)
