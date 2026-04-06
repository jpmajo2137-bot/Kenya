/**
 * 참가자가 스물하나 명이에요. → 참가자가 스물한 명이에요. (발음·예문·TTS)
 * 사용: npx tsx scripts/fix-chamgaja-seumulhan-example.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_KO = 'ko-KR-Wavenet-B'
const GCP_TTS_SPEED = 0.85

const EXAMPLE_OLD = '참가자가 스물하나 명이에요.'
const EXAMPLE_NEW = '참가자가 스물한 명이에요.'
const PRON = 'chamgajaga seumulhan myeongieyo.'

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
  console.log(`예문 교정: "${EXAMPLE_OLD}" → "${EXAMPLE_NEW}"\n`)

  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, example, example_audio_url, example_translation_ko')
    .eq('example', EXAMPLE_OLD)

  if (error) {
    console.error('조회 실패:', error.message)
    return
  }
  if (!data?.length) {
    console.log('해당 예문 없음')
    return
  }

  const audio = await ttsKo(EXAMPLE_NEW)
  console.log(`TTS 완료, ${data.length}개 행\n`)

  for (const row of data) {
    console.log(`  [${row.mode}] ${row.word} id=${row.id}`)
    const ts = Date.now()
    const path = `fix/${row.mode}/${row.id}_example_f_${ts}.mp3`
    try {
      const newUrl = await uploadAudio(path, audio)
      const patch: Record<string, string> = {
        example: EXAMPLE_NEW,
        example_pronunciation: PRON,
        example_audio_url: newUrl,
      }
      const ko = row.example_translation_ko?.trim()
      if (ko === EXAMPLE_OLD.trim()) patch.example_translation_ko = EXAMPLE_NEW

      const { error: uerr } = await supabase.from('generated_vocab').update(patch).eq('id', row.id)
      if (uerr) console.error(`    실패: ${uerr.message}`)
      else console.log(`    → ${newUrl}\n`)
    } catch (e) {
      console.error(`    실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log('완료.')
}

main()
