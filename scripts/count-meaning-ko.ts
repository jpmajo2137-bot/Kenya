/**
 * meaning_ko로 검색
 * 사용: npx tsx scripts/count-meaning-ko.ts "광대역"
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function main() {
  const pattern = process.argv[2] ?? '광대역'
  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, word, meaning_ko, meaning_en, mode')
    .ilike('meaning_ko', `%${pattern}%`)

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log(`meaning_ko "${pattern}" 포함: ${data?.length ?? 0}건`)
  data?.forEach((r) => console.log(`  - ${r.word} | ${r.meaning_ko} [${r.mode}]`))
}

main()
