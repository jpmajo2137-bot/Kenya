/**
 * SW/KO 각 모드 10개씩 생성 + (발음/음성) + Supabase 저장
 *
 * 실행:
 *   npx tsx scripts/generate-10.ts
 *
 * 요구:
 * - .env 에 VITE_OPENAI_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정
 * - Supabase: generated_vocab 테이블 존재
 * - Supabase Storage: vocabaudio 버킷 존재 + 업로드 정책 허용
 */

import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const OPENAI_KEY = process.env.VITE_OPENAI_API_KEY
const OPENAI_MODEL = process.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
const GCP_VOICE_KO = process.env.GCP_TTS_KO_VOICE || 'ko-KR-Wavenet-D'
const GCP_VOICE_SW = process.env.GCP_TTS_SW_VOICE || 'sw-KE-Standard-A'
const GCP_VOICE_EN = process.env.GCP_TTS_EN_VOICE || 'en-US-Wavenet-D'
const GCP_TTS_SPEED = Number(process.env.GCP_TTS_SPEED ?? '1') || 1

type Mode = 'sw' | 'ko'
type TTLLang = 'sw' | 'ko' | 'en'

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

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 60)
}

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
    throw new Error('Missing env vars. Check .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_OPENAI_API_KEY')
  }
  // GOOGLE_APPLICATION_CREDENTIALS는 GCP 클라이언트가 내부에서 읽음
}

function systemPrompt(mode: Mode) {
  if (mode === 'sw') {
    // 케냐어(스와힐리어) 사람용: 한국어 단어 중심 + 뜻(sw/en) + 한국어 예문
    return `You are a Kenya Kiswahili + Korean + English linguist.
Generate TOP-QUALITY vocabulary for Kiswahili speakers learning Korean.

Return a JSON object: { "words": [ ... ] } with EXACTLY 10 entries.

For EACH entry, output ALL fields:
- word: Korean word (Hangul), practical everyday usage
- word_pronunciation: Korean Revised Romanization (RR)
- meaning_sw: Kiswahili meaning (Kenya usage)
- meaning_sw_pronunciation: Kiswahili pronunciation in a simple phonetic guide (for learners)
- meaning_en: English meaning (natural)
- meaning_en_pronunciation: English IPA (or a clear phonetic guide)
- meaning_ko: Korean short definition (Korean)
- meaning_ko_pronunciation: Korean RR for meaning_ko
- example: Korean example sentence (natural, daily conversation)
- example_pronunciation: Korean RR for the example
- example_translation_sw: Kiswahili translation of the example
- example_translation_ko: Korean translation (same as example)
- example_translation_en: English translation of the example
- pos: part of speech (noun/verb/adjective/etc.)
- category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
- difficulty: integer 1-5 (1 beginner)

Rules:
- No duplicates.
- Avoid overly formal/rare words.
- Make meanings precise and consistent.`
  }

  // 한국 사람용: 스와힐리어 단어 중심 + 뜻(ko/en) + 스와힐리어 예문
  return `You are a Kenya Kiswahili + Korean + English linguist.
Generate TOP-QUALITY vocabulary for Korean speakers learning Kiswahili (Kenya usage).

Return a JSON object: { "words": [ ... ] } with EXACTLY 10 entries.

For EACH entry, output ALL fields:
- word: Kiswahili word (as used in Kenya)
- word_pronunciation: Kiswahili IPA (or very clear phonetic guide)
- meaning_ko: Korean meaning (natural)
- meaning_ko_pronunciation: Korean RR (for learners)
- meaning_en: English meaning
- meaning_en_pronunciation: English IPA (or clear phonetic)
- meaning_sw: Kiswahili short explanation (in Kiswahili)
- meaning_sw_pronunciation: phonetic guide for meaning_sw
- example: Kiswahili example sentence (natural)
- example_pronunciation: phonetic guide for the example
- example_translation_sw: Kiswahili translation (same as example)
- example_translation_ko: Korean translation of the example
- example_translation_en: English translation of the example
- pos: part of speech
- category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
- difficulty: integer 1-5

Rules:
- No duplicates.
- Practical, modern Kenya Kiswahili.
- Keep examples short and clear.`
}

