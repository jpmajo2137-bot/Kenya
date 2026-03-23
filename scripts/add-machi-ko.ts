/**
 * KO 모드 Machi (3월) 단어를 generated_vocab에 추가
 * - OpenAI TTS로 음성 생성 (word, meaning_sw, meaning_ko, meaning_en, example)
 * - Supabase Storage에 오디오 업로드
 * - generated_vocab 테이블에 삽입
 * - topicClassification.ts에 시간/날짜 분류 등록
 *
 * 사용: npx tsx scripts/add-machi-ko.ts
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const TTS_MODEL = 'tts-1-hd'
const TTS_VOICE = 'nova' as const

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function generateTTS(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    speed: 0.9,
  })
  return Buffer.from(await response.arrayBuffer())
}

async function uploadAudio(filePath: string, buffer: Buffer): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('vocabaudio')
    .upload(filePath, buffer, { contentType: 'audio/mpeg', upsert: true })

  if (error) {
    console.error(`   ❌ 오디오 업로드 실패: ${filePath}`, error.message)
    return null
  }

  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(filePath)
  return urlData?.publicUrl || null
}

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('🔧 KO 모드 Machi (3월) 단어 추가')
  console.log('═══════════════════════════════════════════════════\n')

  // 1) 기존 KO 모드 Machi 확인
  const { data: existing } = await supabase
    .from('generated_vocab')
    .select('id, word, mode')
    .eq('mode', 'ko')
    .eq('word', 'Machi')
    .limit(1)

  if (existing && existing.length > 0) {
    console.log(`   ⚠️ 이미 존재: "${existing[0].word}" (id=${existing[0].id}, mode=${existing[0].mode})`)
    console.log('   중복 방지를 위해 종료합니다.')
    return
  }

  // 2) 단어 데이터 정의
  const entry = {
    word: 'Machi',
    word_pronunciation: 'MA-chi',
    meaning_sw: 'Machi',
    meaning_sw_pronunciation: 'MA-chi',
    meaning_ko: '3월',
    meaning_ko_pronunciation: 'samwol',
    meaning_en: 'March',
    meaning_en_pronunciation: '/mɑːrtʃ/',
    example: 'Mwezi wa Machi una siku thelathini na moja.',
    example_pronunciation: 'mWE-zi wa MA-chi U-na SI-ku the-la-THI-ni na MO-ja',
    example_translation_ko: '3월은 31일이 있어요.',
    example_translation_en: 'March has thirty-one days.',
    pos: 'n.',
    category: '시간',
  }

  console.log(`📝 단어: ${entry.word} [${entry.word_pronunciation}]`)
  console.log(`   뜻(ko): ${entry.meaning_ko}  뜻(en): ${entry.meaning_en}`)
  console.log(`   예문: ${entry.example}`)
  console.log(`   예문(ko): ${entry.example_translation_ko}`)
  console.log(`   예문(en): ${entry.example_translation_en}\n`)

  // 3) TTS 오디오 생성
  console.log('🔊 TTS 오디오 생성 중...')
  const ts = Date.now()

  const wordAudio = await generateTTS(entry.word)
  console.log('   ✅ word 오디오 생성')

  const meaningSwAudio = await generateTTS(entry.meaning_sw)
  console.log('   ✅ meaning_sw 오디오 생성')

  const meaningKoAudio = await generateTTS(entry.meaning_ko)
  console.log('   ✅ meaning_ko 오디오 생성')

  const meaningEnAudio = await generateTTS(entry.meaning_en)
  console.log('   ✅ meaning_en 오디오 생성')

  const exampleAudio = await generateTTS(entry.example)
  console.log('   ✅ example 오디오 생성\n')

  // 4) Supabase Storage에 업로드
  console.log('📤 오디오 업로드 중...')
  const wordAudioUrl = await uploadAudio(`ko/${ts}_machi_word.mp3`, wordAudio)
  const meaningSwAudioUrl = await uploadAudio(`ko/${ts}_machi_meaning_sw.mp3`, meaningSwAudio)
  const meaningKoAudioUrl = await uploadAudio(`ko/${ts}_machi_meaning_ko.mp3`, meaningKoAudio)
  const meaningEnAudioUrl = await uploadAudio(`ko/${ts}_machi_meaning_en.mp3`, meaningEnAudio)
  const exampleAudioUrl = await uploadAudio(`ko/${ts}_machi_example.mp3`, exampleAudio)
  console.log('   ✅ 모든 오디오 업로드 완료\n')

  // 5) generated_vocab에 삽입
  console.log('💾 DB 삽입 중...')
  const row = {
    mode: 'ko' as const,
    word: entry.word,
    word_pronunciation: entry.word_pronunciation,
    word_audio_url: wordAudioUrl,
    image_url: null as string | null,
    meaning_sw: entry.meaning_sw,
    meaning_sw_pronunciation: entry.meaning_sw_pronunciation,
    meaning_sw_audio_url: meaningSwAudioUrl,
    meaning_ko: entry.meaning_ko,
    meaning_ko_pronunciation: entry.meaning_ko_pronunciation,
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
    category: entry.category,
  }

  const { data: inserted, error } = await supabase
    .from('generated_vocab')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error('   ❌ DB 삽입 실패:', error.message)
    throw error
  }

  const newId = inserted!.id
  console.log(`   ✅ DB 삽입 완료: id=${newId}\n`)

  // 6) topicClassification.ts에 시간/날짜 분류 추가
  console.log('📂 topicClassification.ts 업데이트 중...')
  const tcPath = path.join(process.cwd(), 'src', 'lib', 'topicClassification.ts')
  let tcContent = fs.readFileSync(tcPath, 'utf-8')

  if (tcContent.includes(newId)) {
    console.log('   ⚠️ 이미 topicClassification에 존재')
  } else {
    const addEntry = `,"${newId}":["ko","시간/날짜"]`
    tcContent = tcContent.replace(
      /\}\s*;\s*\nexport default data/,
      `${addEntry}};\nexport default data`
    )
    fs.writeFileSync(tcPath, tcContent, 'utf-8')
    console.log(`   ✅ topicClassification.ts에 추가: ${newId} → ["ko","시간/날짜"]`)
  }

  // 7) _classify_progress.json 업데이트
  const progressPath = path.join(process.cwd(), 'scripts', '_classify_progress.json')
  let progress: { results?: Record<string, string[]>; modes?: Record<string, string> } = {}
  if (fs.existsSync(progressPath)) {
    progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'))
  }
  progress.results = progress.results || {}
  progress.modes = progress.modes || {}
  progress.results[newId] = ['시간/날짜']
  progress.modes[newId] = 'ko'
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8')
  console.log('   ✅ _classify_progress.json 업데이트')

  console.log('\n═══════════════════════════════════════════════════')
  console.log('🎉 KO 모드 Machi (3월) 추가 완료!')
  console.log(`   ID: ${newId}`)
  console.log(`   단어: ${entry.word} [${entry.word_pronunciation}]`)
  console.log(`   뜻: ${entry.meaning_ko} / ${entry.meaning_en}`)
  console.log(`   예문: ${entry.example}`)
  console.log('═══════════════════════════════════════════════════')
}

main().catch(console.error)
