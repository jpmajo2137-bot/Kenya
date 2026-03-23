/**
 * Nambari(숫자) 단어장 음성을 Chakula/Vinywaji와 동일한 Azure TTS로 재생성
 * - 자연스러운 여성 목소리 (ko-KR-SunHiNeural, sw-KE-ZuriNeural, en-US-JennyNeural)
 * - category='숫자' 또는 숫자1-50 관련 모든 레코드
 *
 * 사용: npx tsx scripts/fix-nambari-audio.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { EXAMPLE_DISPLAY_OVERRIDE } from '../src/lib/displayOverrides'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const AZURE_TTS_KEY = process.env.AZURE_SPEECH_KEY || process.env.VITE_AZURE_TTS_KEY!
const AZURE_TTS_REGION = process.env.AZURE_SPEECH_REGION || process.env.VITE_AZURE_TTS_REGION || 'koreacentral'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const VOICE_MAP: Record<string, string> = {
  ko: process.env.VITE_AZURE_TTS_KO_VOICE || 'ko-KR-SunHiNeural',
  sw: process.env.VITE_AZURE_TTS_SW_VOICE || 'sw-KE-ZuriNeural',
  en: process.env.VITE_AZURE_TTS_EN_VOICE || 'en-US-JennyNeural',
}
const DEFAULT_RATE = process.env.VITE_AZURE_TTS_SPEED || '0.9'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function langCodeFromVoice(voiceName: string): string {
  const parts = voiceName.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

async function azureTts(
  text: string,
  lang: string,
  voice?: string,
  speed?: string,
): Promise<ArrayBuffer> {
  const voiceName = voice || VOICE_MAP[lang] || VOICE_MAP.en
  const langCode = langCodeFromVoice(voiceName)
  const rate = speed || DEFAULT_RATE
  const content = escapeXml(text)

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langCode}'>
  <voice name='${voiceName}'>
    <prosody rate='${rate}'>
      ${content}
    </prosody>
  </voice>
</speak>`

  const endpoint = `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      'User-Agent': 'KenyaVocabApp',
    },
    body: ssml,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Azure TTS HTTP ${response.status}: ${errorText}`)
  }

  return response.arrayBuffer()
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('=== Nambari 음성 재생성 (Azure TTS - Chakula/Vinywaji 동일) ===')
  console.log(`Azure region: ${AZURE_TTS_REGION}`)
  console.log(`Voices: ko=${VOICE_MAP.ko}, sw=${VOICE_MAP.sw}, en=${VOICE_MAP.en}\n`)

  if (!AZURE_TTS_KEY) {
    console.error('AZURE_SPEECH_KEY 또는 VITE_AZURE_TTS_KEY 환경변수가 필요합니다.')
    process.exit(1)
  }

  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, meaning_sw, meaning_ko, meaning_en, example')
    .eq('category', '숫자')

  if (error) {
    console.error('DB 조회 실패:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('category=숫자 데이터가 없습니다.')
    return
  }

  console.log(`대상: ${rows.length}개\n`)

  let done = 0
  let failed = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    console.log(`[${i + 1}/${rows.length}] ${r.word} (${r.mode})`)

    try {
      const ts = Date.now()
      const base = `nambari-azure/${r.mode}/${r.id}_${ts}`

      const patches: Record<string, string> = {}

      // word: SW모드=한국어, KO모드=스와힐리어
      const wordLang = r.mode === 'sw' ? 'ko' : 'sw'
      const wordAudio = await azureTts(r.word, wordLang)
      patches.word_audio_url = await uploadAudio(`${base}_word.mp3`, wordAudio)
      await delay(80)

      // meaning_sw
      if (r.meaning_sw) {
        const a = await azureTts(r.meaning_sw, 'sw')
        patches.meaning_sw_audio_url = await uploadAudio(`${base}_meaning_sw.mp3`, a)
        await delay(80)
      }

      // meaning_ko
      if (r.meaning_ko) {
        const a = await azureTts(r.meaning_ko, 'ko')
        patches.meaning_ko_audio_url = await uploadAudio(`${base}_meaning_ko.mp3`, a)
        await delay(80)
      }

      // meaning_en
      if (r.meaning_en) {
        const a = await azureTts(r.meaning_en, 'en')
        patches.meaning_en_audio_url = await uploadAudio(`${base}_meaning_en.mp3`, a)
        await delay(80)
      }

      // example: display override 적용 (화면에 보이는 문장으로 TTS)
      if (r.example) {
        const exText = EXAMPLE_DISPLAY_OVERRIDE[r.example]?.text ?? r.example
        const exLang = r.mode === 'sw' ? 'ko' : 'sw'
        const exAudio = await azureTts(exText, exLang)
        patches.example_audio_url = await uploadAudio(`${base}_example.mp3`, exAudio)
        await delay(80)
      }

      const { error: upErr } = await supabase.from('generated_vocab').update(patches).eq('id', r.id)
      if (upErr) throw upErr

      console.log(`  ✅ 완료`)
      done++
    } catch (e) {
      console.error(`  ❌ 실패: ${e instanceof Error ? e.message : String(e)}`)
      failed++
    }
  }

  console.log(`\n=== 완료: 성공=${done}, 실패=${failed} ===`)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
