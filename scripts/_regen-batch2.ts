import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!)

const WORDS = [
  {
    word: 'kuua',
    slug: 'kuua',
    prompt: `A simple, clean educational illustration for the Swahili word "kuua" meaning "to kill".
Show a symbolic scene: a wilted plant being cut by scissors, or a bug spray can with a crossed-out insect — conveying the concept of killing in a non-violent, matter-of-fact way (like pest control or weeding).
Style: minimalist flat vector illustration, muted neutral colors, white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`,
  },
  {
    word: 'mchumba',
    slug: 'mchumba',
    prompt: `A simple, clean educational illustration for the Swahili word "mchumba" meaning "fiancé / fiancée / romantic partner".
Show a happy couple standing together with a small heart between them, the woman wearing a simple engagement ring — conveying the concept of an engaged couple or romantic partner.
Style: minimalist flat vector illustration, warm romantic colors (pink, red accents), white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`,
  },
]

async function main() {
  console.log(`🖼️ ${WORDS.length}개 단어 이미지 생성 (gpt-image-1)\n`)

  for (let i = 0; i < WORDS.length; i++) {
    const spec = WORDS[i]
    console.log(`[${i + 1}/${WORDS.length}] "${spec.word}"`)

    const { data: rows, error } = await supabase
      .from('generated_vocab')
      .select('id, word, mode, meaning_en, image_url')
      .eq('word', spec.word)
    if (error) { console.error('   ❌ DB:', error.message); continue }
    if (!rows?.length) { console.log('   ⚠️ 없음'); continue }
    for (const r of rows) console.log(`   ${r.mode}: en="${r.meaning_en}" img=${r.image_url ? '있음' : '없음'}`)

    console.log('   생성 중...')
    const response = await openai.images.generate({ model: 'gpt-image-1', prompt: spec.prompt, n: 1, size: '1024x1024' })
    const item = response.data[0]
    const b64 = (item as Record<string, unknown>).b64_json as string | undefined
    const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : b64 ? Buffer.from(b64, 'base64') : null
    if (!buf) { console.error('   ❌ 생성 실패'); continue }
    console.log(`   ✅ ${(buf.length / 1024).toFixed(0)} KB`)

    const path = `words/${spec.slug}_${Date.now()}.png`
    const { error: upErr } = await supabase.storage.from('vocabaudio').upload(path, buf, { contentType: 'image/png', upsert: true })
    if (upErr) { console.error('   ❌ 업로드:', upErr.message); continue }
    const imgUrl = supabase.storage.from('vocabaudio').getPublicUrl(path).data?.publicUrl
    console.log(`   📤 ${imgUrl}`)

    let ok = 0
    for (const r of rows) {
      const { error: e } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', r.id)
      if (!e) ok++
    }
    console.log(`   💾 ${ok}/${rows.length}개 행 완료`)

    if (i < WORDS.length - 1) await new Promise((r) => setTimeout(r, 2000))
  }
  console.log('\n✅ 모두 완료!')
}
main().catch(console.error)
