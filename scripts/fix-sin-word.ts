/**
 * "신" 단어 종합 교정
 * - 한국어 뜻: 하나님
 * - 스와힐리어 뜻: Mungu
 * - 영어 뜻: God
 * - 예문: 하나님은 너를 사랑하신다.
 * - 예문 번역: SW/EN 교정
 * - 모든 음성 재생성
 *
 * 사용: npx tsx scripts/fix-sin-word.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_KO = process.env.GCP_TTS_KO_VOICE || 'ko-KR-Wavenet-A'
const GCP_VOICE_EN = 'en-US-Wavenet-F'
const GCP_VOICE_SW = process.env.GCP_TTS_SW_VOICE || 'sw-KE-Standard-A'
const GCP_TTS_SPEED = 0.9

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

async function tts(text: string, langCode: string, voiceName: string): Promise<ArrayBuffer> {
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode: langCode, name: voiceName },
    audioConfig: { audioEncoding: 'MP3' as const, speakingRate: GCP_TTS_SPEED },
  })
  if (!response.audioContent) throw new Error('No audioContent')
  return response.audioContent as ArrayBuffer
}

async function upload(path: string, audio: ArrayBuffer): Promise<string> {
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
  console.log('"신" 단어 종합 교정\n')

  const { data, error } = await supabase
    .from('generated_vocab')
    .select('*')
    .eq('word', '신')

  if (error) { console.error('DB 조회 실패:', error.message); return }
  if (!data?.length) { console.log('DB에 "신" 없음'); return }

  console.log(`${data.length}개 행 발견\n`)

  const newExample = '하나님은 너를 사랑하신다.'
  const newExamplePron = 'Hananimeun neoreul saranghasinda.'
  const newExampleSw = 'Mungu anakupenda.'
  const newExampleEn = 'God loves you.'

  console.log('TTS 생성 중...')
  const [meaningEnAudio, exampleAudio] = await Promise.all([
    tts('God', 'en-US', GCP_VOICE_EN),
    tts(newExample, 'ko-KR', GCP_VOICE_KO),
  ])
  console.log('TTS 생성 완료\n')

  for (const row of data) {
    console.log(`  [${row.mode}] id=${row.id}`)
    const ts = Date.now()

    const meaningEnUrl = await upload(`fix/${row.mode}/${row.id}_meaning_en_f_${ts}.mp3`, meaningEnAudio)
    const exampleUrl = await upload(`fix/${row.mode}/${row.id}_example_f_${ts}.mp3`, exampleAudio)

    const updates: Record<string, string> = {
      meaning_ko: '하나님',
      meaning_ko_pronunciation: 'hananim',
      meaning_sw: 'Mungu',
      meaning_en: 'God',
      meaning_en_audio_url: meaningEnUrl,
      example: newExample,
      example_pronunciation: newExamplePron,
      example_audio_url: exampleUrl,
      example_translation_sw: newExampleSw,
      example_translation_ko: '하나님은 너를 사랑하신다.',
      example_translation_en: newExampleEn,
    }

    const { error: updateErr } = await supabase
      .from('generated_vocab')
      .update(updates)
      .eq('id', row.id)

    if (updateErr) {
      console.error(`    업데이트 실패: ${updateErr.message}`)
    } else {
      console.log(`    meaning_ko → "하나님"`)
      console.log(`    meaning_sw → "Mungu"`)
      console.log(`    meaning_en → "God"`)
      console.log(`    example → "${newExample}"`)
      console.log(`    example_sw → "${newExampleSw}"`)
      console.log(`    example_en → "${newExampleEn}"`)
      console.log(`    음성 업데이트 완료\n`)
    }
  }

  console.log('완료.')
}

main()
