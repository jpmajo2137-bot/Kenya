/**
 * kufuatilia — meaning_ko 아랍어 혼입 제거 → "추적하다, 감시하다"
 * 실행: npx tsx scripts/_patch-kufuatilia-meaning-ko.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const OLD = '추적하다, متابعة하다'
const NEW = '추적하다, 감시하다'

async function main() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: rows, error } = await supabase.from('generated_vocab').select('id, word, meaning_ko').eq('meaning_ko', OLD)
  if (error) throw error
  console.log('대상:', rows?.length ?? 0)
  for (const r of rows ?? []) {
    const { error: up } = await supabase.from('generated_vocab').update({ meaning_ko: NEW }).eq('id', r.id)
    if (up) console.error(r.word, up.message)
    else console.log('✅', r.word)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
