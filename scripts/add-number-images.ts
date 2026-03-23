/**
 * 숫자 1~50 단어에 DALL-E 3 이미지 추가
 * - image_url이 null인 숫자 단어에만 이미지 생성
 * - 숫자 개념을 시각적으로 표현하는 일러스트
 *
 * 사용법: npx tsx scripts/add-number-images.ts
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

async function generateImage(numLabel: string, meaning: string): Promise<Buffer | null> {
  try {
    const prompt = `A simple, clean, colorful illustration of the number ${numLabel} for a vocabulary flashcard. Show ${numLabel} objects (like ${numLabel} apples, ${numLabel} stars, or ${numLabel} fingers) arranged clearly so a learner can count them. The digit "${numLabel}" should NOT appear as text. Minimalist flat vector style, white background, no text or letters.`

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    })

    const url = response.data[0]?.url
    if (!url) return null

    const res = await fetch(url)
    return Buffer.from(await res.arrayBuffer())
  } catch (e: any) {
    console.error(`   ⚠️ 이미지 생성 실패: ${e.message}`)
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
  console.log('🖼️ 숫자 1~50 이미지 생성 시작 (DALL-E 3)')
  console.log('═'.repeat(60))

  const allIds = new Set<string>()
  const swIds = NUMBER_ORDER.sw || []
  const koIds = NUMBER_ORDER.ko || []
  for (const id of [...swIds, ...koIds]) {
    if (id) allIds.add(id)
  }

  console.log(`📊 총 ${allIds.size}개 고유 단어 ID`)

  // image_url이 null인 단어 찾기
  const idsArr = [...allIds]
  const needImage: Array<{ id: string; word: string; meaning_en: string; mode: string }> = []

  for (let i = 0; i < idsArr.length; i += 50) {
    const batch = idsArr.slice(i, i + 50)
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, word, meaning_en, mode, image_url')
      .in('id', batch)
    if (error) { console.error('DB 오류:', error.message); continue }
    for (const row of data || []) {
      if (!row.image_url) {
        needImage.push({ id: row.id, word: row.word, meaning_en: row.meaning_en, mode: row.mode })
      }
    }
  }

  console.log(`🖼️ 이미지 필요: ${needImage.length}개 (이미 있는 것 제외)`)

  if (needImage.length === 0) {
    console.log('✅ 모든 단어에 이미지가 있습니다!')
    return
  }

  // 숫자 라벨 매핑 (순서 기반)
  const swNumLabel = new Map<string, number>()
  const koNumLabel = new Map<string, number>()
  for (let i = 0; i < swIds.length; i++) swNumLabel.set(swIds[i], (i % 25) + 1)
  for (let i = 0; i < koIds.length; i++) koNumLabel.set(koIds[i], i + 1)

  let done = 0
  for (const item of needImage) {
    done++
    const numVal = item.mode === 'sw'
      ? (swNumLabel.get(item.id) ?? 0)
      : (koNumLabel.get(item.id) ?? 0)
    const numStr = numVal > 0 ? String(numVal) : item.meaning_en

    console.log(`\n[${done}/${needImage.length}] "${item.word}" (${numStr}) 이미지 생성...`)

    const buf = await generateImage(numStr, item.meaning_en)
    if (!buf) { console.log('   ⏩ 건너뜀'); continue }

    const ts = Date.now()
    const imgUrl = await uploadImage(buf, `numbers/img/${item.mode}_${ts}_${item.id.slice(0, 8)}.png`)
    if (!imgUrl) continue

    const { error } = await supabase
      .from('generated_vocab')
      .update({ image_url: imgUrl })
      .eq('id', item.id)
    if (error) {
      console.error(`   ❌ DB 업데이트 실패:`, error.message)
    } else {
      console.log(`   ✅ 이미지 저장 완료`)
    }

    // DALL-E rate limit 대기
    await new Promise((r) => setTimeout(r, 1500))
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅ 완료! ${done}개 처리`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
