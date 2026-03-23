/**
 * 숫자 1~50 이미지 재생성 (숫자 뜻에 정확히 맞는 이미지)
 * - "일" → 사과 1개 (일하다X, 숫자 1)
 * - "이" → 사과 2개 (이것X, 숫자 2)
 * 모든 숫자 단어의 이미지를 교체
 *
 * 사용법: npx tsx scripts/fix-number-images.ts
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

const OBJECTS = [
  'red apple','red apple','red apple','red apple','red apple',
  'orange','orange','orange','orange','orange',
  'yellow star','yellow star','yellow star','yellow star','yellow star',
  'blue ball','blue ball','blue ball','blue ball','blue ball',
  'green leaf','green leaf','green leaf','green leaf','green leaf',
  'red heart','red heart','red heart','red heart','red heart',
  'purple grape','purple grape','purple grape','purple grape','purple grape',
  'pink flower','pink flower','pink flower','pink flower','pink flower',
  'blue butterfly','blue butterfly','blue butterfly','blue butterfly','blue butterfly',
  'gold coin','gold coin','gold coin','gold coin','gold coin',
]

function getPrompt(num: number): string {
  const obj = OBJECTS[num - 1] || 'red apple'
  if (num <= 5) {
    return `Exactly ${num} ${obj}${num > 1 ? 's' : ''} arranged neatly on a pure white background. Simple flat vector illustration style. Each ${obj} must be clearly visible and countable. No text, no numbers, no digits, no letters anywhere in the image.`
  }
  if (num <= 10) {
    return `Exactly ${num} ${obj}s arranged in a neat row on a pure white background. Simple flat vector illustration, each item clearly separated and countable. No text, no numbers, no digits, no letters.`
  }
  if (num <= 20) {
    return `Exactly ${num} ${obj}s arranged in neat rows (like a grid) on a pure white background. Simple flat vector illustration, clearly countable items. No text, no numbers, no digits, no letters.`
  }
  return `A clean illustration showing the number ${num} represented by ${num} small ${obj}s arranged in neat rows on a white background. Flat vector style, each item small but visible. No text, no numbers, no digits, no letters.`
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
    console.error(`   ⚠️ 이미지 생성 실패 (${num}): ${e.message}`)
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
  console.log('🖼️ 숫자 1~50 이미지 전체 재생성 (숫자 뜻 정확 매칭)')
  console.log('═'.repeat(60))

  const swIds = NUMBER_ORDER.sw || []
  const koIds = NUMBER_ORDER.ko || []

  // SW: 1~25 한자어(일~이십오) → 숫자 1~25
  // SW: 26~50 고유어(하나~스물다섯) → 숫자 1~25
  // KO: 1~50 스와힐리어(moja~hamsini) → 숫자 1~50

  // 숫자별로 공유 이미지 생성 (1~50 각 1장씩)
  // 같은 숫자를 가리키는 단어들은 동일 이미지 공유
  const imageCache = new Map<number, string>()

  // SW 1~25 → num 1~25, SW 26~50 → num 1~25, KO 1~50 → num 1~50
  // 필요한 숫자: 1~50
  const neededNums = new Set<number>()
  for (let i = 1; i <= 50; i++) neededNums.add(i)

  console.log(`\n🎨 숫자 1~50 이미지 생성 중...\n`)

  for (const num of [...neededNums].sort((a, b) => a - b)) {
    console.log(`[${num}/50] 숫자 ${num} 이미지 생성...`)
    const buf = await generateImage(num)
    if (!buf) { console.log('   ⏩ 건너뜀'); continue }

    const ts = Date.now()
    const imgUrl = await uploadImage(buf, `numbers/numimg/${ts}_num${num}.png`)
    if (imgUrl) {
      imageCache.set(num, imgUrl)
      console.log('   ✅ 완료')
    }
    await new Promise((r) => setTimeout(r, 1200))
  }

  console.log(`\n📊 생성된 이미지: ${imageCache.size}/50`)

  // DB 업데이트
  console.log('\n💾 DB 업데이트 중...')
  let updated = 0

  // SW 모드: 1~25 한자어(num 1~25), 26~50 고유어(num 1~25)
  for (let i = 0; i < swIds.length; i++) {
    const id = swIds[i]
    if (!id) continue
    const num = (i % 25) + 1
    const imgUrl = imageCache.get(num)
    if (!imgUrl) continue

    const { error } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
    if (!error) updated++
    else console.error(`   ❌ SW[${i}] 업데이트 실패:`, error.message)
  }

  // KO 모드: 1~50 (num 1~50)
  for (let i = 0; i < koIds.length; i++) {
    const id = koIds[i]
    if (!id) continue
    const num = i + 1
    const imgUrl = imageCache.get(num)
    if (!imgUrl) continue

    const { error } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
    if (!error) updated++
    else console.error(`   ❌ KO[${i}] 업데이트 실패:`, error.message)
  }

  console.log(`\n✅ ${updated}개 단어 이미지 업데이트 완료`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
