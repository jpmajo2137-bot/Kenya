/**
 * 찌르다(to stab/prick) 단어 이미지 재생성 (gpt-image-1)
 * - KO/SW 모드 모두 업데이트
 *
 * 사용법: npx tsx scripts/regen-jjireuda-image.ts
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
    const prompt = `A simple, clean educational illustration for the Korean vocabulary word "찌르다" meaning "to stab / to prick / to poke".
Show a person carefully pricking their finger on a rose thorn, or a small cactus needle pricking a hand — depicting the concept of being pricked or poked in a safe, non-violent way.
Style: minimalist flat vector illustration, bright cheerful colors, white/light background, educational flashcard style. 
IMPORTANT: No text, no letters, no words, no numbers in the image.`

    console.log('   모델: gpt-image-1')
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    })

    const item = response.data[0]
    if (!item) return null

    if (item.url) {
      console.log('   → URL 응답')
      const res = await fetch(item.url)
      return Buffer.from(await res.arrayBuffer())
    }

    const b64 = (item as Record<string, unknown>).b64_json as string | undefined
    if (b64) {
      console.log('   → base64 응답')
      return Buffer.from(b64, 'base64')
    }

    return null
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
  console.log('🖼️ 찌르다(to stab/prick) 이미지 재생성 (gpt-image-1)')
  console.log('═'.repeat(60))

  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('id, word, mode, meaning_ko, meaning_sw, meaning_en, image_url')
    .or('word.eq.찌르다,word.eq.kuchoma/kudunga')

  if (error) {
    console.error('DB 조회 실패:', error.message)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log('찌르다 단어를 찾을 수 없습니다. word.ilike 으로 재시도...')
    const { data: rows2, error: err2 } = await supabase
      .from('generated_vocab')
      .select('id, word, mode, meaning_ko, meaning_sw, meaning_en, image_url')
      .ilike('word', '%찌르다%')
    if (err2 || !rows2?.length) {
      console.error('단어를 찾을 수 없습니다.')
      process.exit(1)
    }
    rows.push(...rows2)
  }

  console.log(`\n📋 대상: ${rows.length}개 행`)
  for (const r of rows) {
    console.log(`   - ${r.mode}: "${r.word}" | en: "${r.meaning_en}" | image: ${r.image_url ? '있음' : '없음'}`)
  }

  console.log('\n🖼️ 이미지 생성 중 (gpt-image-1)...')
  const buf = await generateImage()
  if (!buf) {
    console.error('이미지 생성 실패')
    process.exit(1)
  }
  console.log(`   ✅ 이미지 생성 완료 (${(buf.length / 1024).toFixed(0)} KB)`)

  const ts = Date.now()
  const storagePath = `words/jjireuda_${ts}.png`
  console.log(`\n📤 Supabase Storage 업로드: ${storagePath}`)
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
      console.log(`   ✅ ${r.mode} "${r.word}" → image_url 업데이트 완료`)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅ 완료! ${updated}/${rows.length}개 행에 새 이미지 적용`)
  console.log(`   URL: ${imgUrl}`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
