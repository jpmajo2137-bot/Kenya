/**
 * GPT-5.2 Pro Responses API로 숫자 이미지 생성
 * image_generation 도구를 사용하여 숫자 DIGIT 이미지 생성
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

const NATIVE_NUM = [1,2,3,4,5,6,7,8,9,10,11,20,30,40,50]

async function genImage(num: number): Promise<string | null> {
  try {
    const response = await (openai as any).responses.create({
      model: 'gpt-5.2-pro',
      input: `Generate an image of the number "${num}" as a large, bold, playful 3D digit centered on a pure white background. Vibrant gradient colors from blue to purple. Cartoon balloon style, rounded and puffy. No other objects, no other text, no other numbers. Just the single number "${num}".`,
      tools: [{ type: 'image_generation', size: '1024x1024', quality: 'medium' }],
    })

    const imageOutput = response.output?.find(
      (o: any) => o.type === 'image_generation_call',
    )
    if (!imageOutput?.result) return null

    const buf = Buffer.from(imageOutput.result, 'base64')
    const ts = Date.now()
    const fn = `numbers/gpt52/${ts}_${num}.png`
    const { error } = await supabase.storage
      .from('vocabaudio')
      .upload(fn, buf, { contentType: 'image/png', upsert: true })
    if (error) {
      console.error(`   ❌ 업로드 실패:`, error.message)
      return null
    }
    const { data } = supabase.storage.from('vocabaudio').getPublicUrl(fn)
    return data?.publicUrl || null
  } catch (e: any) {
    console.error(`   ⚠️ 숫자 ${num} 실패: ${e.message}`)
    return null
  }
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🖼️ GPT-5.2 Pro로 숫자 이미지 생성')
  console.log('═'.repeat(60))

  const swIds = NUMBER_ORDER.sw || []
  const koIds = NUMBER_ORDER.ko || []

  const numForSwPos: number[] = []
  for (let i = 0; i < 35; i++) numForSwPos.push(i + 1)
  for (let i = 0; i < 15; i++) numForSwPos.push(NATIVE_NUM[i])

  const numForKoPos: number[] = []
  for (let i = 0; i < 50; i++) numForKoPos.push(i + 1)

  const allNums = new Set([...numForSwPos, ...numForKoPos])
  const uniqueNums = [...allNums].sort((a, b) => a - b)
  console.log(`\n고유 숫자 ${uniqueNums.length}개 이미지 생성`)

  const imgCache = new Map<number, string>()

  for (const num of uniqueNums) {
    console.log(`[${num}] GPT-5.2 Pro 이미지 생성...`)
    const url = await genImage(num)
    if (url) {
      imgCache.set(num, url)
      console.log(`   ✅`)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  console.log(`\n📊 생성: ${imgCache.size}/${uniqueNums.length}`)

  // SW DB 업데이트
  console.log('\n💾 SW 모드 이미지 업데이트...')
  let swUpdated = 0
  for (let i = 0; i < swIds.length; i++) {
    const id = swIds[i]
    if (!id) continue
    const num = numForSwPos[i]
    const imgUrl = imgCache.get(num)
    if (!imgUrl) continue
    const { error } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
    if (!error) swUpdated++
  }

  // KO DB 업데이트
  console.log('💾 KO 모드 이미지 업데이트...')
  let koUpdated = 0
  for (let i = 0; i < koIds.length; i++) {
    const id = koIds[i]
    if (!id) continue
    const num = numForKoPos[i]
    const imgUrl = imgCache.get(num)
    if (!imgUrl) continue
    const { error } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
    if (!error) koUpdated++
  }

  console.log(`\n✅ SW ${swUpdated}/50, KO ${koUpdated}/50 이미지 업데이트 완료`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
