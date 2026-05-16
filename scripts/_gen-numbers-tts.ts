/**
 * 숫자 단어(36 신규행 + 기존 행) TTS 생성 + storage 업로드 + DB URL 패치.
 *
 * 출력 파일 컨벤션:
 *   oxford-tts/numbers/{id}/word_en.mp3
 *   oxford-tts/numbers/{id}/meaning_ko.mp3
 *   oxford-tts/numbers/{id}/example_en.mp3
 *   oxford-tts/numbers/{id}/example_ko.mp3
 *
 * 멱등: 해당 컬럼이 비어있는 행만 처리.
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

const BUCKET = 'oxford-tts'
const TTS_MODEL = 'tts-1-hd'
const VOICE_EN = 'nova'
const VOICE_KO = 'nova' // OpenAI TTS 는 다국어 지원. 동일 voice 사용.

const NUMBER_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
]

interface Row {
  id: string
  word: string
  korean_meaning: string
  english_example: string | null
  korean_example: string | null
  word_audio_url: string | null
  meaning_audio_url: string | null
  english_example_audio_url: string | null
  korean_example_audio_url: string | null
}

async function tts(text: string, voice: string): Promise<Buffer> {
  const r = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: voice as 'nova',
    input: text,
    response_format: 'mp3',
  })
  return Buffer.from(await r.arrayBuffer())
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < retries; i++) {
    try { return await fn() }
    catch (e) {
      last = e
      console.warn(`  [retry ${i+1}/${retries}] ${label}: ${e instanceof Error ? e.message : String(e)}`)
      await new Promise(r => setTimeout(r, 1500 * (i + 1)))
    }
  }
  throw last
}

async function uploadAndGetUrl(path: string, buf: Buffer): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  if (!data.publicUrl) throw new Error(`public url empty: ${path}`)
  return data.publicUrl
}

async function processRow(row: Row): Promise<void> {
  const base = `numbers/${row.id}`
  const patch: Partial<Row> = {}

  if (!row.word_audio_url) {
    const buf = await withRetry(`word_en ${row.word}`, () => tts(row.word, VOICE_EN))
    patch.word_audio_url = await uploadAndGetUrl(`${base}/word_en.mp3`, buf)
  }
  if (!row.meaning_audio_url && row.korean_meaning) {
    const buf = await withRetry(`meaning_ko ${row.korean_meaning}`, () => tts(row.korean_meaning, VOICE_KO))
    patch.meaning_audio_url = await uploadAndGetUrl(`${base}/meaning_ko.mp3`, buf)
  }
  if (!row.english_example_audio_url && row.english_example) {
    const buf = await withRetry(`ex_en ${row.id}`, () => tts(row.english_example!, VOICE_EN))
    patch.english_example_audio_url = await uploadAndGetUrl(`${base}/example_en.mp3`, buf)
  }
  if (!row.korean_example_audio_url && row.korean_example) {
    const buf = await withRetry(`ex_ko ${row.id}`, () => tts(row.korean_example!, VOICE_KO))
    patch.korean_example_audio_url = await uploadAndGetUrl(`${base}/example_ko.mp3`, buf)
  }

  if (Object.keys(patch).length === 0) {
    console.log(`  · skip ${row.word}/${row.korean_meaning}: 이미 모두 있음`)
    return
  }
  const { error } = await supabase.from('oxford_vocab').update(patch).eq('id', row.id)
  if (error) throw new Error(`db update: ${error.message}`)
  console.log(`  ✓ ${row.word}/${row.korean_meaning} → ${Object.keys(patch).length} fields`)
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
  const conc = Number(process.argv.find(a => a.startsWith('--concurrency='))?.slice(14) ?? '6')

  const { data, error } = await supabase
    .from('oxford_vocab')
    .select('id, word, korean_meaning, english_example, korean_example, word_audio_url, meaning_audio_url, english_example_audio_url, korean_example_audio_url')
    .in('word', NUMBER_WORDS)
  if (error) { console.error('select fail:', error.message); process.exit(1) }

  const rows = (data ?? []) as Row[]
  console.log(`대상 행: ${rows.length}`)
  const todo = rows.filter((r) =>
    !r.word_audio_url || !r.meaning_audio_url ||
    (r.english_example && !r.english_example_audio_url) ||
    (r.korean_example && !r.korean_example_audio_url)
  )
  console.log(`TTS 필요: ${todo.length}`)

  const t0 = Date.now()
  let done = 0
  await pool(todo, conc, async (row) => {
    try { await processRow(row) }
    catch (e) { console.error(`  ✗ ${row.word}/${row.korean_meaning}: ${e instanceof Error ? e.message : String(e)}`) }
    finally {
      done++
      if (done % 5 === 0 || done === todo.length) {
        const elapsed = Math.round((Date.now() - t0) / 1000)
        console.log(`  진행 ${done}/${todo.length} · ${elapsed}s`)
      }
    }
  })

  const elapsed = Math.round((Date.now() - t0) / 1000)
  console.log('═'.repeat(50))
  console.log(`완료: ${todo.length} 행 처리 · ${elapsed}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
