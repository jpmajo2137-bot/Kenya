import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function main() {
  const { data, error } = await sb
    .from('oxford_vocab')
    .select('id,word,korean_meaning,meaning_audio_url,word_audio_url')
    .eq('word', 'stay')
  if (error) throw error
  for (const r of data ?? []) {
    console.log(`id: ${r.id}`)
    console.log(`  word: ${r.word}`)
    console.log(`  korean_meaning: ${r.korean_meaning}`)
    console.log(`  meaning_audio_url: ${r.meaning_audio_url}`)
    console.log(`  word_audio_url: ${r.word_audio_url}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