function validateWord(x: unknown): Omit<GeneratedRow, 'mode'> {
  const required = [
    'word',
    'word_pronunciation',
    'meaning_sw',
    'meaning_sw_pronunciation',
    'meaning_ko',
    'meaning_ko_pronunciation',
    'meaning_en',
    'meaning_en_pronunciation',
    'example',
    'example_pronunciation',
    'example_translation_sw',
    'example_translation_ko',
    'example_translation_en',
    'pos',
    'category',
    'difficulty',
  ] as const

  if (!x || typeof x !== 'object') {
    throw new Error('Invalid item: not an object')
  }

  for (const k of required) {
    const v = (x as Record<string, unknown>)[k as string]
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new Error(`Invalid item: missing ${k}`)
    }
  }
  return x as Omit<GeneratedRow, 'mode'>
}

async function generate10(openai: OpenAI, mode: Mode): Promise<Omit<GeneratedRow, 'mode'>[]> {
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt(mode) },
      { role: 'user', content: 'Generate 10 entries now. Output ONLY valid JSON.' },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.55,
    max_tokens: 3500,
  })

  const content = res.choices[0]?.message?.content
  if (!content) throw new Error('No OpenAI content')
  const parsed = JSON.parse(content)
  const words = Array.isArray(parsed) ? parsed : parsed.words
  if (!Array.isArray(words) || words.length !== 10) {
    throw new Error(`Expected 10 words, got ${Array.isArray(words) ? words.length : 'non-array'}`)
  }
  return words.map(validateWord).map((w) => {
    // mode는 호출부에서 주입
    // difficulty clamp
    const d = Math.max(1, Math.min(5, Number(w.difficulty) || 1))
    return { ...w, difficulty: d } as Omit<GeneratedRow, 'mode'>
  })
}

// Google Cloud TTS 설정
const GCP_VOICE_MAP: Record<TTLLang, string> = {
  ko: GCP_VOICE_KO,
  sw: GCP_VOICE_SW,
  en: GCP_VOICE_EN,
}

const ttsClient = new textToSpeech.TextToSpeechClient()

async function ttsGoogle(text: string, lang: TTLLang, speakingRate = 1.0): Promise<ArrayBuffer | null> {
  try {
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: GCP_VOICE_MAP[lang].split('-').slice(0, 2).join('-'),
      name: GCP_VOICE_MAP[lang],
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate,
    },
  })
    if (!response.audioContent) return null
  return response.audioContent as ArrayBuffer
  } catch (e: any) {
    console.log(`    ⚠️ TTS 생략 (${lang}): ${e.details || e.message}`)
    return null
  }
}

