/**
 * mpasuko / mchaniko / 찢어짐 행의 meaning_ko를 '찢김, 균열'로 통일
 * 실행: npx tsx scripts/_patch-tear-meaning-ko.ts
 * 필요: .env에 SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const url = process.env.VITE_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function main() {
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const supabase = createClient(url, key)
  const words = ['mpasuko', 'mchaniko', '찢어짐']
  const newKo = '찢김, 균열'

  const { data: rows, error: selErr } = await supabase
    .from('generated_vocab')
    .select('id, word, meaning_ko')
    .in('word', words)

  if (selErr) {
    console.error(selErr)
    process.exit(1)
  }

  console.log('found:', rows?.length ?? 0)
  for (const r of rows ?? []) {
    if (r.meaning_ko === newKo) {
      console.log('skip (already)', r.word, r.id)
      continue
    }
    const { error: upErr } = await supabase.from('generated_vocab').update({ meaning_ko: newKo }).eq('id', r.id)
    if (upErr) console.error('update failed', r.word, upErr)
    else console.log('updated', r.word, r.id, '←', r.meaning_ko)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
