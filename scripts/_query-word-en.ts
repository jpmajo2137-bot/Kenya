/** npx tsx scripts/_query-word-en.ts inayovutia */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const word = process.argv[2] || 'inayovutia'

async function main() {
  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, word, mode, meaning_en, meaning_en_audio_url')
    .eq('word', word)
  if (error) throw error
  console.log(JSON.stringify(data, null, 2))
}

main().catch(console.error)
