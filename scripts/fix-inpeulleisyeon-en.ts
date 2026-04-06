/**
 * 인플레이션 — meaning_en → inflation, 여자 음성 TTS (en-US-Wavenet-F), sw/ko 전 행
 * 사용: npx tsx scripts/fix-inpeulleisyeon-en.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_EN_FEMALE = 'en-US-Wavenet-F'
const GCP_TTS_SPEED = 0.9

const WORD = '인플레이션'
const NEW_EN = 'inflation'
const TTS_TEXT = 'inflation'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

async function ttsEn(text: string): Promise<ArrayBuffer> {
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: GCP_VOICE_EN_FEMALE,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: GCP_TTS_SPEED,
    },
  })
  if (!response.audioContent) throw new Error('No audioContent from Google TTS')
  return response.audioContent as ArrayBuffer
}

async function uploadAudio(path: string, audio: ArrayBuffer): Promise<string> {
  const blob = new Blob([audio], { type: 'audio/mpeg' })
  const { data, error } = await supabase.storage.from('vocabaudio').upload(path, blob, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(data.path)
  return urlData.publicUrl
}

async function main() {
  console.log(`"${WORD}" meaning_en → "${NEW_EN}" + ${GCP_VOICE_EN_FEMALE}\n`)

  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, meaning_en, meaning_en_audio_url')
    .eq('word', WORD)

  if (error) {
    console.error('DB 조회 실패:', error.message)
    return
  }
  if (!data?.length) {
    console.log('해당 단어 없음')
    return
  }

  console.log(`${data.length}개 행\n`)
  const audio = await ttsEn(TTS_TEXT)
  console.log(`TTS 완료 ("${TTS_TEXT}")\n`)

  for (const row of data) {
    console.log(`  [${row.mode}] id=${row.id} (기존 meaning_en: ${row.meaning_en})`)
    const ts = Date.now()
    const path = `fix/${row.mode}/${row.id}_meaning_en_f_${ts}.mp3`
    try {
      const newUrl = await uploadAudio(path, audio)
      const { error: uerr } = await supabase
        .from('generated_vocab')
        .update({ meaning_en: NEW_EN, meaning_en_audio_url: newUrl })
        .eq('id', row.id)
      if (uerr) console.error(`    실패: ${uerr.message}`)
      else console.log(`    → ${newUrl}\n`)
    } catch (e) {
      console.error(`    실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log('완료.')
}

main()
