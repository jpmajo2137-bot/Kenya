/**
 * 여러 단어 이미지 일괄 재생성 (gpt-image-1)
 * - 각 단어의 모든 모드(ko/sw) 행에 동일 URL 참조 적용
 *
 * 사용법: npx tsx scripts/regen-batch-images.ts
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

interface WordSpec {
  word: string
  prompt: string
  slug: string
}

const WORDS: WordSpec[] = [
  {
    word: '버팀목',
    slug: 'bateummok',
    prompt: `A simple, clean educational illustration for the Korean word "버팀목" meaning "a pillar of support / mainstay / prop".
Show a strong tree supporting a leaning smaller tree, or a sturdy wooden beam propping up a wall — conveying the concept of something that provides crucial support.
Style: minimalist flat vector illustration, warm bright colors, white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`,
  },
  {
    word: '총기',
    slug: 'chonggi',
    prompt: `A simple, clean educational illustration for the Korean word "총기" meaning "firearm / gun".
Show a simple side-view silhouette of a handgun or rifle in a neutral, factual style — like in an encyclopedia diagram. Keep it non-violent, purely informational.
Style: minimalist flat vector illustration, muted neutral colors (gray, dark blue), white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`,
  },
  {
    word: '펴다',
    slug: 'pyeoda',
    prompt: `A simple, clean educational illustration for the Korean word "펴다" meaning "to spread out / to unfold / to open up".
Show hands unfolding or spreading open a map, or a person opening an umbrella, or a flower blooming open — conveying the action of spreading/unfolding.
Style: minimalist flat vector illustration, bright cheerful colors, white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`,
  },
  {
    word: '대신하다',
    slug: 'daesinhada',
    prompt: `A simple, clean educational illustration for the Korean word "대신하다" meaning "to substitute / to replace / to do something on behalf of someone".
Show one person stepping in to take the place of another (e.g. a relay handoff, or one figure replacing another at a desk), conveying the concept of substitution or acting on behalf.
Style: minimalist flat vector illustration, bright colors, white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`,
  },
  {
    word: '줄어들다',
    slug: 'jureodeulda',
    prompt: `A simple, clean educational illustration for the Korean word "줄어들다" meaning "to shrink / to decrease / to diminish".
Show a visual of something getting smaller: a bar chart with decreasing bars, or a sweater shrinking in a washing machine, or a balloon deflating — conveying the concept of shrinking/decreasing.
Style: minimalist flat vector illustration, bright colors, white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`,
  },
]

async function generateImage(prompt: string): Promise<Buffer | null> {
  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
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
  console.log(`🖼️ ${WORDS.length}개 단어 이미지 일괄 재생성 (gpt-image-1)`)
  console.log('═'.repeat(60))

  let totalUpdated = 0
  let totalRows = 0

  for (let i = 0; i < WORDS.length; i++) {
    const spec = WORDS[i]
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`[${i + 1}/${WORDS.length}] "${spec.word}"`)
    console.log('─'.repeat(50))

    // DB 조회
    const { data: rows, error } = await supabase
      .from('generated_vocab')
      .select('id, word, mode, meaning_en, image_url')
      .eq('word', spec.word)
    if (error) {
      console.error(`   ❌ DB 조회 실패:`, error.message)
      continue
    }
    if (!rows?.length) {
      console.log(`   ⚠️ DB에 "${spec.word}" 없음`)
      continue
    }
    console.log(`   📋 대상: ${rows.length}개 행`)
    for (const r of rows) {
      console.log(`      ${r.mode}: "${r.word}" | en: "${r.meaning_en}" | img: ${r.image_url ? '있음' : '없음'}`)
    }

    // 이미지 생성
    console.log(`   🖼️ 생성 중...`)
    const buf = await generateImage(spec.prompt)
    if (!buf) {
      console.error(`   ❌ 생성 실패, 건너뜀`)
      continue
    }
    console.log(`   ✅ 생성 완료 (${(buf.length / 1024).toFixed(0)} KB)`)

    // 업로드
    const ts = Date.now()
    const path = `words/${spec.slug}_${ts}.png`
    const imgUrl = await uploadImage(buf, path)
    if (!imgUrl) {
      console.error(`   ❌ 업로드 실패, 건너뜀`)
      continue
    }
    console.log(`   📤 URL: ${imgUrl}`)

    // DB 업데이트 (동일 URL 참조)
    let updated = 0
    for (const r of rows) {
      const { error: upErr } = await supabase
        .from('generated_vocab')
        .update({ image_url: imgUrl })
        .eq('id', r.id)
      if (upErr) {
        console.error(`   ❌ ${r.mode} (${r.id}):`, upErr.message)
      } else {
        updated++
      }
    }
    console.log(`   💾 ${updated}/${rows.length}개 행 업데이트 완료`)
    totalUpdated += updated
    totalRows += rows.length

    // API 속도 제한 방지
    if (i < WORDS.length - 1) {
      console.log(`   ⏳ 2초 대기...`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅ 완료! 총 ${totalUpdated}/${totalRows}개 행 업데이트`)
  console.log('   모든 단어장에서 동일 URL 참조로 이미지 표시됩니다.')
  console.log('═'.repeat(60))
}

main().catch(console.error)
