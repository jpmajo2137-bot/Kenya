/**
 * 숫자 1~50 이미지 재생성 (숫자 DIGIT 자체를 보여주는 방식)
 * - 오브젝트 개수가 아닌, 숫자 자체를 크게 표시
 * - DALL-E 3의 개수 불일치 문제 완전 해결
 *
 * 사용법: npx tsx scripts/fix-number-images2.ts
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const { NUMBER_ORDER } = await import('../src/lib/numberOrder')

function getPrompt(num: number): string {
  return `A large, bold, playful 3D number "${num}" centered on a pure white background. The number is rendered in vibrant gradient colors (blue to purple). Cartoon style, slightly rounded and puffy like a balloon. Clean, simple, no other objects, no other text, no other numbers. Just the single number "${num}" as the only element.`
}

async function generateImage(num: number): Promise<Buffer | null> {
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: getPrompt(num),
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    })
    const url = response.data[0]?.url
    if (!url) return null
    const res = await fetch(url)
    return Buffer.from(await res.arrayBuffer())
  } catch (e: any) {
    console.error(`   ⚠️ 숫자 ${num} 실패: ${e.message}`)
    return null
  }
}

async function uploadImage(buf: Buffer, filename: string): Promise<string | null> {
  const { error } = await supabase.storage
    .from('vocabaudio')
    .upload(filename, buf, { contentType: 'image/png', upsert: true })
  if (error) { console.error(`   ❌ 업로드 실패:`, error.message); return null }
  const { data } = supabase.storage.from('vocabaudio').getPublicUrl(filename)
  return data?.publicUrl || null
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🖼️ 숫자 1~50 이미지 재생성 (숫자 DIGIT 방식)')
  console.log('═'.repeat(60))

  const swIds = NUMBER_ORDER.sw || []
  const koIds = NUMBER_ORDER.ko || []

  const imageCache = new Map<number, string>()

  for (let num = 1; num <= 50; num++) {
    console.log(`[${num}/50] 숫자 "${num}" 이미지 생성...`)
    const buf = await generateImage(num)
    if (!buf) { console.log('   ⏩ 건너뜀'); continue }

    const ts = Date.now()
    const imgUrl = await uploadImage(buf, `numbers/digit/${ts}_d${num}.png`)
    if (imgUrl) {
      imageCache.set(num, imgUrl)
      console.log('   ✅ 완료')
    }
    await new Promise((r) => setTimeout(r, 1200))
  }

  console.log(`\n📊 생성: ${imageCache.size}/50`)

  // DB 업데이트
  console.log('\n💾 DB 업데이트...')
  let updated = 0

  // SW: 1~25 한자어 → num 1~25, 26~50 고유어 → num 1~25
  for (let i = 0; i < swIds.length; i++) {
    const id = swIds[i]
    if (!id) continue
    const num = (i % 25) + 1
    const imgUrl = imageCache.get(num)
    if (!imgUrl) continue
    const { error } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
    if (!error) updated++
  }

  // KO: 1~50 → num 1~50
  for (let i = 0; i < koIds.length; i++) {
    const id = koIds[i]
    if (!id) continue
    const num = i + 1
    const imgUrl = imageCache.get(num)
    if (!imgUrl) continue
    const { error } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
    if (!error) updated++
  }

  console.log(`\n✅ ${updated}개 단어 이미지 업데이트 완료`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
