/**
 * CSV(Oxford) → GPT-5.2 생성 → Google TTS → Supabase 업서트
 * - 모드 2종 각 10개씩: 총 20개
 * - 입력: data/Oxford.csv (영어 단어 목록, 상위 40행 중 랜덤 샘플 10개 사용)
 * - 출력: Supabase generated_vocab + Storage vocabaudio
 *
 * 실행:
 *   npx tsx scripts/generate-from-csv.ts
 *
 * 요구:
 * - .env: VITE_OPENAI_API_KEY (GPT-5.2), VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
 *         VITE_GCP_TTS_API_KEY 또는 VITE_GCP_TTS_ACCESS_TOKEN (gcpTts.ts가 ACCESS_TOKEN 사용)
 * - Supabase: generated_vocab 테이블, vocabaudio 버킷 업로드 가능
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

// 로컬 런타임용: env.ts가 import.meta.env를 쓰므로 직접 env 접근 불가 -> 여기서 직접 env 사용
type TTLLang = 'sw' | 'ko' | 'en'

const ttsClient = new textToSpeech.TextToSpeechClient() // GOOGLE_APPLICATION_CREDENTIALS를 사용해 자동 토큰 갱신

function langCodeFromVoice(name: string) {
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

async function gcpSynthesizeSpeech(
  text: string,
  language: TTLLang,
  opts?: { voiceName?: string; speakingRate?: number }
): Promise<{ audio: ArrayBuffer; voiceName: string; rate: number }> {
  const VOICE_MAP: Record<TTLLang, string> = {
    ko: process.env.VITE_GCP_TTS_KO_VOICE || 'ko-KR-Wavenet-D',
    sw: process.env.VITE_GCP_TTS_SW_VOICE || 'sw-KE-Standard-A',
    en: process.env.VITE_GCP_TTS_EN_VOICE || 'en-US-Wavenet-D',
  }
  const voiceName = opts?.voiceName || VOICE_MAP[language] || VOICE_MAP.en
  const speakingRate =
    (opts?.speakingRate !== undefined
      ? opts.speakingRate
      : process.env.VITE_GCP_TTS_SPEED
        ? Number(process.env.VITE_GCP_TTS_SPEED)
        : 0.9) || 0.9

  const payload: textToSpeech.protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input: { text },
    voice: {
      languageCode: langCodeFromVoice(voiceName),
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: textToSpeech.protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      speakingRate,
    },
  }

  try {
    const attempt = async (req: textToSpeech.protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest) => {
      const [response] = await ttsClient.synthesizeSpeech(req)
      return response.audioContent
    }

    let audioContent = await attempt(payload)
    // 보이스 미지원 시 name 제거 후 재시도
    if (!audioContent) {
      const fallbackPayload = { ...payload, voice: { languageCode: payload.voice?.languageCode } }
      audioContent = await attempt(fallbackPayload)
    }

    if (!audioContent) throw new Error('Google TTS returned empty audioContent')
    const buffer = Buffer.isBuffer(audioContent)
      ? audioContent
      : Buffer.from((audioContent as Uint8Array) ?? [])
    return { audio: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), voiceName, rate: speakingRate }
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes('does not exist')) {
      const fallbackPayload = { ...payload, voice: { languageCode: payload.voice?.languageCode } }
      const [fallback] = await ttsClient.synthesizeSpeech(fallbackPayload)
      const audioContent = fallback.audioContent
      if (!audioContent) throw e
      const buffer = Buffer.isBuffer(audioContent)
        ? audioContent
        : Buffer.from((audioContent as Uint8Array) ?? [])
      return { audio: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), voiceName: payload.voice?.languageCode ?? 'sw', rate: speakingRate }
    }
    throw e
  }
}

dotenv.config()

// Env
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const OPENAI_KEY = process.env.VITE_OPENAI_API_KEY
const OPENAI_MODEL = 'gpt-5.2' // 요청사항 반영
const BUCKET = 'vocabaudio'

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  throw new Error('Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_OPENAI_API_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

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

function pickSamples(filePath: string, count: number): string[] {
  const csv = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).slice(1) // skip header
  const pool = csv.filter(Boolean).slice(0, 40) // 상위 40행에서만 샘플 (품질 관리)
  const out: string[] = []
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(idx, 1)[0]!)
  }
  return out
}

function systemPrompt(mode: Mode, samples: string) {
  if (mode === 'sw') {
    // 스와힐리어 사용자용: 한국어 단어 중심
    return `You are a top-tier linguist for Kiswahili speakers learning Korean.
Use the attached English seed words as hints only (no need to reuse them): 
${samples}

Generate EXACTLY 10 entries as JSON { "words": [ ... ] }.
Fields per entry:
- word: Korean word (Hangul), practical and natural
- word_pronunciation: Korean Revised Romanization (RR) - REQUIRED
- meaning_sw: Kiswahili meaning (concise)
- meaning_sw_pronunciation: "" (empty string, not needed for Swahili speakers)
- meaning_en: English meaning (natural)
- meaning_en_pronunciation: English IPA or clear phonetic - REQUIRED
- meaning_ko: Korean meaning (short)
- meaning_ko_pronunciation: "" (empty string, not needed)
- example: Korean example sentence (natural daily)
- example_pronunciation: RR for example - REQUIRED
- example_translation_sw: Kiswahili translation
- example_translation_ko: Korean translation (same as example)
- example_translation_en: English translation
- pos: part of speech
- category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
- difficulty: 1-5 (1 easy)
Rules:
- No duplicates. Avoid rare/archaic words. Keep examples short and useful.
- Pronunciation is ONLY for: Korean word, English meaning, Korean example.`
  }

  // 한국어 사용자용: 스와힐리어 단어 중심
  return `You are a top-tier linguist for Korean speakers learning Kiswahili.
Use the attached English seed words as hints only (no need to reuse them): 
${samples}

Generate EXACTLY 10 entries as JSON { "words": [ ... ] }.
Fields per entry:
- word: Kiswahili word (practical)
- word_pronunciation: Kiswahili IPA or very clear phonetic - REQUIRED
- meaning_ko: Korean meaning (natural)
- meaning_ko_pronunciation: "" (empty string, not needed for Korean speakers)
- meaning_en: English meaning
- meaning_en_pronunciation: English IPA/phonetic - REQUIRED
- meaning_sw: Kiswahili short explanation
- meaning_sw_pronunciation: "" (empty string, not needed)
- example: Kiswahili example sentence (natural)
- example_pronunciation: phonetic guide - REQUIRED
- example_translation_sw: Kiswahili translation (same as example)
- example_translation_ko: Korean translation
- example_translation_en: English translation
- pos: part of speech
- category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
- difficulty: 1-5
Rules:
- No duplicates. Practical, modern Kiswahili. Keep examples short and clear.
- Pronunciation is ONLY for: Kiswahili word, English meaning, Kiswahili example.`
}

function validateWord(x: any): Omit<GeneratedRow, 'mode'> {
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
  ]
  for (const k of required) {
    const v = x?.[k]
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new Error(`Invalid item: missing ${k}`)
    }
  }
  const d = Math.max(1, Math.min(5, Number(x.difficulty) || 1))
  return { ...x, difficulty: d }
}

async function generateBatch(mode: Mode, samples: string[]): Promise<Omit<GeneratedRow, 'mode'>[]> {
  const prompt = systemPrompt(mode, samples.join('\n'))
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate 10 entries now. Output ONLY valid JSON.' },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.55,
    max_completion_tokens: 4000,
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

function toSlug(base: string, suffix: string) {
  return `${base}_${suffix}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 80)
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

async function addTts(row: Omit<GeneratedRow, 'mode'>, mode: Mode, idx: number): Promise<Omit<GeneratedRow, 'mode'>> {
  const base = `csv/gpt52/${mode}/${toSlug(row.word, String(idx + 1))}`

  // word
  const wordLang: TTLLang = mode === 'sw' ? 'ko' : 'sw'
  const wordAudio = await gcpSynthesizeSpeech(row.word, wordLang)
  const wordUrl = await uploadAudio(wordAudio.audio, `${base}_word.mp3`)

  // meaning main
  const meaningMain = mode === 'sw' ? row.meaning_ko : row.meaning_sw
  const meaningLang: TTLLang = mode === 'sw' ? 'ko' : 'sw'
  const meaningAudio = await gcpSynthesizeSpeech(meaningMain, meaningLang)
  const meaningUrl = await uploadAudio(meaningAudio.audio, `${base}_meaning_main.mp3`)

  // example
  const exampleLang: TTLLang = mode === 'sw' ? 'ko' : 'sw'
  const exampleAudio = await gcpSynthesizeSpeech(row.example, exampleLang)
  const exampleUrl = await uploadAudio(exampleAudio.audio, `${base}_example.mp3`)

  // english meaning
  const enAudio = await gcpSynthesizeSpeech(row.meaning_en, 'en')
  const enUrl = await uploadAudio(enAudio.audio, `${base}_meaning_en.mp3`)

  return {
    ...row,
    word_audio_url: wordUrl,
    ...(mode === 'sw'
      ? { meaning_ko_audio_url: meaningUrl, meaning_sw_audio_url: undefined }
      : { meaning_sw_audio_url: meaningUrl, meaning_ko_audio_url: undefined }),
    example_audio_url: exampleUrl,
    meaning_en_audio_url: enUrl,
  }
}

async function upsertRows(rows: GeneratedRow[]) {
  const { error } = await supabase.from('generated_vocab').upsert(rows, { onConflict: 'mode,word' })
  if (error) throw error
}

async function main() {
  console.log('▶ CSV 기반 GPT-5.2 + Google TTS + Supabase 업서트 시작')
  const csvPath = path.join(process.cwd(), 'data', 'Oxford.csv')
  if (!fs.existsSync(csvPath)) throw new Error('data/Oxford.csv not found')

  // 샘플 10개
  const samples = pickSamples(csvPath, 10)

  // SW 모드(한국어 단어 중심)
  console.log('=== SW 모드 10개 생성 ===')
  const swWords = await generateBatch('sw', samples)
  const swWithAudio: GeneratedRow[] = []
  for (let i = 0; i < swWords.length; i++) {
    const w = swWords[i]!
    const w2 = await addTts(w, 'sw', i)
    swWithAudio.push({ mode: 'sw', ...w2 })
    console.log(`  - SW ${i + 1}/10 완료`)
  }

  // KO 모드(스와힐리어 단어 중심)
  console.log('=== KO 모드 10개 생성 ===')
  const koWords = await generateBatch('ko', samples)
  const koWithAudio: GeneratedRow[] = []
  for (let i = 0; i < koWords.length; i++) {
    const w = koWords[i]!
    const w2 = await addTts(w, 'ko', i)
    koWithAudio.push({ mode: 'ko', ...w2 })
    console.log(`  - KO ${i + 1}/10 완료`)
  }

  // 업서트
  await upsertRows([...swWithAudio, ...koWithAudio])
  console.log('✅ Supabase upsert 완료')

  // 확인
  const { count, error: countErr } = await supabase.from('generated_vocab').select('id', { count: 'exact', head: true })
  if (!countErr) {
    console.log(`📊 generated_vocab 총 ${count ?? 0}개`)
  }

  console.log('🎉 완료')
}

main().catch((e) => {
  console.error('❌ 실패:', e)
  process.exit(1)
})

