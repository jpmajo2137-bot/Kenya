/**
 * 폭행하다(to assault) 단어 이미지 재생성 (gpt-image-1)
 * - 해당 word의 모든 모드(ko/sw) 행에 같은 image_url 참조 적용
 *
 * 사용법: npx tsx scripts/regen-pokhaeng-image.ts
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const WORD = '폭행하다'

async function generateImage(): Promise<Buffer | null> {
  try {
    const prompt = `A simple, clean educational illustration for the Korean vocabulary word "폭행하다" meaning "to assault / to attack physically".
Show a symbolic, non-graphic scene: a person being pushed or shoved by another person, or a fist breaking through a "no violence" sign — conveying the concept of physical aggression in a non-violent, educational way.
Style: minimalist flat vector illustration, muted colors, white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image. Keep it appropriate for educational use.`

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
  console.log(`🖼️ ${WORD} 이미지 재생성 (gpt-image-1)`)
  console.log('═'.repeat(60))

  // 1) DB에서 해당 단어 조회
  console.log('\n📋 DB 조회 중...')
  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('id, word, mode, meaning_en, image_url')
    .eq('word', WORD)

  if (error) {
    console.error('DB 조회 실패:', error.message)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log(`"${WORD}" 단어가 없습니다.`)
    process.exit(1)
  }

  console.log(`   대상: ${rows.length}개 행`)
  for (const r of rows) {
    console.log(`   - ${r.mode}: "${r.word}" | en: "${r.meaning_en}" | image: ${r.image_url ? '있음' : '없음'}`)
  }

  // 2) 이미지 생성
  console.log('\n🖼️ 이미지 생성 중...')
  const buf = await generateImage()
  if (!buf) {
    console.error('이미지 생성 실패')
    process.exit(1)
  }
  console.log(`   ✅ 생성 완료 (${(buf.length / 1024).toFixed(0)} KB)`)

  // 3) Storage 업로드
  const ts = Date.now()
  const storagePath = `words/pokhaenghada_${ts}.png`
  console.log(`\n📤 업로드: ${storagePath}`)
  const imgUrl = await uploadImage(buf, storagePath)
  if (!imgUrl) {
    console.error('업로드 실패')
    process.exit(1)
  }
  console.log(`   ✅ URL: ${imgUrl}`)

  // 4) 모든 행에 같은 URL 참조 적용 (복사 아닌 동일 URL)
  console.log('\n💾 DB 업데이트 (동일 URL 참조)...')
  let updated = 0
  for (const r of rows) {
    const { error: upErr } = await supabase
      .from('generated_vocab')
      .update({ image_url: imgUrl })
      .eq('id', r.id)
    if (upErr) {
      console.error(`   ❌ ${r.mode} "${r.word}" (${r.id}):`, upErr.message)
    } else {
      updated++
      console.log(`   ✅ ${r.mode} "${r.word}" → 업데이트 완료`)
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅ 완료! ${updated}/${rows.length}개 행 — 동일 이미지 URL 참조 적용`)
  console.log(`   ${imgUrl}`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
