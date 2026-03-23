/**
 * Machi(3월) 단어 업데이트 스크립트
 * - meaning_ko를 '3월'로 업데이트
 * - 한국어 뜻('3월') TTS 생성 + 업로드
 * - 영어 뜻('March') TTS 생성 + 업로드
 * - 한국어 예문 번역 추가 + TTS 생성
 * - 스와힐리어 예문 TTS 생성
 *
 * 실행: npx tsx scripts/update-machi.ts
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY!
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION!

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const VOICE_MAP = {
  ko: 'ko-KR-SunHiNeural',
  en: 'en-US-JennyNeural',
  sw: 'sw-KE-ZuriNeural',
} as const

type TTSLang = keyof typeof VOICE_MAP

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
}

async function synthesize(text: string, lang: TTSLang): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const cfg = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION)
      cfg.speechSynthesisVoiceName = VOICE_MAP[lang]
      cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3

      const synth = new sdk.SpeechSynthesizer(cfg)
      synth.speakTextAsync(
        text,
        (result) => {
          synth.close()
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(Buffer.from(result.audioData))
          } else {
            console.log(`  ⚠️ TTS 실패 (${lang}): ${result.errorDetails}`)
            resolve(null)
          }
        },
        (err) => { synth.close(); console.log(`  ⚠️ TTS 에러 (${lang}): ${err}`); resolve(null) },
      )
    } catch (err) {
      console.log(`  ⚠️ TTS 예외 (${lang}): ${err}`)
      resolve(null)
    }
  })
}

async function upload(buf: Buffer, path: string): Promise<string | null> {
  const { error } = await supabase.storage.from('vocabaudio').upload(path, buf, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) { console.log(`  ⚠️ 업로드 실패: ${error.message}`); return null }
  return supabase.storage.from('vocabaudio').getPublicUrl(path).data.publicUrl
}

async function main() {
  console.log('════════════════════════════════════════════════')
  console.log('🔄 Machi(3월) 단어 업데이트')
  console.log('════════════════════════════════════════════════')

  // 1. Machi 레코드 검색 (ko 모드)
  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('*')
    .eq('word', 'Machi')

  if (error) { console.log('❌ 조회 실패:', error.message); return }
  if (!rows?.length) { console.log('❌ Machi 레코드를 찾을 수 없습니다.'); return }

  for (const row of rows) {
    console.log(`\n📝 모드: ${row.mode}, ID: ${row.id}`)

    const updates: Record<string, string | null> = {}

    // meaning_ko 업데이트
    if (row.meaning_ko !== '3월') {
      updates.meaning_ko = '3월'
      updates.meaning_ko_pronunciation = 'samwol'
      console.log('  → meaning_ko: 3월')
    }

    // example_translation_ko 업데이트
    if (!row.example_translation_ko) {
      updates.example_translation_ko = '우리는 3월에 시작해요.'
      console.log('  → example_translation_ko: 우리는 3월에 시작해요.')
    }

    // 한국어 뜻 TTS ('3월')
    if (!row.meaning_ko_audio_url) {
      console.log('  🔊 한국어 뜻 TTS 생성...')
      const buf = await synthesize('3월', 'ko')
      if (buf) {
        const url = await upload(buf, `ko/meaning-ko/machi-${Date.now()}.mp3`)
        if (url) { updates.meaning_ko_audio_url = url; console.log('  ✅ 한국어 뜻 TTS') }
      }
    }

    // 영어 뜻 TTS ('March')
    if (!row.meaning_en_audio_url) {
      console.log('  🔊 영어 뜻 TTS 생성...')
      const buf = await synthesize('March', 'en')
      if (buf) {
        const url = await upload(buf, `ko/meaning-en/machi-${Date.now()}.mp3`)
        if (url) { updates.meaning_en_audio_url = url; console.log('  ✅ 영어 뜻 TTS') }
      }
    }

    // 스와힐리어 단어 TTS ('Machi')
    if (!row.word_audio_url) {
      console.log('  🔊 단어 TTS 생성...')
      const buf = await synthesize('Machi', 'sw')
      if (buf) {
        const url = await upload(buf, `ko/word/machi-${Date.now()}.mp3`)
        if (url) { updates.word_audio_url = url; console.log('  ✅ 단어 TTS') }
      }
    }

    // 예문 TTS
    if (row.example && !row.example_audio_url) {
      console.log('  🔊 예문 TTS 생성...')
      const buf = await synthesize(row.example, 'sw')
      if (buf) {
        const path = `ko/example/machi-${Date.now()}.mp3`
        const url = await upload(buf, path)
        if (url) { updates.example_audio_url = url; console.log('  ✅ 예문 TTS') }
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log('  ℹ️ 업데이트할 항목 없음')
      continue
    }

    const { error: updateErr } = await supabase
      .from('generated_vocab')
      .update(updates)
      .eq('id', row.id)

    if (updateErr) {
      console.log(`  ❌ DB 업데이트 실패: ${updateErr.message}`)
    } else {
      console.log(`  ✅ DB 업데이트 완료 (${Object.keys(updates).length}개 필드)`)
    }
  }

  console.log('\n════════════════════════════════════════════════')
  console.log('✅ Machi 업데이트 완료!')
  console.log('════════════════════════════════════════════════')
}

main().catch(console.error)
