import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config()
const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function main() {
  const OLD = '알legedly, ~라고 주장된다(전해진다)'
  const { data } = await s.from('generated_vocab').select('id,word,mode,meaning_ko').eq('meaning_ko', OLD)
  console.log(JSON.stringify(data, null, 2))
  const { data: d2 } = await s.from('generated_vocab').select('id,word,mode,meaning_ko').ilike('meaning_ko', '%알legedly%')
  console.log('ilike:', JSON.stringify(d2, null, 2))
}
main()
