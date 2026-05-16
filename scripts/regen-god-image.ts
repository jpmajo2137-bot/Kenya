/**
 * Oxford "god" (하나님) 이미지 재생성 — 십자가가 있는 개신교 교회 모습.
 * oxford_vocab.word = 'god' 행의 image_url을 새 이미지로 교체.
 *
 * 사용법: npx tsx scripts/regen-god-image.ts
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const WORD = 'god'
const SLUG = 'god'
const PROMPT = `A simple, clean educational flashcard illustration depicting a Protestant Christian church building. The church has a prominent cross on top of the steeple/tower. Clear stained-glass windows and a welcoming front door. No people, no robed/glowing figures, no Catholic imagery, no statues. Daytime sky, calm warm atmosphere.
Style: minimalist flat vector illustration, soft warm pastel colors, light neutral background, vocabulary learning card style.
IMPORTANT: No text, no letters, no words, no numbers, no logos in the image.`

async function generateImage(): Promise<Buffer | null> {
  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: PROMPT,
      n: 1,
      size: '1024x1024',
    })
    const item = response.data?.[0]
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
  console.log(`Oxford "${WORD}" 이미지 재생성\n`)

  const { data: rows, error } = await supabase
    .from('oxford_vocab')
    .select('id, word, korean_meaning, image_url')
    .eq('word', WORD)

  if (error) {
    console.error('DB 조회 실패:', error.message)
    return
  }
  if (!rows?.length) {
    console.log(`oxford_vocab에 word="${WORD}" 행 없음`)
    return
  }

  console.log(`${rows.length}개 행 발견`)
  for (const r of rows) {
    console.log(`  id=${r.id}, ko=${r.korean_meaning}, img: ${r.image_url ?? '없음'}`)
  }

  console.log(`\n이미지 생성 중...`)
  const buf = await generateImage()
  if (!buf) {
    console.error('생성 실패')
    return
  }
  console.log(`생성 완료 (${(buf.length / 1024).toFixed(0)} KB)`)

  const ts = Date.now()
  const path = `${SLUG}_${ts}.png`
  const { error: upErr } = await supabase.storage
    .from('oxford-images')
    .upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upErr) {
    console.error('업로드 실패:', upErr.message)
    return
  }
  const { data: urlData } = supabase.storage.from('oxford-images').getPublicUrl(path)
  const imgUrl = urlData?.publicUrl
  console.log(`업로드 완료: ${imgUrl}\n`)

  for (const r of rows) {
    const { error: updateErr } = await supabase
      .from('oxford_vocab')
      .update({ image_url: imgUrl })
      .eq('id', r.id)
    if (updateErr) {
      console.error(`  id=${r.id} 업데이트 실패: ${updateErr.message}`)
    } else {
      console.log(`  id=${r.id} 업데이트 완료`)
    }
  }

  console.log('\n완료. oxford_vocab의 모든 "god" 행에 새 이미지 URL 반영됨.')
}

main().catch(console.error)
