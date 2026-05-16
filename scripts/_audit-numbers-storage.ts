/**
 * 숫자 단어 73 행의 image / 4 종 audio URL 이 실제로 storage 에 존재하는지 검증.
 *
 * HEAD 요청으로 200 응답만 확인 (실제 download 안 함).
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('env missing'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const NUMBER_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
]

async function head(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    return r.status
  } catch {
    return 0
  }
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
  const { data, error } = await supabase
    .from('oxford_vocab')
    .select('id, word, korean_meaning, image_url, word_audio_url, meaning_audio_url, english_example_audio_url, korean_example_audio_url')
    .in('word', NUMBER_WORDS)
  if (error) { console.error('select fail:', error.message); process.exit(1) }
  const rows = data ?? []
  console.log(`행 수: ${rows.length}`)

  let total = 0, ok = 0, bad = 0
  const badRows: string[] = []

  await pool(rows, 16, async (r) => {
    const urls: Array<[string, string]> = [
      ['image', r.image_url],
      ['word_au', r.word_audio_url],
      ['meaning_au', r.meaning_audio_url],
      ['ex_en_au', r.english_example_audio_url],
      ['ex_ko_au', r.korean_example_audio_url],
    ].filter((p): p is [string, string] => !!p[1])

    for (const [label, url] of urls) {
      total++
      const code = await head(url)
      if (code === 200) ok++
      else {
        bad++
        badRows.push(`  ✗ ${r.word}/${r.korean_meaning} ${label} ${code}  ${url}`)
      }
    }
  })

  console.log(`HEAD 200: ${ok}/${total}`)
  if (bad > 0) {
    console.log('-- 누락/실패 --')
    for (const line of badRows) console.log(line)
  } else {
    console.log('전부 존재 ✓')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
