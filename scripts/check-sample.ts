/**
 * Supabase에 저장된 최근 레코드 샘플 확인
 * 실행: npx tsx scripts/check-sample.ts
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data, error } = await supabase
    .from('generated_vocab')
    .select(
      'mode,word,meaning_sw,meaning_ko,meaning_en,example,word_audio_url,meaning_sw_audio_url,meaning_ko_audio_url,meaning_en_audio_url,example_audio_url,created_at',
    )
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) throw error

  console.log(JSON.stringify(data, null, 2))
}

main().catch((e) => {
  console.error('❌ check-sample 실패:', e)
  process.exit(1)
})






