/**
 * SW 숫자 1~50 이미지 강제 업데이트
 * 기존 이미지가 있어도 숫자 DIGIT 이미지로 교체
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

// SW 36~50 고유어가 나타내는 실제 숫자
const NATIVE_NUM = [1,2,3,4,5,6,7,8,9,10,11,20,30,40,50]

async function genDigitImg(num: number): Promise<string | null> {
  try {
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: `A large, bold, playful 3D number "${num}" centered on a pure white background. Vibrant gradient colors (blue to purple). Cartoon balloon style, rounded and puffy. Clean, simple. No other objects, no other text, no other numbers. Just the single number "${num}".`,
      n: 1, size: '1024x1024', quality: 'standard',
    })
    const url = res.data[0]?.url
    if (!url) return null
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const ts = Date.now()
    const fn = `numbers/final/${ts}_${num}.png`
    const { error } = await supabase.storage.from('vocabaudio').upload(fn, buf, { contentType: 'image/png', upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('vocabaudio').getPublicUrl(fn)
    return data?.publicUrl || null
  } catch (e: any) {
    console.error(`   ⚠️ 숫자 ${num} 실패: ${e.message}`)
    return null
  }
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🖼️ SW 숫자 이미지 강제 업데이트')
  console.log('═'.repeat(60))

  const swIds = NUMBER_ORDER.sw || []

  // 필요한 고유 숫자 목록
  const numForPos: number[] = []
  for (let i = 0; i < 35; i++) numForPos.push(i + 1)          // 1~35
  for (let i = 0; i < 15; i++) numForPos.push(NATIVE_NUM[i])  // 고유어 실제 숫자

  const uniqueNums = [...new Set(numForPos)].sort((a, b) => a - b)
  console.log(`\n고유 숫자 ${uniqueNums.length}개 이미지 생성 필요`)

  const imgCache = new Map<number, string>()

  for (const num of uniqueNums) {
    console.log(`[${num}] 이미지 생성...`)
    const url = await genDigitImg(num)
    if (url) {
      imgCache.set(num, url)
      console.log(`   ✅`)
    }
    await new Promise((r) => setTimeout(r, 1200))
  }

  console.log(`\n📊 생성: ${imgCache.size}/${uniqueNums.length}`)

  // DB 강제 업데이트 (기존 이미지 있어도 교체)
  console.log('\n💾 DB 업데이트...')
  let updated = 0
  for (let i = 0; i < swIds.length; i++) {
    const id = swIds[i]
    if (!id) continue
    const num = numForPos[i]
    const imgUrl = imgCache.get(num)
    if (!imgUrl) continue

    const { error } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
    if (!error) {
      updated++
    } else {
      console.error(`   ❌ [${i+1}] 실패:`, error.message)
    }
  }

  console.log(`\n✅ SW ${updated}/50 이미지 업데이트 완료`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
