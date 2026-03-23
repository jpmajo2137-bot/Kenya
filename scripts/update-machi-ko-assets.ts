/**
 * KO 모드 Machi (3월) — DALL-E 3 이미지 + Azure TTS 음성 생성
 * - DALL-E 3로 3월 이미지 생성 → Supabase Storage 업로드
 * - Azure TTS로 5종 음성 생성 (word, meaning_sw, meaning_ko, meaning_en, example) → Storage 업로드
 * - generated_vocab 레코드 업데이트
 *
 * 사용: npx tsx scripts/update-machi-ko-assets.ts
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const MACHI_ID = '924e53f4-35e0-46a2-a894-a7d6eb3f2fda'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const AZURE_TTS_KEY = process.env.AZURE_SPEECH_KEY || process.env.VITE_AZURE_TTS_KEY!
const AZURE_TTS_REGION = process.env.AZURE_SPEECH_REGION || process.env.VITE_AZURE_TTS_REGION || 'koreacentral'

const VOICE_MAP: Record<string, string> = {
  ko: process.env.VITE_AZURE_TTS_KO_VOICE || 'ko-KR-SunHiNeural',
  sw: process.env.VITE_AZURE_TTS_SW_VOICE || 'sw-KE-ZuriNeural',
  en: process.env.VITE_AZURE_TTS_EN_VOICE || 'en-US-JennyNeural',
}
const DEFAULT_RATE = process.env.VITE_AZURE_TTS_SPEED || '0.9'

// ─── Azure TTS ───
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function azureTts(text: string, lang: string): Promise<ArrayBuffer> {
  const voiceName = VOICE_MAP[lang] || VOICE_MAP.en
  const langCode = voiceName.split('-').slice(0, 2).join('-')

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langCode}'>
  <voice name='${voiceName}'>
    <prosody rate='${DEFAULT_RATE}'>
      ${escapeXml(text)}
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

// ─── Supabase upload ───
async function uploadFile(
  storagePath: string,
  data: ArrayBuffer | Buffer,
  contentType: string,
): Promise<string> {
  const blob = new Blob([data], { type: contentType })
  const { data: uploaded, error } = await supabase.storage
    .from('vocabaudio')
    .upload(storagePath, blob, { contentType, upsert: true })
  if (error) throw new Error(`Upload failed (${storagePath}): ${error.message}`)
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(uploaded.path)
  return urlData.publicUrl
}

// ─── DALL-E 3 이미지 ───
async function generateMarchImage(): Promise<Buffer> {
  const prompt = `A beautiful, warm illustration representing the month of March in East Africa (Kenya). 
Show a vibrant scene with: blooming flowers, green landscapes, maybe light spring rain, 
a calendar page showing "Machi" (Swahili for March). 
Minimalist flat vector style, bright cheerful colors, suitable for a vocabulary flashcard. 
No text other than "Machi" on the calendar. White background border.`

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
  })

  const url = response.data[0]?.url
  if (!url) throw new Error('DALL-E 3 returned no image URL')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('🔧 KO Machi — 이미지 + Azure TTS 음성 생성')
  console.log('═══════════════════════════════════════════════════')
  console.log(`   ID: ${MACHI_ID}`)
  console.log(`   Azure region: ${AZURE_TTS_REGION}\n`)

  if (!AZURE_TTS_KEY) {
    console.error('❌ VITE_AZURE_TTS_KEY 환경변수가 없습니다.')
    process.exit(1)
  }

  // 0) 기존 레코드 확인
  const { data: existing, error: fetchErr } = await supabase
    .from('generated_vocab')
    .select('*')
    .eq('id', MACHI_ID)
    .single()

  if (fetchErr || !existing) {
    console.error('❌ Machi 레코드를 찾을 수 없습니다:', fetchErr?.message)
    process.exit(1)
  }
  console.log(`✅ 기존 레코드 확인: word="${existing.word}", mode="${existing.mode}"\n`)

  const ts = Date.now()
  const updates: Record<string, string> = {}

  // ─── 1) DALL-E 3 이미지 생성 ───
  console.log('🖼️  DALL-E 3 이미지 생성 중...')
  try {
    const imgBuf = await generateMarchImage()
    console.log(`   이미지 생성 완료 (${(imgBuf.length / 1024).toFixed(0)} KB)`)
    const imgUrl = await uploadFile(`ko/machi_img_${ts}.png`, imgBuf, 'image/png')
    updates.image_url = imgUrl
    console.log(`   ✅ 이미지 업로드: ${imgUrl.slice(-50)}`)
  } catch (e) {
    console.error(`   ❌ 이미지 생성 실패: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ─── 2) Azure TTS 음성 생성 ───
  console.log('\n🔊 Azure TTS 음성 생성 중...')

  const audioTasks: Array<{
    label: string
    text: string
    lang: string
    storageName: string
    dbField: string
  }> = [
    { label: 'word (Machi)', text: 'Machi', lang: 'sw', storageName: `ko/machi_az_word_${ts}.mp3`, dbField: 'word_audio_url' },
    { label: 'meaning_sw (Machi)', text: 'Machi', lang: 'sw', storageName: `ko/machi_az_msw_${ts}.mp3`, dbField: 'meaning_sw_audio_url' },
    { label: 'meaning_ko (3월)', text: '3월', lang: 'ko', storageName: `ko/machi_az_mko_${ts}.mp3`, dbField: 'meaning_ko_audio_url' },
    { label: 'meaning_en (March)', text: 'March', lang: 'en', storageName: `ko/machi_az_men_${ts}.mp3`, dbField: 'meaning_en_audio_url' },
    { label: 'example (예문)', text: 'Mwezi wa Machi una siku thelathini na moja.', lang: 'sw', storageName: `ko/machi_az_ex_${ts}.mp3`, dbField: 'example_audio_url' },
  ]

  for (const task of audioTasks) {
    try {
      console.log(`   🎤 ${task.label}...`)
      const audio = await azureTts(task.text, task.lang)
      const url = await uploadFile(task.storageName, audio, 'audio/mpeg')
      updates[task.dbField] = url
      console.log(`      ✅ 업로드 완료 (${(audio.byteLength / 1024).toFixed(1)} KB)`)
    } catch (e) {
      console.error(`      ❌ 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ─── 3) DB 레코드 업데이트 ───
  if (Object.keys(updates).length === 0) {
    console.log('\n⚠️ 업데이트할 항목이 없습니다.')
    return
  }

  console.log(`\n💾 DB 업데이트 중... (${Object.keys(updates).length}개 필드)`)
  const { error: updateErr } = await supabase
    .from('generated_vocab')
    .update(updates)
    .eq('id', MACHI_ID)

  if (updateErr) {
    console.error('❌ DB 업데이트 실패:', updateErr.message)
    throw updateErr
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log('🎉 완료! 업데이트된 필드:')
  for (const [field, url] of Object.entries(updates)) {
    console.log(`   ${field}: ...${url.slice(-55)}`)
  }
  console.log('═══════════════════════════════════════════════════')
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
