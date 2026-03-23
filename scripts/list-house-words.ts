/**
 * 집/생활용품에 분류된 단어 목록 출력 (제외 대상 선정용)
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import classification from '../src/lib/topicClassification'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function main() {
  const data = classification as Record<string, string[]>
  const houseIds: string[] = []
  for (const [id, arr] of Object.entries(data)) {
    if (Array.isArray(arr) && arr.includes('집/생활용품')) {
      houseIds.push(id)
    }
  }

  if (houseIds.length === 0) {
    console.log('집/생활용품 단어 없음')
    return
  }

  // Supabase .in() has limit, batch by 100
  const rows: { id: string; word: string; meaning_ko: string | null; meaning_en: string | null; meaning_sw: string | null }[] = []
  for (let i = 0; i < houseIds.length; i += 100) {
    const batch = houseIds.slice(i, i + 100)
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, word, meaning_ko, meaning_en, meaning_sw')
      .in('id', batch)
    if (error) {
      console.error(error)
      return
    }
    rows.push(...(data ?? []))
  }

  console.log(`집/생활용품 단어 ${rows.length}개:\n`)
  for (const r of rows) {
    console.log(`${r.word} | KO: ${r.meaning_ko} | EN: ${r.meaning_en}`)
  }
}

main()
