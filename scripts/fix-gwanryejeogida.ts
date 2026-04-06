/**
 * 관례적이다: 표시 단어·뜻(SW/EN)·발음·단어/뜻 음성 일괄 교정
 *
 * 사용: npx tsx scripts/fix-gwanryejeogida.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const WORD = '임상적인'
const WORD_TTS_TEXT = '' // 단어 음성은 갱신 안 함
const WORD_PRON_DB = '' // 발음 표기 갱신 안 함
const MEANING_SW = 'ya kliniki'
const MEANING_EN = 'clinical'

const VOICE_KO = process.env.GCP_TTS_KO_VOICE || 'ko-KR-Wavenet-B'
const VOICE_EN = 'en-US-Wavenet-F'
const SPEED_KO = 0.85
const SPEED_SW = 0.9
const SPEED_EN = 0.9

const SW_VOICE_CANDIDATES = [
  process.env.GCP_TTS_SW_VOICE,
  'sw-KE-Standard-A',
  'sw-KE-Wavenet-A',
  'sw-TZ-Standard-A',
].filter((v): v is string => Boolean(v))

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

function gcpLangCode(name: string) {
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

async function synth(text: string, voiceName: string, rate: number): Promise<ArrayBuffer> {
  const lang = gcpLangCode(voiceName)
  const payload = {
    input: { text },
    voice: { languageCode: lang, name: voiceName },
    audioConfig: { audioEncoding: 'MP3' as const, speakingRate: rate },
  }
  const [response] = await ttsClient.synthesizeSpeech(payload)
  if (!response.audioContent) throw new Error('No audioContent')
  return response.audioContent as ArrayBuffer
}

async function synthSw(text: string): Promise<ArrayBuffer> {
  for (const voiceName of SW_VOICE_CANDIDATES) {
    try {
      return await synth(text, voiceName, SPEED_SW)
    } catch {
      /* try next */
    }
  }
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode: 'sw-KE' },
    audioConfig: { audioEncoding: 'MP3' as const, speakingRate: SPEED_SW },
  })
  if (!response.audioContent) throw new Error('No Swahili audioContent')
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
  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word')
    .eq('word', WORD)

  if (error) {
    console.error('조회 실패:', error.message)
    return
  }
  if (!rows?.length) {
    console.log(`DB에 "${WORD}" 없음`)
    return
  }

  console.log(`${rows.length}개 행 — TTS 생성 중...\n`)

  const wordBuf = WORD_TTS_TEXT ? await synth(WORD_TTS_TEXT, VOICE_KO, SPEED_KO) : null
  const swBuf = await synthSw(MEANING_SW)
  const enBuf = await synth(MEANING_EN, VOICE_EN, SPEED_EN)

  for (const row of rows) {
    const ts = Date.now()
    const base = `fix/${row.mode}/${row.id}`
    const swUrl = await upload(`${base}_meaning_sw_${ts}.mp3`, swBuf)
    const enUrl = await upload(`${base}_meaning_en_${ts}.mp3`, enBuf)

    const patch: Record<string, string> = {
      meaning_sw: MEANING_SW,
      meaning_en: MEANING_EN,
      meaning_sw_audio_url: swUrl,
      meaning_en_audio_url: enUrl,
    }
    if (WORD_PRON_DB) patch.word_pronunciation = WORD_PRON_DB
    if (wordBuf) {
      const wordUrl = await upload(`${base}_word_${ts}.mp3`, wordBuf)
      patch.word_audio_url = wordUrl
    }

    const { error: upErr } = await supabase
      .from('generated_vocab')
      .update(patch)
      .eq('id', row.id)

    if (upErr) console.error(`  [${row.mode}] 실패:`, upErr.message)
    else console.log(`  [${row.mode}] id=${row.id} 완료`)
  }

  console.log('\n완료.')
}

main().catch((e) => console.error(e))
