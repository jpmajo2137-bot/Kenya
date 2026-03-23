/**
 * GPT-5.2 Pro를 사용한 단어 품사(POS) 분류 스크립트
 * - Phase 1: 기존 pos 값 정규화 (n. → noun, v. → verb 등)
 * - Phase 2: pos가 null/미분류인 단어를 GPT-5.2 Pro로 분류
 * - 결과를 Supabase generated_vocab 테이블의 pos 컬럼에 직접 UPDATE
 *
 * 사용법: npx tsx scripts/classify-pos.ts
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

const VALID_POS = ['noun', 'verb', 'adjective', 'adverb', 'phrase'] as const
type ValidPos = (typeof VALID_POS)[number]

const POS_NORMALIZE_MAP: Record<string, ValidPos> = {
  'n.': 'noun',
  'v.': 'verb',
  'adj.': 'adjective',
  'adv.': 'adverb',
  'interj.': 'phrase',
  'num.': 'noun',
  'pron.': 'noun',
  'prep.': 'phrase',
  'conj.': 'phrase',
  'det.': 'adjective',
  'noun': 'noun',
  'verb': 'verb',
  'adjective': 'adjective',
  'adverb': 'adverb',
  'phrase': 'phrase',
}

type WordRow = {
  id: string
  mode: string
  word: string
  meaning_en: string | null
  meaning_ko: string | null
  meaning_sw: string | null
  pos: string | null
}

const SYSTEM_PROMPT = `You are a linguistics expert classifying words by part of speech for a Korean-Swahili language learning app.

Classify each word into exactly ONE of these parts of speech:
1. noun — Names of things, people, places, concepts
2. verb — Actions, states, processes
3. adjective — Describes/modifies nouns (qualities, properties)
4. adverb — Modifies verbs, adjectives, or other adverbs (manner, time, degree)
5. phrase — Fixed expressions, greetings, interjections, multi-word units, prepositions, conjunctions

Classification rules:
- Assign exactly ONE part of speech per word.
- Use the PRIMARY, most common usage of the word.
- If a word can be multiple POS, pick the most frequent one based on its meaning context.
- Korean words ending in -하다 that describe actions → verb
- Korean words ending in -하다 that describe states/qualities → adjective
- Korean words ending in -적(인) → adjective
- Korean words ending in -히, -게, -로 (adverbial) → adverb
- Swahili words starting with ku- (infinitive) → verb
- Swahili words starting with m-/wa- (noun class) → noun
- Greetings like "habari", "jambo", "안녕하세요" → phrase

Return a valid JSON object. Keys are the word IDs, values are the POS string.
Example:
{
  "id1": "noun",
  "id2": "verb",
  "id3": "adjective"
}`

async function classifyBatch(
  words: WordRow[],
  batchNum: number,
  totalBatches: number,
): Promise<Record<string, string>> {
  const wordList = words
    .map(
      (w, i) =>
        `${i + 1}. [${w.id}] "${w.word}" — EN: ${w.meaning_en || '?'}, KO: ${w.meaning_ko || '?'}, SW: ${w.meaning_sw || '?'}`,
    )
    .join('\n')

  console.log(`\n  배치 ${batchNum}/${totalBatches} (${words.length}개) 분류 중...`)

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Classify these ${words.length} words by part of speech. Return ONLY a JSON object.\n\n${wordList}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No response from GPT')

  const parsed = JSON.parse(content) as Record<string, string>

  let classified = 0
  for (const w of words) {
    const val = parsed[w.id]
    if (val && VALID_POS.includes(val as ValidPos)) {
      classified++
    } else {
      console.log(`   -> 미분류/잘못된 값: "${w.word}" (${w.id}) = "${val}"`)
      parsed[w.id] = 'noun'
    }
  }

  console.log(`   -> ${classified}/${words.length}개 분류 완료`)
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

async function updatePosInDb(id: string, pos: string): Promise<boolean> {
  const { error } = await supabase
    .from('generated_vocab')
    .update({ pos })
    .eq('id', id)

  if (error) {
    console.log(`   DB 업데이트 실패 (${id}): ${error.message}`)
    return false
  }
  return true
}

async function main() {
  console.log('===========================================================')
  console.log('  GPT-5.2 Pro 품사(POS) 분류 스크립트')
  console.log('===========================================================')

  const progressFile = path.join(process.cwd(), 'scripts', '_classify_pos_progress.json')
  let existingResults: Record<string, string> = {}

  if (fs.existsSync(progressFile)) {
    try {
      existingResults = JSON.parse(fs.readFileSync(progressFile, 'utf-8'))
      console.log(`  이전 진행 상태 로드: ${Object.keys(existingResults).length}개 완료`)
    } catch {
      console.log('  이전 진행 상태 로드 실패, 처음부터 시작')
    }
  }

  console.log('\n  Supabase에서 단어 로드 중...')
  const allWords = await fetchAllWords()
  console.log(`  총 ${allWords.length}개 단어 로드됨`)

  const swCount = allWords.filter((w) => w.mode === 'sw').length
  const koCount = allWords.filter((w) => w.mode === 'ko').length
  console.log(`  SW: ${swCount}개, KO: ${koCount}개`)

  // ── Phase 1: 기존 pos 값 정규화 ──
  console.log('\n-----------------------------------------------------------')
  console.log('  Phase 1: 기존 pos 값 정규화')
  console.log('-----------------------------------------------------------')

  const posStats: Record<string, number> = {}
  for (const w of allWords) {
    const key = w.pos ?? '(null)'
    posStats[key] = (posStats[key] || 0) + 1
  }
  console.log('  현재 pos 분포:')
  for (const [pos, count] of Object.entries(posStats).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${pos}: ${count}개`)
  }

  let normalizeCount = 0
  const needsNormalize = allWords.filter((w) => {
    if (!w.pos) return false
    const normalized = POS_NORMALIZE_MAP[w.pos.toLowerCase()]
    return normalized && normalized !== w.pos
  })

  console.log(`\n  정규화 필요: ${needsNormalize.length}개`)

  for (const w of needsNormalize) {
    const normalized = POS_NORMALIZE_MAP[w.pos!.toLowerCase()]!
    const ok = await updatePosInDb(w.id, normalized)
    if (ok) {
      normalizeCount++
      existingResults[w.id] = normalized
      w.pos = normalized
    }
  }
  console.log(`  정규화 완료: ${normalizeCount}개`)

  // ── Phase 2: GPT 분류 ──
  console.log('\n-----------------------------------------------------------')
  console.log('  Phase 2: GPT-5.2 Pro 품사 분류')
  console.log('-----------------------------------------------------------')

  const needsClassification = allWords.filter((w) => {
    if (existingResults[w.id]) return false
    if (w.pos && VALID_POS.includes(w.pos as ValidPos)) return false
    return true
  })

  console.log(`  GPT 분류 필요: ${needsClassification.length}개`)

  if (needsClassification.length === 0) {
    console.log('\n  모든 단어가 이미 분류됨!')
  } else {
    const totalBatches = Math.ceil(needsClassification.length / BATCH_SIZE)

    for (let i = 0; i < needsClassification.length; i += BATCH_SIZE) {
      const batch = needsClassification.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1

      try {
        const result = await classifyBatch(batch, batchNum, totalBatches)

        let dbUpdated = 0
        for (const w of batch) {
          const pos = result[w.id]
          if (pos) {
            const ok = await updatePosInDb(w.id, pos)
            if (ok) dbUpdated++
            existingResults[w.id] = pos
          }
        }
        console.log(`   -> DB 업데이트: ${dbUpdated}/${batch.length}개`)

        fs.writeFileSync(progressFile, JSON.stringify(existingResults, null, 2), 'utf-8')
      } catch (err) {
        console.error(`   배치 ${batchNum} 실패:`, err)
        console.log('   진행 상태 저장 후 계속...')
        fs.writeFileSync(progressFile, JSON.stringify(existingResults, null, 2), 'utf-8')
      }

      if (i + BATCH_SIZE < needsClassification.length) {
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
  }

  // ── 최종 통계 ──
  console.log('\n===========================================================')
  console.log('  최종 통계')
  console.log('===========================================================')

  const finalStats: Record<string, { sw: number; ko: number }> = {}
  for (const p of VALID_POS) {
    finalStats[p] = { sw: 0, ko: 0 }
  }
  finalStats['other'] = { sw: 0, ko: 0 }

  for (const w of allWords) {
    const pos = existingResults[w.id] || w.pos
    const key = pos && VALID_POS.includes(pos as ValidPos) ? pos : 'other'
    if (w.mode === 'sw') finalStats[key].sw++
    else finalStats[key].ko++
  }

  for (const [pos, counts] of Object.entries(finalStats)) {
    console.log(`  ${pos}: SW ${counts.sw}개, KO ${counts.ko}개 (총 ${counts.sw + counts.ko}개)`)
  }

  console.log(`\n  총 ${Object.keys(existingResults).length}개 단어 처리 완료`)
  console.log('===========================================================')
}

main().catch(console.error)
