/**
 * waliojeruhiwa (부상자들 / the injured) 단어 이미지 재생성 (gpt-image-1)
 * 모든 모드 행에 동일 URL 적용
 *
 * 사용법: npx tsx scripts/regen-waliojeruhiwa-image.ts
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const WORD = 'waliojeruhiwa'
const SLUG = 'waliojeruhiwa'
const PROMPT = `A simple, clean educational illustration for "the injured" / people who need medical help (Swahili vocabulary: injured people).
Show a calm scene: a simple ambulance or medical workers with a stretcher, or people sitting while receiving basic first aid — hopeful, non-graphic, no blood or wounds visible. Diverse adult silhouettes, symbolic and respectful.
Style: minimalist flat vector illustration, soft colors, white or very light background, vocabulary flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`

async function generateImage(): Promise<Buffer | null> {
  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: PROMPT,
      n: 1,
      size: '1024x1024',
    })
    const item = response.data[0]
    if (!item) return null
    if (item.url) {
      const res = await fetch(item.url)
      return Buffer.from(await res.arrayBuffer())
    }
    const b64 = (item as Record<string, unknown>).b64_json as string | undefined
    if (b64) return Buffer.from(b64, 'base64')
    return null
  } catch (e: unknown) {
    console.error('이미지 생성 실패:', e instanceof Error ? e.message : e)
    return null
  }
}

async function main() {
  console.log(`"${WORD}" 이미지 재생성\n`)

  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('id, word, mode, meaning_en, image_url')
    .ilike('word', WORD)

  if (error) {
    console.error('DB 조회 실패:', error.message)
    return
  }
  if (!rows?.length) {
    console.log(`DB에 "${WORD}" 없음 (철자·공백 확인)`)
    return
  }

  console.log(`${rows.length}개 행 발견`)
  for (const r of rows) {
    console.log(`  [${r.mode}] id=${r.id}, img: ${r.image_url ? '있음' : '없음'}`)
  }

  console.log(`\n이미지 생성 중...`)
  const buf = await generateImage()
  if (!buf) {
    console.error('생성 실패')
    return
  }
  console.log(`생성 완료 (${(buf.length / 1024).toFixed(0)} KB)`)

  const ts = Date.now()
  const path = `words/${SLUG}_${ts}.png`
  const { error: upErr } = await supabase.storage
    .from('vocabaudio')
    .upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upErr) {
    console.error('업로드 실패:', upErr.message)
    return
  }
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(path)
  const imgUrl = urlData?.publicUrl
  console.log(`업로드 완료: ${imgUrl}\n`)

  for (const r of rows) {
    const { error: updateErr } = await supabase
      .from('generated_vocab')
      .update({ image_url: imgUrl })
      .eq('id', r.id)
    if (updateErr) {
      console.error(`  [${r.mode}] 업데이트 실패: ${updateErr.message}`)
    } else {
      console.log(`  [${r.mode}] 업데이트 완료`)
    }
  }

  console.log('\n완료. 모든 단어장에 동일 이미지 적용됨.')
}

main().catch(console.error)
