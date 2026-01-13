/**
 * KO 버전만 생성하는 스크립트
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

const systemPrompt = `You are an expert linguist creating vocabulary entries for Korean speakers learning Swahili.

For each English word provided, create a Swahili vocabulary entry with:

1. word: The Swahili word
2. word_pronunciation: Phonetic pronunciation guide (e.g., "ka-RI-bu")
3. meaning_sw: Swahili meaning (definition in Swahili)
4. meaning_ko: Korean meaning (한국어 뜻)
5. meaning_en: English meaning
6. meaning_en_pronunciation: IPA pronunciation
7. example: Example sentence in Swahili
8. example_pronunciation: Phonetic pronunciation of example
9. example_translation_sw: Same as example
10. example_translation_ko: Korean translation
11. example_translation_en: English translation
12. pos: Part of speech

CRITICAL: All Swahili must have accurate phonetic pronunciation. All Korean translations must be natural.
Return as valid JSON array.`

async function generateTTS(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: 'nova',
    input: text,
    speed: 0.9,
  })
  return Buffer.from(await response.arrayBuffer())
}

async function uploadAudio(buffer: Buffer, filename: string): Promise<string | null> {
  const { error } = await supabase.storage.from('vocabaudio').upload(filename, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) return null
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(filename)
  return urlData?.publicUrl || null
}

async function main() {
  console.log('🤖 GPT-5.2로 KO 버전 10개 생성 중...')

  // CSV 로드
  const csvPath = path.join(process.cwd(), 'data', 'Oxford.csv')
  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.split('\n').slice(1)
  const seedWords: Array<{ word: string; meaning: string }> = []
  for (const line of lines) {
    if (!line.trim()) continue
    const parts = line.split(',')
    if (parts.length >= 5) {
      const word = parts[2]?.trim()
      const meaning = parts[4]?.trim()
      if (word && meaning) seedWords.push({ word, meaning })
    }
  }

  const selected = seedWords.slice(10, 20)
  const wordList = selected.map((w, i) => `${i + 1}. ${w.word}: ${w.meaning}`).join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate vocabulary entries for these 10 English words:\n\n${wordList}\n\nReturn a JSON array with exactly 10 entries.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_completion_tokens: 8000,
  })

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}')
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed.vocabulary || parsed.words || parsed.entries || []
  console.log(`   ✅ ${entries.length}개 생성 완료`)

  console.log('\n🔊 KO 버전 TTS 생성 및 저장 중...')
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    console.log(`   [${i + 1}/${entries.length}] "${entry.word}" 처리 중...`)

    const wordAudio = await generateTTS(entry.word)
    const meaningSwAudio = await generateTTS(entry.meaning_sw)
    const meaningKoAudio = await generateTTS(entry.meaning_ko)
    const meaningEnAudio = await generateTTS(entry.meaning_en)
    const exampleAudio = await generateTTS(entry.example)

    const ts = Date.now()
    const wordAudioUrl = await uploadAudio(wordAudio, `ko/${ts}_word_${i}.mp3`)
    const meaningSwAudioUrl = await uploadAudio(meaningSwAudio, `ko/${ts}_meaning_sw_${i}.mp3`)
    const meaningKoAudioUrl = await uploadAudio(meaningKoAudio, `ko/${ts}_meaning_ko_${i}.mp3`)
    const meaningEnAudioUrl = await uploadAudio(meaningEnAudio, `ko/${ts}_meaning_en_${i}.mp3`)
    const exampleAudioUrl = await uploadAudio(exampleAudio, `ko/${ts}_example_${i}.mp3`)

    const row = {
      mode: 'ko',
      word: entry.word,
      word_pronunciation: entry.word_pronunciation,
      word_audio_url: wordAudioUrl,
      meaning_sw: entry.meaning_sw,
      meaning_sw_pronunciation: null,
      meaning_sw_audio_url: meaningSwAudioUrl,
      meaning_ko: entry.meaning_ko,
      meaning_ko_pronunciation: null,
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
      console.log(`   ❌ DB 저장 실패: ${entry.word} ${error.message}`)
    } else {
      console.log(`   ✅ "${entry.word}" 저장 완료`)
    }
  }

  console.log('\n✅ KO 버전 생성 완료!')
}

main().catch(console.error)


