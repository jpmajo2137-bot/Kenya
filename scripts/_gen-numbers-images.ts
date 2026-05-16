/**
 * 숫자 단어(1~30, 40~100) image_url 채우기.
 *
 * - 같은 영어 단어가 여러 행(예: one=일/하나)이라도 이미지 1장만 생성하고
 *   같은 word 의 모든 행에 동일 URL 을 UPDATE.
 * - 멱등: 이미 image_url 채워진 word 는 skip.
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_KEY = process.env.OPENAI_API_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_KEY) {
  console.error('env missing'); process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

const BUCKET = 'oxford-images'
const NUMBER_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
]

function sanitize(word: string): string {
  return word.replace(/\s+/g, '_').replace(/[\/\\]/g, '_')
}

// 숫자 단어 → 화면에 그릴 개수 (count) 와 보조 라벨.
// 시각적으로 너무 많은 개수(예: 100개)는 그룹화로 표현하도록 유도.
function buildPrompt(word: string): string {
  const n = wordToNumber(word)
  if (n === null) {
    return `A simple educational vector illustration representing the English number "${word}". Style: minimalist flat vector, bright cheerful colors, white background. IMPORTANT: No text, no letters, no numbers.`
  }
  if (n <= 10) {
    return `A clean educational vector illustration showing exactly ${n} identical small apples arranged in a neat row on a white background.
Style: minimalist flat vector illustration, bright cheerful colors, single subject per apple, easy to count at a glance.
IMPORTANT: No text, no letters, no numbers, no digits anywhere in the image. The viewer should be able to count exactly ${n} apples.`
  }
  if (n <= 30) {
    return `A clean educational vector illustration showing exactly ${n} identical small colorful balloons grouped together on a white background.
Style: minimalist flat vector illustration, bright cheerful colors, balloons arranged in tidy rows so they are easy to count.
IMPORTANT: No text, no letters, no numbers, no digits anywhere in the image. The viewer should be able to count exactly ${n} balloons.`
  }
  // 40~100 — 너무 많은 개체는 그룹/추상 표현
  return `A clean educational vector illustration that visually conveys the quantity "${n}" using a simple group of small repeated objects (such as dots or stars) arranged in rows of ten on a white background.
Style: minimalist flat vector illustration, bright cheerful colors, neat grid layout so the total count is intuitively ${n}.
IMPORTANT: No text, no letters, no numbers, no digits anywhere in the image.`
}

function wordToNumber(w: string): number | null {
  const map: Record<string, number> = {
    one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
    eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20,
    'twenty-one':21,'twenty-two':22,'twenty-three':23,'twenty-four':24,'twenty-five':25,
    'twenty-six':26,'twenty-seven':27,'twenty-eight':28,'twenty-nine':29, thirty:30,
    forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100,
  }
  return map[w] ?? null
}

async function genImage(prompt: string): Promise<Buffer> {
  const res = await openai.images.generate({
    model: 'gpt-image-1',
    prompt,
    n: 1,
    size: '1024x1024',
  })
  const item = res.data?.[0]
  if (!item) throw new Error('no image data')
  if (item.url) {
    const r = await fetch(item.url)
    if (!r.ok) throw new Error(`download ${r.status}`)
    return Buffer.from(await r.arrayBuffer())
  }
  const b64 = (item as Record<string, unknown>).b64_json as string | undefined
  if (b64) return Buffer.from(b64, 'base64')
  throw new Error('no url / b64_json')
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < retries; i++) {
    try { return await fn() }
    catch (e) {
      last = e
      console.warn(`  [retry ${i+1}/${retries}] ${label}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise(r => setTimeout(r, 2000 * (i + 1)))
    }
  }
  throw last
}

async function processWord(word: string): Promise<'ok' | 'skip' | 'fail'> {
  // 이미 image_url 있는 행 존재?
  const { data: existing, error: selErr } = await supabase
    .from('oxford_vocab')
    .select('id, image_url')
    .eq('word', word)
  if (selErr) { console.error(`  ✗ select ${word}: ${selErr.message}`); return 'fail' }
  if (!existing || existing.length === 0) {
    console.log(`  - skip ${word}: row 없음`)
    return 'skip'
  }
  if (existing.every((r) => (r.image_url ?? '').trim())) {
    console.log(`  · skip ${word}: 모두 image_url 채워짐`)
    return 'skip'
  }

  const prompt = buildPrompt(word)
  const buf = await withRetry(`gen ${word}`, () => genImage(prompt))

  const fileName = `${sanitize(word)}.png`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buf, { contentType: 'image/png', upsert: true })
  if (upErr) throw new Error(`upload: ${upErr.message}`)
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
  const url = pub.publicUrl
  if (!url) throw new Error('public url empty')

  const { error: updErr } = await supabase
    .from('oxford_vocab')
    .update({ image_url: url })
    .eq('word', word)
  if (updErr) throw new Error(`update: ${updErr.message}`)

  console.log(`  ✓ ${word} → ${url}  (rows=${existing.length})`)
  return 'ok'
}

async function pool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let next = 0
  const run = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try { await fn(items[i]) } catch (e) { console.error(`pool ${i}:`, e) }
    }
  }
  await Promise.all(Array.from({ length: n }, () => run()))
}

async function main() {
  const conc = Number(process.argv.find(a => a.startsWith('--concurrency='))?.slice(14) ?? '4')
  let ok = 0, skip = 0, fail = 0
  const t0 = Date.now()
  await pool(NUMBER_WORDS, conc, async (w) => {
    try {
      const r = await processWord(w)
      if (r === 'ok') ok++
      else if (r === 'skip') skip++
      else fail++
    } catch (e) {
      fail++
      console.error(`  ✗ ${w}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
  const elapsed = Math.round((Date.now() - t0) / 1000)
  console.log('═'.repeat(50))
  console.log(`완료: ${ok} 생성 / ${skip} skip / ${fail} 실패 · ${elapsed}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
