/**
 * 임기(tenure) 단어 이미지 생성 및 DB 업데이트
 * - KO/SW 모드 모두 업데이트 → 모든 단어장에서 동일 이미지 표시
 *
 * 사용법: npx tsx scripts/add-imgi-image.ts
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

async function generateImage(): Promise<Buffer | null> {
  try {
    const prompt = `A simple, clean illustration representing "tenure" (임기 / muda wa kuhudumu) - the period of time someone holds a position or office. 
Show a visual metaphor: e.g. a person at a desk with a calendar, or a symbolic representation of a term in office. 
Educational vocabulary flashcard style, minimalist flat vector, bright colors, white background. No text or letters in the image.`

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
  } catch (e: unknown) {
    console.error('   ⚠️ 이미지 생성 실패:', e instanceof Error ? e.message : e)
    return null
  }
}

async function uploadImage(buf: Buffer, filename: string): Promise<string | null> {
  const { error } = await supabase.storage
    .from('vocabaudio')
    .upload(filename, buf, { contentType: 'image/png', upsert: true })
  if (error) {
    console.error('   ❌ 업로드 실패:', error.message)
    return null
  }
  const { data } = supabase.storage.from('vocabaudio').getPublicUrl(filename)
  return data?.publicUrl || null
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🖼️ 임기(tenure) 단어 이미지 생성')
  console.log('═'.repeat(60))

  // KO: 임기, SW: muda wa kuhudumu
  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('id, word, mode, meaning_ko, meaning_sw, meaning_en, image_url')
    .or('word.eq.임기,word.eq.muda wa kuhudumu')

  if (error) {
    console.error('DB 조회 실패:', error.message)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log('임기/muda wa kuhudumu 단어를 찾을 수 없습니다.')
    process.exit(1)
  }

  console.log(`\n📋 대상: ${rows.length}개 행`)
  for (const r of rows) {
    console.log(`   - ${r.mode}: "${r.word}" (${r.image_url ? '이미지 있음' : '이미지 없음'})`)
  }

  console.log('\n🖼️ 이미지 생성 중...')
  const buf = await generateImage()
  if (!buf) {
    console.error('이미지 생성 실패')
    process.exit(1)
  }

  const ts = Date.now()
  const storagePath = `words/imgi_${ts}.png`
  const imgUrl = await uploadImage(buf, storagePath)
  if (!imgUrl) {
    console.error('업로드 실패')
    process.exit(1)
  }
  console.log(`   ✅ 업로드 완료: ${imgUrl}`)

  console.log('\n💾 DB 업데이트 중...')
  let updated = 0
  for (const r of rows) {
    const { error: upErr } = await supabase
      .from('generated_vocab')
      .update({ image_url: imgUrl })
      .eq('id', r.id)
    if (upErr) {
      console.error(`   ❌ ${r.word} (${r.id}):`, upErr.message)
    } else {
      updated++
      console.log(`   ✅ ${r.mode} "${r.word}" 업데이트 완료`)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅ 완료! ${updated}/${rows.length}개 행에 이미지 적용`)
  console.log('   → Wakati/Tarehe 및 해당 단어가 포함된 모든 단어장에서 표시됩니다.')
  console.log('═'.repeat(60))
}

main().catch(console.error)
