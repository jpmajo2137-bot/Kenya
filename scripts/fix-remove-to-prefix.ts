/**
 * 영어 뜻(meaning_en)에서 동사 앞 "to " 접두사 제거 + 여자 목소리 TTS 재생성
 * SW, KO 모드 모두 적용. 예문은 절대 수정하지 않음.
 *
 * 사용: npx tsx scripts/fix-remove-to-prefix.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import textToSpeech from '@google-cloud/text-to-speech'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const GCP_VOICE_EN_FEMALE = 'en-US-Wavenet-F'
const GCP_TTS_SPEED = 0.9

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ttsClient = new textToSpeech.TextToSpeechClient()

const DRY_RUN = process.argv.includes('--dry-run')

function stripToPrefix(meaningEn: string): string {
  return meaningEn
    .split(/[;,]/)
    .map((part) => {
      const trimmed = part.trim()
      if (/^to\s+/i.test(trimmed)) {
        return trimmed.replace(/^to\s+/i, '')
      }
      return trimmed
    })
    .join(meaningEn.includes(';') ? '; ' : ', ')
}

function shouldFix(meaningEn: string): boolean {
  if (!meaningEn) return false
  const parts = meaningEn.split(/[;,]/).map((s) => s.trim())
  return parts.some((p) => /^to\s+[a-z]/i.test(p))
}

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
  console.log(`영어 뜻 "to " 접두사 제거 스크립트 (${DRY_RUN ? 'DRY RUN' : 'LIVE'})\n`)

  const allRows: { id: string; mode: string; word: string; meaning_en: string }[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_en')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('DB 조회 실패:', error.message); return }
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(`전체 ${allRows.length}개 행 조회 완료`)

  const toFix = allRows.filter((r) => r.meaning_en && shouldFix(r.meaning_en))
  console.log(`"to " 접두사 대상: ${toFix.length}개\n`)

  if (toFix.length === 0) {
    console.log('수정할 항목 없음')
    return
  }

  if (DRY_RUN) {
    for (const r of toFix) {
      const newMeaning = stripToPrefix(r.meaning_en)
      console.log(`  [${r.mode}] "${r.word}": "${r.meaning_en}" → "${newMeaning}"`)
    }
    console.log(`\n총 ${toFix.length}개 (--dry-run 모드, 실제 변경 없음)`)
    return
  }

  let success = 0
  let fail = 0
  const ttsCache = new Map<string, ArrayBuffer>()

  for (let i = 0; i < toFix.length; i++) {
    const r = toFix[i]
    const newMeaning = stripToPrefix(r.meaning_en)
    console.log(`[${i + 1}/${toFix.length}] [${r.mode}] "${r.word}": "${r.meaning_en}" → "${newMeaning}"`)

    try {
      let audio = ttsCache.get(newMeaning)
      if (!audio) {
        audio = await ttsEn(newMeaning)
        ttsCache.set(newMeaning, audio)
      }

      const ts = Date.now()
      const path = `fix/${r.mode}/${r.id}_meaning_en_f_${ts}.mp3`
      const newUrl = await uploadAudio(path, audio)

      const { error: updateError } = await supabase
        .from('generated_vocab')
        .update({
          meaning_en: newMeaning,
          meaning_en_audio_url: newUrl,
        })
        .eq('id', r.id)

      if (updateError) {
        console.error(`  DB 업데이트 실패: ${updateError.message}`)
        fail++
      } else {
        console.log(`  → audio: ${newUrl}`)
        success++
      }
    } catch (e) {
      console.error(`  TTS/업로드 실패: ${e instanceof Error ? e.message : String(e)}`)
      fail++
    }

    if ((i + 1) % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  console.log(`\n완료. 성공: ${success}, 실패: ${fail}`)
}

main()
