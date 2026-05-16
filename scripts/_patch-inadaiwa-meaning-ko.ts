/**
 * inadaiwa — 잘못 붙은 "알legedly," 제거
 * meaning_ko "알legedly, ~라고 주장된다(전해진다)" → "~라고 주장된다(전해진다)"
 * 실행: npx tsx scripts/_patch-inadaiwa-meaning-ko.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const OLD = '알legedly, ~라고 주장된다(전해진다)'
const NEW = '~라고 주장된다(전해진다)'

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
