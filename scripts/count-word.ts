/**
 * 단어에 특정 문자열이 포함된 개수 조회
 * 사용: npx tsx scripts/count-word.ts 데뷔
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function main() {
  const pattern = process.argv[2] ?? 'herufi'

  // word, meaning_ko, meaning_sw, example 각각에서 검색
  const [w, m, s, e] = await Promise.all([
    supabase.from('generated_vocab').select('id,word,meaning_ko,meaning_sw,example,mode').filter('word', 'ilike', `%${pattern}%`),
    supabase.from('generated_vocab').select('id,word,meaning_ko,meaning_sw,example,mode').filter('meaning_ko', 'ilike', `%${pattern}%`),
    supabase.from('generated_vocab').select('id,word,meaning_ko,meaning_sw,example,mode').filter('meaning_sw', 'ilike', `%${pattern}%`),
    supabase.from('generated_vocab').select('id,word,meaning_ko,meaning_sw,example,mode').filter('example', 'ilike', `%${pattern}%`),
  ])

  const byWord = new Map<string, (typeof w.data)[0]>()
  ;[w.data, m.data, s.data, e.data].flat().filter(Boolean).forEach((r) => r && byWord.set(r.id, r))
  const list = Array.from(byWord.values())

  console.log(`검색 결과: ${list.length}개\n`)
  list.forEach((r) => console.log(`  - ${r?.word} | ${r?.meaning_ko} | ${(r?.example ?? '').slice(0, 50)}`))
}

main()
