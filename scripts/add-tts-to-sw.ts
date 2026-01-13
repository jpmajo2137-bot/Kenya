/**
 * SW 버전에서 TTS 없는 단어들에 TTS를 추가하는 스크립트
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY!
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION!
const AZURE_VOICE_KO = 'ko-KR-SunHiNeural'
const AZURE_VOICE_EN = 'en-US-JennyNeural'
const AZURE_VOICE_SW = 'sw-KE-ZuriNeural'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

type TTSLang = 'ko' | 'sw' | 'en'

const AZURE_VOICE_MAP: Record<TTSLang, string> = {
  ko: AZURE_VOICE_KO,
  en: AZURE_VOICE_EN,
  sw: AZURE_VOICE_SW,
}

function slugify(text: string): string {
  // 한글 제거하고 영문/숫자만 남기기
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30) || 'word'
}

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
          console.log(`    ⚠️ Azure TTS 에러 (${lang}): ${error}`)
          resolve(null)
        }
      )
    } catch (err) {
      console.log(`    ⚠️ Azure TTS 예외 (${lang}): ${err}`)
      resolve(null)
    }
  })
}

async function uploadAudio(audioBuffer: Buffer, filePath: string): Promise<string | null> {
  const { error } = await supabase.storage
    .from('vocabaudio')
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) {
    console.log(`    ⚠️ 오디오 업로드 실패: ${error.message}`)
    return null
  }

  const { data: urlData } = supabase.storage
    .from('vocabaudio')
    .getPublicUrl(filePath)

  return urlData.publicUrl
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🔊 SW 버전 기존 단어에 TTS 추가 스크립트')
  console.log('═══════════════════════════════════════════════════════════')

  // TTS가 없는 SW 단어들 가져오기
  const { data: wordsWithoutTTS, error } = await supabase
    .from('generated_vocab')
    .select('*')
    .eq('mode', 'sw')
    .is('word_audio_url', null)
    .limit(100) // 한 번에 100개씩 처리

  if (error) {
    console.log('❌ DB 조회 실패:', error.message)
    return
  }

  if (!wordsWithoutTTS || wordsWithoutTTS.length === 0) {
    console.log('✅ TTS가 없는 단어가 없습니다!')
    return
  }

  console.log(`📋 TTS 없는 단어: ${wordsWithoutTTS.length}개 처리 시작...\n`)

  for (let i = 0; i < wordsWithoutTTS.length; i++) {
    const entry = wordsWithoutTTS[i]
    console.log(`[${i + 1}/${wordsWithoutTTS.length}] "${entry.word}" TTS 생성 중...`)

    const audioUrls: Record<string, string | null> = {}

    // SW 모드에서는 word가 한국어
    // 1. 한국어 단어 TTS
    if (entry.word) {
      const wordAudio = await synthesizeWithAzure(entry.word, 'ko')
      if (wordAudio) {
        const path = `sw/word/${slugify(entry.word)}-${Date.now()}.mp3`
        audioUrls.word_audio_url = await uploadAudio(wordAudio, path)
        console.log(`   ✅ 단어 TTS (한국어)`)
      }
    }

    // 2. 스와힐리어 뜻 TTS
    if (entry.meaning_sw) {
      const meaningSwAudio = await synthesizeWithAzure(entry.meaning_sw, 'sw')
      if (meaningSwAudio) {
        const path = `sw/meaning-sw/${slugify(entry.word)}-${Date.now()}.mp3`
        audioUrls.meaning_sw_audio_url = await uploadAudio(meaningSwAudio, path)
        console.log(`   ✅ 스와힐리어 뜻 TTS`)
      }
    }

    // 3. 영어 뜻 TTS
    if (entry.meaning_en) {
      const meaningEnAudio = await synthesizeWithAzure(entry.meaning_en, 'en')
      if (meaningEnAudio) {
        const path = `sw/meaning-en/${slugify(entry.word)}-${Date.now()}.mp3`
        audioUrls.meaning_en_audio_url = await uploadAudio(meaningEnAudio, path)
        console.log(`   ✅ 영어 뜻 TTS`)
      }
    }

    // 4. 예문 TTS (한국어)
    if (entry.example) {
      const exampleAudio = await synthesizeWithAzure(entry.example, 'ko')
      if (exampleAudio) {
        const path = `sw/example/${slugify(entry.word)}-${Date.now()}.mp3`
        audioUrls.example_audio_url = await uploadAudio(exampleAudio, path)
        console.log(`   ✅ 예문 TTS (한국어)`)
      }
    }

    // DB 업데이트
    const { error: updateError } = await supabase
      .from('generated_vocab')
      .update(audioUrls)
      .eq('mode', 'sw')
      .eq('word', entry.word)

    if (updateError) {
      console.log(`   ❌ DB 업데이트 실패: ${updateError.message}`)
    } else {
      console.log(`   ✅ DB 저장 완료`)
    }

    // 잠시 대기 (API 부하 방지)
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('✅ 완료! 남은 단어가 있으면 스크립트를 다시 실행하세요.')
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(console.error)

