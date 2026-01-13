/**
 * GPT-5.2 Pro (Responses API)를 사용한 어휘 생성 스크립트
 * - Responses API 사용 (gpt-5.2-pro는 Chat Completions API 미지원)
 * - OpenAI TTS로 여성 목소리(nova) 음성 생성
 * - Supabase에 저장
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────
const OPENAI_MODEL = 'gpt-5.2-pro'
const TTS_MODEL = 'tts-1-hd'
const TTS_VOICE = 'nova' // 여성 목소리
const ENTRIES_PER_MODE = 10

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

// ─────────────────────────────────────────────────────────────
// CSV 파싱
// ─────────────────────────────────────────────────────────────
function parseCSV(filePath: string): Array<{ word: string; meaning: string }> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').slice(1)
  const results: Array<{ word: string; meaning: string }> = []

  for (const line of lines) {
    if (!line.trim()) continue
    const parts = line.split(',')
    if (parts.length >= 5) {
      const word = parts[2]?.trim()
      const meaning = parts[4]?.trim()
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
    return `You are an expert linguist creating vocabulary entries for Swahili speakers learning Korean.

For each English word provided, create a Korean vocabulary entry with:
1. word: Korean word (한국어 단어)
2. word_pronunciation: Korean romanization (Revised Romanization)
3. meaning_sw: Swahili meaning
4. meaning_ko: Korean meaning
5. meaning_en: English meaning
6. meaning_en_pronunciation: IPA pronunciation
7. example: Example sentence in Korean
8. example_pronunciation: Romanization of example
9. example_translation_sw: Swahili translation
10. example_translation_ko: Same as example
11. example_translation_en: English translation
12. pos: Part of speech

Return as valid JSON array.`
  } else {
    return `You are an expert linguist creating vocabulary entries for Korean speakers learning Swahili.

For each English word provided, create a Swahili vocabulary entry with:
1. word: Swahili word
2. word_pronunciation: Phonetic pronunciation guide
3. meaning_sw: Swahili meaning
4. meaning_ko: Korean meaning (한국어 뜻)
5. meaning_en: English meaning
6. meaning_en_pronunciation: IPA pronunciation
7. example: Example sentence in Swahili
8. example_pronunciation: Phonetic pronunciation of example
9. example_translation_sw: Same as example
10. example_translation_ko: Korean translation
11. example_translation_en: English translation
12. pos: Part of speech

Return as valid JSON array.`
  }
}

// ─────────────────────────────────────────────────────────────
// GPT-5.2 Pro로 어휘 생성 (Responses API)
// ─────────────────────────────────────────────────────────────
interface GeneratedEntry {
  word: string
  word_pronunciation: string
  meaning_sw: string
  meaning_ko: string
  meaning_en: string
  meaning_en_pronunciation: string
  example: string
  example_pronunciation: string
  example_translation_sw: string
  example_translation_ko: string
  example_translation_en: string
  pos: string
}

async function generateVocabulary(
  mode: 'sw' | 'ko',
  seedWords: Array<{ word: string; meaning: string }>,
  count: number
): Promise<GeneratedEntry[]> {
  const selected = seedWords.slice(0, count)
  const wordList = selected.map((w, i) => `${i + 1}. ${w.word}: ${w.meaning}`).join('\n')

  console.log(`\n🤖 GPT-5.2 Pro (Responses API)로 ${mode.toUpperCase()} 버전 ${count}개 생성 중...`)

  // Responses API 사용
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: 'system', content: getSystemPrompt(mode) },
      {
        role: 'user',
        content: `Generate vocabulary entries for these ${count} English words:\n\n${wordList}\n\nReturn a JSON array with exactly ${count} entries.`,
      },
    ],
    text: {
      format: {
        type: 'json_object',
      },
    },
    reasoning: {
      effort: 'medium',
    },
  })

  // Responses API의 출력 추출
  const outputText = response.output_text
  if (!outputText) throw new Error('No response from GPT-5.2 Pro')

  const parsed = JSON.parse(outputText)
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed.vocabulary || parsed.words || parsed.entries || []

  console.log(`   ✅ ${entries.length}개 생성 완료`)
  return entries as GeneratedEntry[]
}

// ─────────────────────────────────────────────────────────────
// OpenAI TTS 생성 (여성 목소리)
// ─────────────────────────────────────────────────────────────
async function generateTTS(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    speed: 0.9,
  })

  return Buffer.from(await response.arrayBuffer())
}

async function uploadAudio(
  buffer: Buffer,
  filename: string
): Promise<string | null> {
  const { error } = await supabase.storage
    .from('vocabaudio')
    .upload(filename, buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) {
    console.error(`   ❌ 오디오 업로드 실패: ${filename}`, error.message)
    return null
  }

  const { data: urlData } = supabase.storage
    .from('vocabaudio')
    .getPublicUrl(filename)

  return urlData?.publicUrl || null
}

// ─────────────────────────────────────────────────────────────
// TTS 추가 및 DB 저장
// ─────────────────────────────────────────────────────────────
async function addTTSAndSave(
  mode: 'sw' | 'ko',
  entries: GeneratedEntry[]
): Promise<void> {
  console.log(`\n🔊 ${mode.toUpperCase()} 버전 TTS 생성 및 저장 중...`)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    console.log(`   [${i + 1}/${entries.length}] "${entry.word}" 처리 중...`)

    try {
      // TTS 생성
      const wordAudio = await generateTTS(entry.word)
      const meaningSwAudio = await generateTTS(entry.meaning_sw)
      const meaningKoAudio = await generateTTS(entry.meaning_ko)
      const meaningEnAudio = await generateTTS(entry.meaning_en)
      const exampleAudio = await generateTTS(entry.example)

      // 오디오 업로드
      const ts = Date.now()
      const wordAudioUrl = await uploadAudio(wordAudio, `${mode}/${ts}_word_${i}.mp3`)
      const meaningSwAudioUrl = await uploadAudio(meaningSwAudio, `${mode}/${ts}_meaning_sw_${i}.mp3`)
      const meaningKoAudioUrl = await uploadAudio(meaningKoAudio, `${mode}/${ts}_meaning_ko_${i}.mp3`)
      const meaningEnAudioUrl = await uploadAudio(meaningEnAudio, `${mode}/${ts}_meaning_en_${i}.mp3`)
      const exampleAudioUrl = await uploadAudio(exampleAudio, `${mode}/${ts}_example_${i}.mp3`)

      // DB 저장
      const row = {
        mode,
        word: entry.word,
        word_pronunciation: entry.word_pronunciation,
        word_audio_url: wordAudioUrl,

        meaning_sw: entry.meaning_sw,
        meaning_sw_pronunciation: null as string | null,
        meaning_sw_audio_url: meaningSwAudioUrl,

        meaning_ko: entry.meaning_ko,
        meaning_ko_pronunciation: null as string | null,
        meaning_ko_audio_url: meaningKoAudioUrl,

        meaning_en: entry.meaning_en,
        meaning_en_pronunciation: entry.meaning_en_pronunciation,
        meaning_en_audio_url: meaningEnAudioUrl,

        example: entry.example,
        example_pronunciation: entry.example_pronunciation,
        example_audio_url: exampleAudioUrl,

        example_translation_ko: entry.example_translation_ko,
        example_translation_en: entry.example_translation_en,

        pos: entry.pos,
      }

      const { error } = await supabase.from('generated_vocab').insert(row)
      if (error) {
        console.error(`   ❌ DB 저장 실패: ${entry.word}`, error.message)
      } else {
        console.log(`   ✅ "${entry.word}" 저장 완료`)
      }
    } catch (err) {
      console.error(`   ❌ "${entry.word}" 처리 실패:`, err)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 메인 실행
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🚀 GPT-5.2 Pro (Responses API) 어휘 생성 시작')
  console.log('═══════════════════════════════════════════════════════════')

  // 기존 데이터는 purge-cloud.ts로 미리 삭제했다고 가정

  // CSV 로드
  const csvPath = path.join(process.cwd(), 'data', 'Oxford.csv')
  console.log(`\n📂 CSV 로드: ${csvPath}`)
  const seedWords = parseCSV(csvPath)
  console.log(`   총 ${seedWords.length}개 단어 로드됨`)

  // SW 버전 생성 (한국어 단어 학습 - 스와힐리어 사용자용)
  const swEntries = await generateVocabulary('sw', seedWords.slice(0, 10), ENTRIES_PER_MODE)
  await addTTSAndSave('sw', swEntries)

  // KO 버전 생성 (스와힐리어 단어 학습 - 한국어 사용자용)
  const koEntries = await generateVocabulary('ko', seedWords.slice(10, 20), ENTRIES_PER_MODE)
  await addTTSAndSave('ko', koEntries)

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('✅ 모든 생성 완료!')
  console.log(`   SW 버전: ${swEntries.length}개`)
  console.log(`   KO 버전: ${koEntries.length}개`)
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(console.error)

