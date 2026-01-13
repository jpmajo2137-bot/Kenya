/**
 * DB에 이미 들어있는 단어들의 음성 파일을 "현재 TTS 설정"으로 다시 생성/업데이트
 *
 * 실행:
 *   npx tsx scripts/regenerate-audio.ts
 *
 * 주의:
 * - generated_vocab UPDATE 권한이 필요합니다(RLS 정책에 따라 실패할 수 있음).
 * - vocabaudio 버킷 업로드 권한 필요.
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const GCP_VOICE_KO = process.env.GCP_TTS_KO_VOICE || 'ko-KR-Wavenet-D'
const GCP_VOICE_SW = process.env.GCP_TTS_SW_VOICE || 'sw-TZ-Standard-A' // sw-KE 일부 지역에서 미지원 → sw-TZ 기본
const GCP_VOICE_EN = process.env.GCP_TTS_EN_VOICE || 'en-US-Wavenet-D'
const GCP_TTS_SPEED = Number(process.env.GCP_TTS_SPEED ?? '1') || 1
const GCP_TTS_SPEED_EXAMPLE_KO = Number(process.env.GCP_TTS_SPEED_EXAMPLE_KO ?? '0.85') || 0.85
const GCP_TTS_SPEED_EXAMPLE_SW = Number(process.env.GCP_TTS_SPEED_EXAMPLE_SW ?? '0.9') || 0.9
const GCP_TTS_SPEED_EXAMPLE_EN = Number(process.env.GCP_TTS_SPEED_EXAMPLE_EN ?? '0.9') || 0.9

type Mode = 'sw' | 'ko'
type TTLLang = 'sw' | 'ko' | 'en'

type CloudRow = {
  id: string
  mode: Mode
  word: string
  meaning_sw: string | null
  meaning_ko: string | null
  meaning_en: string | null
  example: string | null
}

// Google TTS 설정
const GCP_VOICE_MAP: Record<TTLLang, string> = {
  ko: GCP_VOICE_KO,
  sw: GCP_VOICE_SW,
  en: GCP_VOICE_EN,
}

const ttsClient = new textToSpeech.TextToSpeechClient()

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing env vars. Check .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
  }
}

function gcpLangCode(name: string) {
  // ko-KR-Wavenet-D -> ko-KR
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

async function tts(text: string, lang: TTLLang, rate: number): Promise<ArrayBuffer> {
  const voiceName = GCP_VOICE_MAP[lang]
  const payload = {
    input: { text },
    voice: {
      languageCode: gcpLangCode(voiceName),
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: rate,
    },
  } as const

  try {
    const [response] = await ttsClient.synthesizeSpeech(payload)
    if (!response.audioContent) throw new Error('No audioContent from Google TTS')
    return response.audioContent as ArrayBuffer
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // voice name 미지원 시, name을 제거하고 언어 코드만으로 재시도
    if (msg.includes('does not exist')) {
      const fallbackPayload = {
        ...payload,
        voice: { languageCode: payload.voice.languageCode },
      }
      const [response] = await ttsClient.synthesizeSpeech(fallbackPayload)
      if (!response.audioContent) throw new Error('No audioContent from Google TTS (fallback)')
      return response.audioContent as ArrayBuffer
    }
    throw e
  }
}

async function uploadAudio(
  supabase: ReturnType<typeof createClient>,
  path: string,
  audio: ArrayBuffer,
): Promise<string> {
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
  assertEnv()
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!)

  // 최신부터 일부만 재생성: 너무 큰 비용 방지(필요하면 늘릴 수 있음)
  const LIMIT_PER_MODE = 50

  for (const mode of ['sw', 'ko'] as const) {
    console.log(`\n=== ${mode.toUpperCase()} 모드 음성 재생성 (최신 ${LIMIT_PER_MODE}개) ===`)
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id,mode,word,meaning_sw,meaning_ko,meaning_en,example')
      .eq('mode', mode)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_MODE)

    if (error) throw error
    const rows = (data ?? []) as CloudRow[]
    console.log(`- 대상: ${rows.length}개`)

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      console.log(`  [${i + 1}/${rows.length}] ${r.word} (${r.id})`)

      const wordLang: TTLLang = mode === 'sw' ? 'ko' : 'sw'
      const exampleLang: TTLLang = mode === 'sw' ? 'ko' : 'sw'

      const base = `regen/${mode}/${r.id}`

      const patches: Record<string, string> = {}

      // word
      const wordAudio = await tts(r.word, wordLang, GCP_TTS_SPEED)
      patches.word_audio_url = await uploadAudio(supabase, `${base}_word.mp3`, wordAudio)

      // meanings (언어별 정확 매칭)
      if (r.meaning_sw) {
        const a = await tts(r.meaning_sw, 'sw', GCP_TTS_SPEED)
        patches.meaning_sw_audio_url = await uploadAudio(supabase, `${base}_meaning_sw.mp3`, a)
      }
      if (r.meaning_ko) {
        const a = await tts(r.meaning_ko, 'ko', GCP_TTS_SPEED)
        patches.meaning_ko_audio_url = await uploadAudio(supabase, `${base}_meaning_ko.mp3`, a)
      }
      if (r.meaning_en) {
        const a = await tts(r.meaning_en, 'en', GCP_TTS_SPEED)
        patches.meaning_en_audio_url = await uploadAudio(supabase, `${base}_meaning_en.mp3`, a)
      }

      // example
      if (r.example) {
      const exRate =
        exampleLang === 'ko' ? GCP_TTS_SPEED_EXAMPLE_KO : exampleLang === 'sw' ? GCP_TTS_SPEED_EXAMPLE_SW : GCP_TTS_SPEED_EXAMPLE_EN
      const a = await tts(r.example, exampleLang, exRate)
        patches.example_audio_url = await uploadAudio(supabase, `${base}_example.mp3`, a)
      }

      // DB update
      const { error: upErr } = await supabase.from('generated_vocab').update(patches).eq('id', r.id)
      if (upErr) {
        throw upErr
      }
    }
  }

  console.log('\n✅ 음성 재생성/업데이트 완료')
}

main().catch((e) => {
  console.error('❌ regenerate-audio 실패:', e)
  process.exit(1)
})


