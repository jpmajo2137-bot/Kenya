/**
 * "정류장은 언덕 아래쪽에 있어요." — TTS가 의문문처럼 올라가는 경우 평서문에 가깝게 (SSML prosody)
 * generated_vocab 에서 example 이 위 문장과 일치하는 모든 행(sw/ko)의 example_audio_url 갱신
 *
 * 사용: npx tsx scripts/fix-jeongnyujang-example-declarative.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_KO = 'ko-KR-Wavenet-B'
const GCP_TTS_SPEED = 0.85

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

const EXAMPLE_DB = '정류장은 언덕 아래쪽에 있어요.'
const SSML = `<speak>정류장은 언덕 아래쪽에 <prosody pitch="-1st" rate="96%">있어요</prosody>.<break time="80ms"/></speak>`

function gcpLangCode(name: string) {
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'ko-KR'
}

async function ttsKoSsml(ssml: string): Promise<ArrayBuffer> {
  const langCode = gcpLangCode(GCP_VOICE_KO)
  const [response] = await ttsClient.synthesizeSpeech({
    input: { ssml },
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
  console.log(`"${EXAMPLE_DB}" 평서문 억양 SSML 교정 (${GCP_VOICE_KO})\n`)

  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, example, example_audio_url')
    .eq('example', EXAMPLE_DB)

  if (error) {
    console.error('DB 조회 실패:', error.message)
    return
  }
  if (!data?.length) {
    console.log('해당 예문 행 없음')
    return
  }

  console.log(`${data.length}개 행\n`)
  const audio = await ttsKoSsml(SSML)
  console.log('TTS 생성 완료\n')

  for (const row of data) {
    console.log(`  [${row.mode}] "${row.word}" id=${row.id}`)
    const ts = Date.now()
    const path = `fix/${row.mode}/${row.id}_example_f_${ts}.mp3`
    try {
      const newUrl = await uploadAudio(path, audio)
      const { error: uerr } = await supabase.from('generated_vocab').update({ example_audio_url: newUrl }).eq('id', row.id)
      if (uerr) console.error(`    업데이트 실패: ${uerr.message}`)
      else console.log(`    → ${newUrl}\n`)
    } catch (e) {
      console.error(`    실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log('완료.')
}

main()
