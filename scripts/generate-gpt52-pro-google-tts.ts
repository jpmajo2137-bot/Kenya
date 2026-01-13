/**
 * GPT-5.2 Pro + Google/Azure TTS (여성 음성) 어휘 생성 스크립트
 * 
 * - CSV에서 영어 단어를 읽어 한국어/스와힐리어 어휘 데이터 생성
 * - Google Cloud TTS: 한국어, 영어
 * - Azure TTS: 스와힐리어 (케냐)
 * - Supabase에 저장
 * 
 * 실행:
 *   npx tsx scripts/generate-gpt52-pro-google-tts.ts
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

// ─────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────
const OPENAI_MODEL = 'gpt-5.2-pro' // GPT-5.2 Pro (Responses API)
const ENTRIES_PER_MODE = 4958
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 10000

// 재시도 로직 헬퍼
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = MAX_RETRIES
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isLast = attempt === retries
      console.log(`   ⚠️ ${label} 시도 ${attempt}/${retries} 실패: ${err.message || err}`)
      if (isLast) throw err
      console.log(`   🔄 ${RETRY_DELAY_MS / 1000}초 후 재시도...`)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    }
  }
  throw new Error('Unreachable')
}

// Microsoft Azure TTS 설정 (모든 언어)
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY!
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION!
const AZURE_VOICE_KO = 'ko-KR-SunHiNeural' // 한국어 여성 음성
const AZURE_VOICE_EN = 'en-US-JennyNeural' // 영어 여성 음성
const AZURE_VOICE_SW = 'sw-KE-ZuriNeural' // 스와힐리어 여성 음성

// 이미지 생성 설정
const IMAGE_MODEL = 'dall-e-3'
const IMAGE_SIZE = '1024x1024' as const

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

type TTSLang = 'ko' | 'sw' | 'en'

// ─────────────────────────────────────────────────────────────
// Microsoft Azure TTS (모든 언어)
// ─────────────────────────────────────────────────────────────

// Azure TTS 음성 맵
const AZURE_VOICE_MAP: Record<TTSLang, string> = {
  ko: AZURE_VOICE_KO,
  en: AZURE_VOICE_EN,
  sw: AZURE_VOICE_SW,
}

// Microsoft Azure TTS (모든 언어)
async function synthesizeWithAzure(text: string, lang: TTSLang): Promise<Buffer | null> {
  const voiceName = AZURE_VOICE_MAP[lang]
  
  return new Promise((resolve) => {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION)
      speechConfig.speechSynthesisVoiceName = voiceName
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig)
      
      synthesizer.speakTextAsync(
        text,
        (result) => {
          synthesizer.close()
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(Buffer.from(result.audioData))
          } else {
            console.log(`    ⚠️ Azure TTS 실패 (${lang}): ${result.errorDetails}`)
            resolve(null)
          }
        },
        (error) => {
          synthesizer.close()
          console.log(`    ⚠️ Azure TTS 오류 (${lang}): ${error}`)
          resolve(null)
        }
      )
    } catch (e: any) {
      console.log(`    ⚠️ Azure TTS 예외 (${lang}): ${e.message || e}`)
      resolve(null)
    }
  })
}

async function synthesizeSpeech(text: string, lang: TTSLang): Promise<Buffer | null> {
  try {
    return await withRetry(async () => {
      // 모든 언어에서 Microsoft Azure TTS 사용
      return await synthesizeWithAzure(text, lang)
    }, `Azure TTS 생성 (${lang})`)
  } catch (e: any) {
    console.log(`    ⚠️ TTS 생략 (${lang}): ${e.message || e}`)
    return null
  }
}

async function uploadAudio(buffer: Buffer | null, filename: string): Promise<string | null> {
  if (!buffer) return null

  try {
    return await withRetry(async () => {
      const { data, error } = await supabase.storage
        .from('vocabaudio')
        .upload(filename, buffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        })

      if (error) {
        throw new Error(error.message)
      }

      const { data: urlData } = supabase.storage
        .from('vocabaudio')
        .getPublicUrl(filename)

      return urlData?.publicUrl || null
    }, `오디오 업로드 (${filename})`)
  } catch (e: any) {
    console.error(`   ❌ 오디오 업로드 실패: ${filename}`, e.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// 이미지 생성 (DALL-E 3)
// ─────────────────────────────────────────────────────────────
async function generateImage(word: string, meaning: string): Promise<Buffer | null> {
  try {
    return await withRetry(async () => {
      const prompt = `A simple, clear, colorful illustration representing the concept "${meaning}" (${word}). Minimalist style, suitable for vocabulary learning flashcard. No text or letters in the image.`
      
      const response = await openai.images.generate({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size: IMAGE_SIZE,
        quality: 'standard',
      })

      const imageUrl = response.data[0]?.url
      if (!imageUrl) return null

      // 이미지 다운로드
      const imageResponse = await fetch(imageUrl)
      const arrayBuffer = await imageResponse.arrayBuffer()
      return Buffer.from(arrayBuffer)
    }, `이미지 생성 (${word})`)
  } catch (e: any) {
    console.log(`    ⚠️ 이미지 생성 실패: ${e.message || e}`)
    return null
  }
}

async function uploadImage(buffer: Buffer | null, filename: string): Promise<string | null> {
  if (!buffer) return null

  try {
    return await withRetry(async () => {
      const { data, error } = await supabase.storage
        .from('vocabaudio') // 같은 버킷 사용 (또는 별도 버킷 생성 가능)
        .upload(filename, buffer, {
          contentType: 'image/png',
          upsert: true,
        })

      if (error) {
        throw new Error(error.message)
      }

      const { data: urlData } = supabase.storage
        .from('vocabaudio')
        .getPublicUrl(filename)

      return urlData?.publicUrl || null
    }, `이미지 업로드 (${filename})`)
  } catch (e: any) {
    console.error(`   ❌ 이미지 업로드 실패: ${filename}`, e.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// CSV 파싱
// ─────────────────────────────────────────────────────────────
function parseCSV(filePath: string): Array<{ word: string; meaning: string }> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').slice(1) // 헤더 제외
  const results: Array<{ word: string; meaning: string }> = []

  for (const line of lines) {
    if (!line.trim()) continue
    // CSV 파싱: No,Level,Word,Pronunciation,Meaning,Example,NaverPron,PDFPage
    const parts = line.split(',')
    if (parts.length >= 5) {
      const word = parts[2]?.trim()
      const meaning = parts[4]?.trim()?.slice(0, 100) // 짧게 자르기
      if (word && meaning) {
        results.push({ word, meaning })
      }
    }
  }

  return results
}

// ─────────────────────────────────────────────────────────────
// GPT-5.2 Pro 프롬프트
// ─────────────────────────────────────────────────────────────
function getSystemPrompt(mode: 'sw' | 'ko'): string {
  if (mode === 'sw') {
    // 케냐어 버전: 한국어 단어 학습 (스와힐리어 사용자용)
    return `You are an expert linguist creating TOP-QUALITY vocabulary entries for Swahili speakers learning Korean.

For each English seed word, create a practical Korean vocabulary entry with these EXACT fields:

1. word: 한국어 단어 (Hangul, practical everyday usage)
2. word_pronunciation: Korean Revised Romanization (RR) - REQUIRED, accurate
3. meaning_sw: 케냐어(스와힐리어) 뜻 (concise, natural Kenyan Swahili)
4. meaning_sw_pronunciation: "" (빈 문자열)
5. meaning_ko: 한국어 뜻 (Korean definition, short)
6. meaning_ko_pronunciation: "" (빈 문자열)
7. meaning_en: English meaning (natural, clear)
8. meaning_en_pronunciation: English IPA pronunciation - REQUIRED
9. example: 한국어 예문 (natural daily Korean sentence using the word)
10. example_pronunciation: Korean RR for the example - REQUIRED
11. example_translation_sw: Swahili translation of example (Kenyan usage)
12. example_translation_ko: 한국어 번역 (same as example)
13. example_translation_en: English translation of example
14. pos: Part of speech (명사/동사/형용사/부사 등)
15. category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
16. difficulty: 1-5 (1=beginner)

CRITICAL:
- Korean word must have accurate RR pronunciation
- English meaning must have IPA pronunciation  
- Korean example must have accurate RR pronunciation
- Swahili translations must be natural Kenyan Swahili
- Examples should be practical, daily-use sentences
- NO duplicates, NO rare/archaic words

Return as JSON: { "words": [ ... ] } with EXACTLY the same number of entries as seed words provided.`
  }

  // 한국어 버전: 스와힐리어 단어 학습 (한국어 사용자용)
  return `You are an expert linguist creating TOP-QUALITY vocabulary entries for Korean speakers learning Kenyan Swahili.

For each English seed word, create a practical Swahili vocabulary entry with these EXACT fields:

1. word: 스와힐리어(케냐어) 단어 (practical Kenyan Swahili)
2. word_pronunciation: Swahili phonetic pronunciation guide - REQUIRED (e.g., "ka-RI-bu")
3. meaning_sw: 스와힐리어 뜻 (Swahili definition, short)
4. meaning_sw_pronunciation: "" (빈 문자열)
5. meaning_ko: 한국어 뜻 (natural Korean meaning)
6. meaning_ko_pronunciation: "" (빈 문자열)
7. meaning_en: English meaning (natural, clear)
8. meaning_en_pronunciation: English IPA pronunciation - REQUIRED
9. example: 스와힐리어 예문 (natural Kenyan Swahili sentence using the word)
10. example_pronunciation: Phonetic pronunciation of Swahili example - REQUIRED
11. example_translation_sw: Swahili translation (same as example)
12. example_translation_ko: 한국어 번역 (natural Korean translation)
13. example_translation_en: English translation of example
14. pos: Part of speech (noun/verb/adjective/adverb etc)
15. category: one of: greetings, daily, food, transport, shopping, time, places, emotions, health, work, school
16. difficulty: 1-5 (1=beginner)

CRITICAL:
- Swahili word must have clear phonetic pronunciation guide
- English meaning must have IPA pronunciation
- Swahili example must have clear phonetic pronunciation
- Korean translations must be natural
- Examples should be practical, daily-use Kenyan Swahili
- NO duplicates, NO rare/archaic words

Return as JSON: { "words": [ ... ] } with EXACTLY the same number of entries as seed words provided.`
}

// ─────────────────────────────────────────────────────────────
// GPT-5.2 Pro 어휘 생성
// ─────────────────────────────────────────────────────────────
interface GeneratedEntry {
  word: string
  word_pronunciation: string
  meaning_sw: string
  meaning_sw_pronunciation: string
  meaning_ko: string
  meaning_ko_pronunciation: string
  meaning_en: string
  meaning_en_pronunciation: string
  example: string
  example_pronunciation: string
  example_translation_sw: string
  example_translation_ko: string
  example_translation_en: string
  pos: string
  category: string
  difficulty: number
}

const BATCH_SIZE = 25 // 한 번에 생성할 단어 수 (타임아웃 방지)

async function generateVocabularyBatch(
  mode: 'sw' | 'ko',
  seedWords: Array<{ word: string; meaning: string }>,
  batchNum: number
): Promise<GeneratedEntry[]> {
  const wordList = seedWords.map((w, i) => `${i + 1}. ${w.word}: ${w.meaning}`).join('\n')
  const batchCount = seedWords.length

  console.log(`   📦 배치 ${batchNum}: ${batchCount}개 생성 중...`)

  return withRetry(async () => {
    // GPT-5.2 Pro는 Responses API 사용
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      instructions: getSystemPrompt(mode),
      input: `Generate vocabulary entries for these ${batchCount} English seed words:\n\n${wordList}\n\nReturn a JSON object { "words": [...] } with exactly ${batchCount} entries. Output ONLY valid JSON.`,
      text: {
        format: { type: 'json_object' },
      },
    })

    // Responses API 출력 파싱
    const outputText = response.output_text
    if (!outputText) throw new Error('No response from GPT-5.2 Pro')

    const parsed = JSON.parse(outputText)
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed.words || parsed.vocabulary || parsed.entries || []

    console.log(`   ✅ 배치 ${batchNum}: ${entries.length}개 완료`)
    return entries as GeneratedEntry[]
  }, `GPT-5.2 Pro API 호출 (배치 ${batchNum})`)
}

async function generateVocabulary(
  mode: 'sw' | 'ko',
  seedWords: Array<{ word: string; meaning: string }>,
  count: number
): Promise<GeneratedEntry[]> {
  const selected = seedWords.slice(0, count)
  const batches: Array<{ word: string; meaning: string }>[] = []
  
  // 배치로 나누기
  for (let i = 0; i < selected.length; i += BATCH_SIZE) {
    batches.push(selected.slice(i, i + BATCH_SIZE))
  }

  console.log(`\n🤖 GPT-5.2 Pro로 ${mode.toUpperCase()} 버전 ${count}개 생성 중... (${batches.length}개 배치)`)

  const allEntries: GeneratedEntry[] = []
  
  for (let i = 0; i < batches.length; i++) {
    const batchEntries = await generateVocabularyBatch(mode, batches[i], i + 1)
    allEntries.push(...batchEntries)
    
    // 배치 사이 짧은 대기
    if (i < batches.length - 1) {
      console.log(`   ⏳ 다음 배치 전 2초 대기...`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log(`   ✅ 총 ${allEntries.length}개 생성 완료`)
  return allEntries
}

// ─────────────────────────────────────────────────────────────
// TTS + 이미지 추가 및 DB 저장
// ─────────────────────────────────────────────────────────────
async function addTTSImageAndSave(
  mode: 'sw' | 'ko',
  entries: GeneratedEntry[]
): Promise<void> {
  console.log(`\n🔊🖼️ ${mode.toUpperCase()} 버전 TTS + 이미지 생성 및 저장 중...`)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    console.log(`   [${i + 1}/${entries.length}] "${entry.word}" 처리 중...`)

    try {
      const ts = Date.now()
      const wordLang: TTSLang = mode === 'sw' ? 'ko' : 'sw'
      const exampleLang: TTSLang = mode === 'sw' ? 'ko' : 'sw'

      // 단어 TTS
      console.log(`      - 단어 TTS (${wordLang}): ${entry.word}`)
      const wordAudio = await synthesizeSpeech(entry.word, wordLang)
      const wordAudioUrl = await uploadAudio(wordAudio, `gpt52pro/${mode}/${ts}_word_${i}.mp3`)

      // 스와힐리어 뜻 TTS
      console.log(`      - 스와힐리어 뜻 TTS: ${entry.meaning_sw}`)
      const meaningSwAudio = await synthesizeSpeech(entry.meaning_sw, 'sw')
      const meaningSwAudioUrl = await uploadAudio(meaningSwAudio, `gpt52pro/${mode}/${ts}_meaning_sw_${i}.mp3`)

      // 한국어 뜻 TTS
      console.log(`      - 한국어 뜻 TTS: ${entry.meaning_ko}`)
      const meaningKoAudio = await synthesizeSpeech(entry.meaning_ko, 'ko')
      const meaningKoAudioUrl = await uploadAudio(meaningKoAudio, `gpt52pro/${mode}/${ts}_meaning_ko_${i}.mp3`)

      // 영어 뜻 TTS
      console.log(`      - 영어 뜻 TTS: ${entry.meaning_en}`)
      const meaningEnAudio = await synthesizeSpeech(entry.meaning_en, 'en')
      const meaningEnAudioUrl = await uploadAudio(meaningEnAudio, `gpt52pro/${mode}/${ts}_meaning_en_${i}.mp3`)

      // 예문 TTS
      console.log(`      - 예문 TTS (${exampleLang}): ${entry.example}`)
      const exampleAudio = await synthesizeSpeech(entry.example, exampleLang)
      const exampleAudioUrl = await uploadAudio(exampleAudio, `gpt52pro/${mode}/${ts}_example_${i}.mp3`)

      // 이미지 생성
      console.log(`      - 🖼️ 이미지 생성: ${entry.meaning_en}`)
      const imageBuffer = await generateImage(entry.word, entry.meaning_en)
      const imageUrl = await uploadImage(imageBuffer, `gpt52pro/${mode}/${ts}_image_${i}.png`)

      // DB 저장
      const row = {
        mode,
        word: entry.word,
        word_pronunciation: entry.word_pronunciation || '',
        word_audio_url: wordAudioUrl,
        image_url: imageUrl,

        meaning_sw: entry.meaning_sw || '',
        meaning_sw_pronunciation: entry.meaning_sw_pronunciation || '',
        meaning_sw_audio_url: meaningSwAudioUrl,

        meaning_ko: entry.meaning_ko || '',
        meaning_ko_pronunciation: entry.meaning_ko_pronunciation || '',
        meaning_ko_audio_url: meaningKoAudioUrl,

        meaning_en: entry.meaning_en || '',
        meaning_en_pronunciation: entry.meaning_en_pronunciation || '',
        meaning_en_audio_url: meaningEnAudioUrl,

        example: entry.example || '',
        example_pronunciation: entry.example_pronunciation || '',
        example_audio_url: exampleAudioUrl,

        example_translation_sw: entry.example_translation_sw || '',
        example_translation_ko: entry.example_translation_ko || '',
        example_translation_en: entry.example_translation_en || '',

        pos: entry.pos || '',
        category: entry.category || 'daily',
        difficulty: Math.max(1, Math.min(5, entry.difficulty || 1)),
      }

      // upsert: 있으면 업데이트, 없으면 삽입 (mode + word 기준)
      const { error } = await supabase
        .from('generated_vocab')
        .upsert(row, { onConflict: 'mode,word' })
      if (error) {
        console.error(`   ❌ DB 저장 실패: ${entry.word}`, error.message)
      } else {
        console.log(`   ✅ "${entry.word}" 저장 완료 (이미지 포함)`)
      }
    } catch (err) {
      console.error(`   ❌ "${entry.word}" 처리 실패:`, err)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 배치별 생성 + 즉시 저장 (중단되어도 데이터 보존)
// ─────────────────────────────────────────────────────────────
async function generateAndSaveByBatch(
  mode: 'sw' | 'ko',
  seedWords: Array<{ word: string; meaning: string }>
): Promise<void> {
  const batches: Array<{ word: string; meaning: string }>[] = []
  
  for (let i = 0; i < seedWords.length; i += BATCH_SIZE) {
    batches.push(seedWords.slice(i, i + BATCH_SIZE))
  }

  console.log(`\n🤖 GPT-5.2 Pro로 ${mode.toUpperCase()} 버전 ${seedWords.length}개 생성 중... (${batches.length}개 배치, 배치별 저장)`)

  let totalSaved = 0
  
  for (let i = 0; i < batches.length; i++) {
    try {
      // 1. GPT로 배치 생성
      const batchEntries = await generateVocabularyBatch(mode, batches[i], i + 1)
      
      // 2. 즉시 TTS + 이미지 + DB 저장
      console.log(`   💾 배치 ${i + 1} TTS + 이미지 + 저장 중...`)
      await addTTSImageAndSave(mode, batchEntries)
      totalSaved += batchEntries.length
      console.log(`   ✅ 배치 ${i + 1} 저장 완료 (누적: ${totalSaved}개)`)
      
      // 배치 사이 대기
      if (i < batches.length - 1) {
        console.log(`   ⏳ 다음 배치 전 3초 대기...`)
        await new Promise(r => setTimeout(r, 3000))
      }
    } catch (err: any) {
      console.error(`   ❌ 배치 ${i + 1} 실패: ${err.message || err}`)
      console.log(`   ⏭️ 다음 배치로 건너뜀... (저장된 데이터: ${totalSaved}개)`)
      // 실패해도 계속 진행
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  console.log(`   ✅ ${mode.toUpperCase()} 총 ${totalSaved}개 저장 완료`)
}

// ─────────────────────────────────────────────────────────────
// 메인 실행
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🚀 GPT-5.2 Pro + Google TTS (여성 음성) 어휘 생성 시작')
  console.log('═══════════════════════════════════════════════════════════')

  // CSV 로드
  const csvPath = path.join(process.cwd(), 'data', 'Oxford.csv')
  console.log(`📂 CSV 로드: ${csvPath}`)
  const seedWords = parseCSV(csvPath)
  console.log(`   총 ${seedWords.length}개 단어 로드됨`)

  // 전체 단어 사용 (랜덤 셔플)
  const actualCount = Math.min(ENTRIES_PER_MODE, seedWords.length)
  const pool = seedWords.slice(0, actualCount)
  const shuffled = pool.sort(() => Math.random() - 0.5)

  // SW 버전 생성 (한국어 단어 학습 - 케냐 사람용) - 배치별 저장
  // SW 버전은 이미 완료됨 (4,152개) - 건너뜀
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📚 SW 버전: 이미 완료됨 (4,152개) - 건너뜀')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  // await generateAndSaveByBatch('sw', shuffled)

  // KO 버전 생성 (스와힐리어 단어 학습 - 한국 사람용) - 배치별 저장
  // 같은 seed words를 다시 셔플해서 사용
  const shuffledForKO = [...pool].sort(() => Math.random() - 0.5)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📚 KO 버전: 한국 사람을 위한 케냐(스와힐리어) 단어 학습')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  await generateAndSaveByBatch('ko', shuffledForKO)

  // 최종 확인
  const { count: swCount } = await supabase
    .from('generated_vocab')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'sw')

  const { count: koCount } = await supabase
    .from('generated_vocab')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'ko')

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('✅ 모든 생성 완료!')
  console.log(`   SW 버전 (케냐어 → 한국어): ${swCount ?? 0}개`)
  console.log(`   KO 버전 (한국어 → 케냐어): ${koCount ?? 0}개`)
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch((e) => {
  console.error('❌ 실패:', e)
  process.exit(1)
})

