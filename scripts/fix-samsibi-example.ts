/**
 * 삼십이 카드 예문 → 삼십이 명의 손님이 잔치에 와서 함께 식사를 했어요.
 * 발음·TTS·EN/SW (다른 단어/예문은 변경 없음)
 *
 * 사용: npx tsx scripts/fix-samsibi-example.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_KO = 'ko-KR-Wavenet-B'
const GCP_TTS_SPEED = 0.85

const WORD = '삼십이'
const EXAMPLE_NEW = '삼십이 명의 손님이 잔치에 와서 함께 식사를 했어요.'
const PRON = 'samsib-i myeong-ui sonnim-i janchi-e waseo hamkke siksareul haesseoyo.'
const EN = 'Thirty-two guests came to the party and had a meal together.'
const SW = 'Wageni thelathini na wawili walifika kwenye sherehe na kula pamoja.'

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
