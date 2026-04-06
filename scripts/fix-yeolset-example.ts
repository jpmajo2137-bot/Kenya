/**
 * "열셋" 예문 교정: "저는 열셋 살이에요." → "저는 열세 살이에요."
 * 발음부호 + 한국어 음성(여자 목소리) 재생성
 *
 * 사용: npx tsx scripts/fix-yeolset-example.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_KO_FEMALE = process.env.GCP_TTS_KO_VOICE || 'ko-KR-Wavenet-A'
const GCP_TTS_SPEED = 0.9

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

async function ttsKo(text: string, ssml?: string): Promise<ArrayBuffer> {
  const [response] = await ttsClient.synthesizeSpeech({
    input: ssml ? { ssml } : { text },
    voice: {
      languageCode: 'ko-KR',
      name: GCP_VOICE_KO_FEMALE,
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
  console.log('예문·발음·음성 교정\n')

  const WORD = '일요일'
  /** 예문 문장 유지, TTS만 SSML로 평서형에 가깝게 */
  const EXAMPLE = '일요일에 같이 놀아요.'
  const EXAMPLE_PRONUNCIATION = 'iryoire gachi norayo'
  const TTS_SSML = `<speak>일요일에 같이 <prosody pitch="-1st" rate="96%">놀아요</prosody>.<break time="80ms"/></speak>`
  const OLD_EXAMPLE = ''
  /** 평서문 예문에 맞출 때만 지정 (다른 단어 교정 시 undefined 로 두고 스킵) */
  const EXAMPLE_EN: string | undefined = undefined
  const EXAMPLE_SW: string | undefined = undefined

  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, example, example_audio_url, example_pronunciation, example_translation_ko')
    .eq('word', WORD)

  if (error) {
    console.error('DB 조회 실패:', error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log(`DB에 "${WORD}" 없음`)
    return
  }

  console.log(`${data.length}개 행 발견\n`)

  const audio = await ttsKo(EXAMPLE, TTS_SSML)
  console.log(`TTS 생성 완료 (${GCP_VOICE_KO_FEMALE}, SSML 평서형)\n`)

  for (const row of data) {
    console.log(`  [${row.mode}] id=${row.id}`)
    console.log(`    예문: "${row.example}"`)

    const ts = Date.now()
    const path = `fix/${row.mode}/${row.id}_example_f_${ts}.mp3`
    const newUrl = await uploadAudio(path, audio)

    const patch: Record<string, string> = {
      example: EXAMPLE,
      example_pronunciation: EXAMPLE_PRONUNCIATION,
      example_audio_url: newUrl,
    }
    if (EXAMPLE_EN !== undefined) patch.example_translation_en = EXAMPLE_EN
    if (EXAMPLE_SW !== undefined) patch.example_translation_sw = EXAMPLE_SW
    const koMirrorsExample =
      row.example_translation_ko === row.example ||
      row.example_translation_ko === `${EXAMPLE}.` ||
      (OLD_EXAMPLE && row.example_translation_ko === OLD_EXAMPLE)
    if (koMirrorsExample) {
      patch.example_translation_ko = EXAMPLE
    }

    const { error: updateError } = await supabase.from('generated_vocab').update(patch).eq('id', row.id)

    if (updateError) {
      console.error(`    DB 업데이트 실패: ${updateError.message}`)
    } else {
      console.log(`    → pron: [${EXAMPLE_PRONUNCIATION}]`)
      console.log(`    → audio: ${newUrl}\n`)
    }
  }

  console.log('완료.')
}

main()