async function uploadAudio(
  supabase: ReturnType<typeof createClient>,
  path: string,
  audio: ArrayBuffer | null,
): Promise<string | undefined> {
  if (!audio) return undefined
  const blob = new Blob([audio], { type: 'audio/mpeg' })
  const { data, error } = await supabase.storage.from('vocabaudio').upload(path, blob, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(data.path)
  return urlData.publicUrl
}

async function enrichWithAudio(
  openai: OpenAI,
  supabase: ReturnType<typeof createClient>,
  mode: Mode,
  row: Omit<GeneratedRow, 'mode'>,
): Promise<GeneratedRow> {
  const base = `gen/${mode}/${slugify(row.word) || 'word'}_${Date.now()}`

  // 각 언어에 맞는 올바른 TTS 생성
  // mode=sw: 한국어 단어 학습 (케냐 사람용)
  //   - word: 한국어 → 한국어 TTS
  //   - example: 한국어 예문 → 한국어 TTS
  // mode=ko: 스와힐리어 단어 학습 (한국 사람용)
  //   - word: 스와힐리어 → 스와힐리어 TTS (지원 안 될 수 있음)
  //   - example: 스와힐리어 예문 → 스와힐리어 TTS (지원 안 될 수 있음)

  const wordLang: TTLLang = mode === 'sw' ? 'ko' : 'sw'
  const exampleLang: TTLLang = mode === 'sw' ? 'ko' : 'sw'

  console.log(`    - 단어 TTS (${wordLang}): ${row.word}`)
  const wordAudio = await ttsGoogle(row.word, wordLang, GCP_TTS_SPEED)
  const word_audio_url = await uploadAudio(supabase, `${base}_word.mp3`, wordAudio)

  // 스와힐리어 뜻 → 스와힐리어 TTS (지원 안 되면 생략)
  console.log(`    - 스와힐리어 뜻 TTS: ${row.meaning_sw}`)
  const swAudio = await ttsGoogle(row.meaning_sw, 'sw', GCP_TTS_SPEED)
  const meaning_sw_audio_url = await uploadAudio(supabase, `${base}_meaning_sw.mp3`, swAudio)

  // 한국어 뜻 → 한국어 TTS
  console.log(`    - 한국어 뜻 TTS: ${row.meaning_ko}`)
  const koAudio = await ttsGoogle(row.meaning_ko, 'ko', GCP_TTS_SPEED)
  const meaning_ko_audio_url = await uploadAudio(supabase, `${base}_meaning_ko.mp3`, koAudio)

  // 영어 뜻 → 영어 TTS
  console.log(`    - 영어 뜻 TTS: ${row.meaning_en}`)
  const enAudio = await ttsGoogle(row.meaning_en, 'en', GCP_TTS_SPEED)
  const meaning_en_audio_url = await uploadAudio(supabase, `${base}_meaning_en.mp3`, enAudio)

  // 예문 → 해당 언어 TTS (스와힐리어면 생략될 수 있음)
  console.log(`    - 예문 TTS (${exampleLang}): ${row.example}`)
  const exAudio = await ttsGoogle(row.example, exampleLang, GCP_TTS_SPEED)
  const example_audio_url = await uploadAudio(supabase, `${base}_example.mp3`, exAudio)

  return {
    mode,
    ...row,
    word_audio_url,
    meaning_sw_audio_url,
    meaning_ko_audio_url,
    meaning_en_audio_url,
    example_audio_url,
  }
}

async function insertBatch(supabase: ReturnType<typeof createClient>, rows: GeneratedRow[]) {
  // 중복 시 무시 (새 단어만 추가)
  const { error } = await supabase.from('generated_vocab').upsert(rows, {
    onConflict: 'mode,word',
    ignoreDuplicates: true,  // 중복은 건너뜀
  })
  if (error) throw error
}

async function runMode(openai: OpenAI, supabase: ReturnType<typeof createClient>, mode: Mode) {
  console.log(`\n=== ${mode.toUpperCase()} 모드: 10개 생성 시작 ===`)
  const gen = await generate10(openai, mode)
  console.log(`- 텍스트 생성 완료 (${gen.length}개). 이제 음성 생성+업로드...`)

  const rows: GeneratedRow[] = []
  for (let i = 0; i < gen.length; i++) {
    const w = gen[i]!
    console.log(`  [${i + 1}/10] ${w.word}`)
    const enriched = await enrichWithAudio(openai, supabase, mode, w)
    rows.push(enriched)
  }

  console.log(`- DB 저장 중... (${rows.length}개)`)
  await insertBatch(supabase, rows)
  console.log(`✅ ${mode.toUpperCase()} 모드 저장 완료`)
}

async function main() {
  assertEnv()
  const openai = new OpenAI({ apiKey: OPENAI_KEY! })
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!)

  // 간단히 업로드 가능한지 확인 (권한/버킷)
  const pingPath = `test/ping-${Date.now()}.txt`
  const { error: pingErr } = await supabase.storage.from('vocabaudio').upload(pingPath, 'ping', {
    contentType: 'text/plain',
    upsert: true,
  })
  if (pingErr) throw pingErr
  await supabase.storage.from('vocabaudio').remove([pingPath])

  await runMode(openai, supabase, 'sw')
  await runMode(openai, supabase, 'ko')

  const { count: swCount } = await supabase
    .from('generated_vocab')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'sw')
  const { count: koCount } = await supabase
    .from('generated_vocab')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'ko')

  console.log('\n=== 완료 ===')
  console.log(`SW 모드 총 레코드: ${swCount ?? 'unknown'}`)
  console.log(`KO 모드 총 레코드: ${koCount ?? 'unknown'}`)
}

main().catch((e) => {
  console.error('❌ generate-10 실패:', e)
  process.exit(1)
})


