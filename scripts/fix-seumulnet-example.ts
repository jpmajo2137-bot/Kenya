/**
 * 스물넷 카드 예문 → 스물네 개의 연필을 사서 친구들에게 나누어 주었어요.
 * 발음·TTS·EN/SW (다른 단어/예문은 변경 없음)
 *
 * 사용: npx tsx scripts/fix-seumulnet-example.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_KO = 'ko-KR-Wavenet-B'
const GCP_TTS_SPEED = 0.85

const WORD = '스물넷'
const EXAMPLE_NEW = '스물네 개의 연필을 사서 친구들에게 나누어 주었어요.'
const PRON = 'seumulne gae-ui yeonpireul saseo chingudeul-ege nanueo jueosseoyo.'
const EN = 'I bought twenty-four pencils and shared them with my friends.'
const SW = 'Nilinunua penseli ishirini na nne nikazigawa kwa marafiki zangu.'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

function gcpLangCode(name: string) {
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'ko-KR'
}

async function ttsKo(text: string): Promise<ArrayBuffer> {
  const langCode = gcpLangCode(GCP_VOICE_KO)
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: langCode,
      name: GCP_VOICE_KO,
      ssmlGender: 'FEMALE',
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: GCP_TTS_SPEED,
    },
  })
  if (!response.audioContent) throw new Error('No audioContent')
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
  console.log(`"${WORD}" 예문 교정\n`)

  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, example')
    .eq('word', WORD)

  if (error) {
    console.error('조회 실패:', error.message)
    return
  }
  if (!data?.length) {
    console.log('해당 단어 없음')
    return
  }

  const audio = await ttsKo(EXAMPLE_NEW)
  console.log('TTS 완료\n')

  for (const row of data) {
    console.log(`  [${row.mode}] id=${row.id}`)
    console.log(`    기존 example: ${row.example}`)
    const ts = Date.now()
    const path = `fix/${row.mode}/${row.id}_example_f_${ts}.mp3`
    try {
      const newUrl = await uploadAudio(path, audio)
      const { error: uerr } = await supabase
        .from('generated_vocab')
        .update({
          example: EXAMPLE_NEW,
          example_pronunciation: PRON,
          example_audio_url: newUrl,
          example_translation_en: EN,
          example_translation_sw: SW,
        })
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
