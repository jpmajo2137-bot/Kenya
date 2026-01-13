/**
 * GPT-5.2 + OpenAI TTS (여성 목소리) 단어 생성 스크립트
 * 
 * SW 모드: 케냐(스와힐리어) 사용자를 위한 한국어 학습
 * - 한국어 단어 + 스와힐리어 뜻 + 영어 뜻 + 한국어 예문 + 예문의 스와힐리어/영어 번역
 * - 발음 문자: 한국어 단어, 영어 뜻, 한국어 예문
 * - TTS: 모든 단어, 뜻, 예문
 * 
 * KO 모드: 한국어 사용자를 위한 스와힐리어 학습
 * - 스와힐리어 단어 + 한국어 뜻 + 영어 뜻 + 스와힐리어 예문 + 예문의 한국어/영어 번역
 * - 발음 문자: 스와힐리어 단어, 영어 뜻, 스와힐리어 예문
 * - TTS: 모든 단어, 뜻, 예문
 * 
 * 실행:
 *   npx tsx scripts/generate-gpt52-openai-tts.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const OPENAI_KEY = process.env.VITE_OPENAI_API_KEY
const OPENAI_MODEL = 'gpt-5.1' // OpenAI 최신 모델
const BUCKET = 'vocabaudio'

// 여성 목소리: nova, shimmer, alloy 중 nova 선택 (자연스러운 여성 목소리)
const TTS_MODEL = 'tts-1-hd'
const TTS_VOICE = 'nova' // 여성 목소리

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  throw new Error('Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_OPENAI_API_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

type Mode = 'sw' | 'ko'

type GeneratedRow = {
  mode: Mode
  word: string
  word_pronunciation: string
  word_audio_url?: string

  meaning_sw: string
  meaning_sw_pronunciation: string
  meaning_sw_audio_url?: string

  meaning_ko: string
  meaning_ko_pronunciation: string
  meaning_ko_audio_url?: string

  meaning_en: string
  meaning_en_pronunciation: string
  meaning_en_audio_url?: string

  example: string
  example_pronunciation: string
  example_audio_url?: string
  example_translation_sw: string
  example_translation_ko: string
  example_translation_en: string

  pos: string
  category: string
  difficulty: number
}

function pickSamples(filePath: string, count: number): string[] {
  const csv = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).slice(1)
  const pool = csv.filter(Boolean).slice(0, 100) // 상위 100행에서 샘플
  const out: string[] = []
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    const row = pool.splice(idx, 1)[0]!
    // CSV 파싱: Word 컬럼 (3번째)
    const cols = row.split(',')
    if (cols[2]) {
      out.push(cols[2].trim())
    }
  }
  return out
}

function systemPromptSW(samples: string) {
  return `You are a world-class linguist specializing in Korean language education for Kiswahili (Kenya) speakers.

Using these English seed words as thematic inspiration (you may create related Korean words):
${samples}

Generate EXACTLY 10 high-quality vocabulary entries as JSON: { "words": [ ... ] }

Each entry must have ALL these fields:
- word: Korean word (Hangul) - practical, commonly used
- word_pronunciation: Korean Revised Romanization (RR) - REQUIRED, accurate
- meaning_sw: Kiswahili meaning (Kenya usage, natural)
- meaning_sw_pronunciation: "" (empty string - native speakers don't need this)
- meaning_ko: Korean definition (for reference)
- meaning_ko_pronunciation: "" (empty string)
- meaning_en: English meaning (natural, accurate)
- meaning_en_pronunciation: English IPA or clear phonetic guide - REQUIRED
- example: Korean example sentence (natural, daily conversation, 5-10 words)
- example_pronunciation: Korean RR for the example - REQUIRED
- example_translation_sw: Kiswahili translation of the example (natural Kenya Swahili)
- example_translation_ko: Korean translation (same as example)
- example_translation_en: English translation
- pos: part of speech (noun/verb/adjective/adverb/etc.)
- category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
- difficulty: 1-5 (1=beginner, 5=advanced)

QUALITY RULES:
1. Choose practical, frequently-used Korean words
2. Ensure all pronunciations are accurate and consistent
3. Make examples natural and useful for daily conversation
4. Kiswahili translations should sound natural to Kenya speakers
5. No duplicate words
6. Avoid rare, archaic, or overly formal words
7. Korean RR: Use standard Revised Romanization (e.g., 안녕하세요 → annyeonghaseyo)
8. English pronunciation: Use English-readable format (e.g., beach → "beech", agree → "uh-GREE")`
}

function systemPromptKO(samples: string) {
  return `You are a world-class linguist specializing in Kiswahili (Kenya) language education for Korean speakers.

Using these English seed words as thematic inspiration (you may create related Kiswahili words):
${samples}

Generate EXACTLY 10 high-quality vocabulary entries as JSON: { "words": [ ... ] }

Each entry must have ALL these fields:
- word: Kiswahili word (Kenya usage) - practical, commonly used
- word_pronunciation: Kiswahili IPA or clear phonetic guide - REQUIRED
- meaning_ko: Korean meaning (natural, accurate)
- meaning_ko_pronunciation: "" (empty string - native speakers don't need this)
- meaning_sw: Kiswahili definition (for reference)
- meaning_sw_pronunciation: "" (empty string)
- meaning_en: English meaning (natural)
- meaning_en_pronunciation: English IPA or clear phonetic guide - REQUIRED
- example: Kiswahili example sentence (natural Kenya usage, 5-10 words)
- example_pronunciation: Kiswahili phonetic guide - REQUIRED
- example_translation_sw: Kiswahili translation (same as example)
- example_translation_ko: Korean translation of the example
- example_translation_en: English translation
- pos: part of speech (noun/verb/adjective/adverb/etc.)
- category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
- difficulty: 1-5 (1=beginner, 5=advanced)

QUALITY RULES:
1. Choose practical, frequently-used Kiswahili words (Kenya dialect preferred)
2. Ensure all pronunciations are accurate
3. Make examples natural and useful for daily conversation in Kenya
4. Korean translations should be natural for Korean speakers
5. No duplicate words
6. Avoid rare or archaic words
7. CRITICAL - Pronunciation format for TTS compatibility:
   - Use English-readable phonetic spelling (NOT IPA symbols)
   - Separate syllables with hyphens
   - Use CAPS for stressed syllables
   - Examples: habari → "hah-BAH-ree", kukubaliana → "koo-koo-bah-lee-AH-nah"
   - This format allows text-to-speech to read Swahili words correctly`
}

function validateWord(x: any): Omit<GeneratedRow, 'mode'> {
  const required = [
    'word', 'word_pronunciation',
    'meaning_sw', 'meaning_sw_pronunciation',
    'meaning_ko', 'meaning_ko_pronunciation',
    'meaning_en', 'meaning_en_pronunciation',
    'example', 'example_pronunciation',
    'example_translation_sw', 'example_translation_ko', 'example_translation_en',
    'pos', 'category', 'difficulty',
  ]
  for (const k of required) {
    if (x?.[k] === undefined || x?.[k] === null) {
      throw new Error(`Missing field: ${k}`)
    }
  }
  const d = Math.max(1, Math.min(5, Number(x.difficulty) || 1))
  return { ...x, difficulty: d }
}

async function generateBatch(mode: Mode, samples: string[]): Promise<Omit<GeneratedRow, 'mode'>[]> {
  const prompt = mode === 'sw' ? systemPromptSW(samples.join(', ')) : systemPromptKO(samples.join(', '))
  
  console.log(`   GPT-4.1 호출 중... (${mode} 모드)`)
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate 10 entries now. Output ONLY valid JSON, no markdown.' },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 4500,
  })

  const content = res.choices[0]?.message?.content
  if (!content) throw new Error('No OpenAI content')
  
  const parsed = JSON.parse(content)
  const words = Array.isArray(parsed) ? parsed : parsed.words
  if (!Array.isArray(words) || words.length !== 10) {
    throw new Error(`Expected 10 words, got ${Array.isArray(words) ? words.length : 'non-array'}`)
  }
  return words.map(validateWord)
}

function toSlug(text: string, suffix: string) {
  const base = text.toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 30)
  return `${base}_${suffix}`.replace(/[^a-z0-9_-]/g, '').slice(0, 60)
}

async function generateTTS(text: string, lang: 'ko' | 'sw' | 'en'): Promise<ArrayBuffer> {
  // OpenAI TTS는 다국어 자동 감지, 여성 목소리(nova) 사용
  console.log(`      TTS 생성: ${text.slice(0, 30)}...`)
  
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    response_format: 'mp3',
  })
  
  const buffer = await response.arrayBuffer()
  return buffer
}

async function uploadAudio(audio: ArrayBuffer, pathKey: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).upload(pathKey, audio, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return urlData.publicUrl
}

async function addTTS(row: Omit<GeneratedRow, 'mode'>, mode: Mode, idx: number): Promise<Omit<GeneratedRow, 'mode'>> {
  const base = `gpt52/${mode}/${toSlug(row.word, String(idx + 1))}`

  // 1. 단어 TTS - 스와힐리어는 발음 가이드 사용
  let wordTtsText = row.word
  if (mode === 'ko') {
    // KO 모드: 스와힐리어 단어 → 발음 가이드로 TTS 생성 (더 정확한 발음)
    wordTtsText = row.word_pronunciation || row.word
  }
  const wordAudio = await generateTTS(wordTtsText, mode === 'sw' ? 'ko' : 'en')
  const word_audio_url = await uploadAudio(wordAudio, `${base}_word.mp3`)

  // 2. 스와힐리어 뜻 TTS - 발음 가이드가 있으면 사용
  const swTtsText = row.meaning_sw_pronunciation || row.meaning_sw
  const swAudio = await generateTTS(swTtsText, 'en') // 영어 발음으로 읽음
  const meaning_sw_audio_url = await uploadAudio(swAudio, `${base}_meaning_sw.mp3`)

  // 3. 한국어 뜻 TTS
  const koAudio = await generateTTS(row.meaning_ko, 'ko')
  const meaning_ko_audio_url = await uploadAudio(koAudio, `${base}_meaning_ko.mp3`)

  // 4. 영어 뜻 TTS
  const enAudio = await generateTTS(row.meaning_en, 'en')
  const meaning_en_audio_url = await uploadAudio(enAudio, `${base}_meaning_en.mp3`)

  // 5. 예문 TTS - 스와힐리어 예문은 발음 가이드 사용
  let exampleTtsText = row.example
  if (mode === 'ko') {
    // KO 모드: 스와힐리어 예문 → 발음 가이드로 TTS 생성
    exampleTtsText = row.example_pronunciation || row.example
  }
  const exAudio = await generateTTS(exampleTtsText, mode === 'sw' ? 'ko' : 'en')
  const example_audio_url = await uploadAudio(exAudio, `${base}_example.mp3`)

  return {
    ...row,
    word_audio_url,
    meaning_sw_audio_url,
    meaning_ko_audio_url,
    meaning_en_audio_url,
    example_audio_url,
  }
}

async function upsertRows(rows: GeneratedRow[]) {
  const { error } = await supabase.from('generated_vocab').upsert(rows, { onConflict: 'mode,word' })
  if (error) throw error
}

async function main() {
  console.log('🚀 GPT-4.1 + OpenAI TTS (여성 목소리) 단어 생성 시작\n')
  
  const csvPath = path.join(process.cwd(), 'data', 'Oxford.csv')
  if (!fs.existsSync(csvPath)) throw new Error('data/Oxford.csv not found')

  const samples = pickSamples(csvPath, 15)
  console.log(`📚 CSV에서 ${samples.length}개 샘플 추출: ${samples.slice(0, 5).join(', ')}...\n`)

  // SW 모드: 케냐 사람을 위한 한국어 학습
  console.log('=== SW 모드 (케냐 사용자용 한국어 학습) ===')
  const swWords = await generateBatch('sw', samples)
  console.log(`   ✅ 텍스트 생성 완료 (${swWords.length}개)`)
  
  const swWithAudio: GeneratedRow[] = []
  for (let i = 0; i < swWords.length; i++) {
    console.log(`   [${i + 1}/10] ${swWords[i]!.word} - TTS 생성 중...`)
    const w = await addTTS(swWords[i]!, 'sw', i)
    swWithAudio.push({ mode: 'sw', ...w })
  }
  console.log('   ✅ SW 모드 TTS 완료\n')

  // KO 모드: 한국 사람을 위한 스와힐리어 학습
  console.log('=== KO 모드 (한국 사용자용 스와힐리어 학습) ===')
  const koWords = await generateBatch('ko', samples)
  console.log(`   ✅ 텍스트 생성 완료 (${koWords.length}개)`)
  
  const koWithAudio: GeneratedRow[] = []
  for (let i = 0; i < koWords.length; i++) {
    console.log(`   [${i + 1}/10] ${koWords[i]!.word} - TTS 생성 중...`)
    const w = await addTTS(koWords[i]!, 'ko', i)
    koWithAudio.push({ mode: 'ko', ...w })
  }
  console.log('   ✅ KO 모드 TTS 완료\n')

  // DB 저장
  console.log('💾 Supabase에 저장 중...')
  await upsertRows([...swWithAudio, ...koWithAudio])
  console.log('   ✅ 저장 완료\n')

  // 확인
  const { count: swCount } = await supabase.from('generated_vocab').select('id', { count: 'exact', head: true }).eq('mode', 'sw')
  const { count: koCount } = await supabase.from('generated_vocab').select('id', { count: 'exact', head: true }).eq('mode', 'ko')

  console.log('📊 결과:')
  console.log(`   SW 모드: ${swCount ?? 0}개`)
  console.log(`   KO 모드: ${koCount ?? 0}개`)
  console.log('\n🎉 완료!')
}

main().catch((e) => {
  console.error('❌ 실패:', e)
  process.exit(1)
})

