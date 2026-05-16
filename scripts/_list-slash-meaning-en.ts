/**
 * meaning_en에 슬래시(/)가 포함된 행 전부 조회.
 * 실행: npx tsx scripts/_list-slash-meaning-en.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const all: { id: string; word: string; mode: string; meaning_en: string }[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, word, mode, meaning_en')
      .not('meaning_en', 'is', null)
      .ilike('meaning_en', '%/%')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`총 ${all.length}개`)
  const unique = new Map<string, string[]>()
  for (const r of all) {
    const key = r.meaning_en
    if (!unique.has(key)) unique.set(key, [])
    unique.get(key)!.push(r.word)
  }
  const sorted = [...unique.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [en, words] of sorted) {
    console.log(`  "${en}" → [${words.join(', ')}]`)
  }
  console.log(`\n고유 meaning_en: ${unique.size}개`)
}

main().catch((e) => { console.error(e); process.exit(1) })
