import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!)

const WORD = 'kuungua'
const SLUG = 'kuungua'
const PROMPT = `A simple, clean educational illustration for the Swahili word "kuungua" meaning "to burn / to get burned".
Show a hand quickly pulling away from a hot pot on a stove, with small heat waves and a red glow around the pot — conveying the concept of getting burned in a safe, everyday kitchen context.
Style: minimalist flat vector illustration, warm colors (orange, red accents), white/light background, educational flashcard style.
IMPORTANT: No text, no letters, no words, no numbers in the image.`

async function main() {
  console.log(`[1] DB 조회: ${WORD}`)
  const { data: rows, error } = await supabase
    .from('generated_vocab')
    .select('id, word, mode, meaning_en, image_url')
    .eq('word', WORD)
  if (error) { console.error('DB 오류:', error.message); process.exit(1) }
  if (!rows?.length) { console.error(`"${WORD}" 없음`); process.exit(1) }
  for (const r of rows) console.log(`   ${r.mode}: en="${r.meaning_en}" img=${r.image_url ? '있음' : '없음'}`)

  console.log('[2] gpt-image-1 생성 중...')
  const response = await openai.images.generate({
    model: 'gpt-image-1', prompt: PROMPT, n: 1, size: '1024x1024',
  })
  const item = response.data[0]
  const b64 = (item as Record<string, unknown>).b64_json as string | undefined
  const buf = item?.url
    ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
    : b64 ? Buffer.from(b64, 'base64') : null
  if (!buf) { console.error('생성 실패'); process.exit(1) }
  console.log(`   ✅ ${(buf.length / 1024).toFixed(0)} KB`)

  const path = `words/${SLUG}_${Date.now()}.png`
  console.log(`[3] 업로드: ${path}`)
  const { error: upErr } = await supabase.storage.from('vocabaudio').upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upErr) { console.error('업로드 실패:', upErr.message); process.exit(1) }
  const imgUrl = supabase.storage.from('vocabaudio').getPublicUrl(path).data?.publicUrl
  console.log(`   ✅ ${imgUrl}`)

  console.log('[4] DB 업데이트...')
  let ok = 0
  for (const r of rows) {
    const { error: e } = await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', r.id)
    if (!e) { ok++; console.log(`   ✅ ${r.mode} "${r.word}"`) }
    else console.error(`   ❌ ${r.id}: ${e.message}`)
  }
  console.log(`완료: ${ok}/${rows.length}개 행`)
}
main().catch(console.error)
