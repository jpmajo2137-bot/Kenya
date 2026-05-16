import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config()
const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function main() {
  const { data } = await s.from('generated_vocab').select('id,word,mode').eq('meaning_en', 'nation; a country or state')
  console.log(JSON.stringify(data, null, 2))
}
main()
