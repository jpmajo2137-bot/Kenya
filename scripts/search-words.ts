import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function check() {
  const keywords = ['콘돔', '섹시', 'condom', 'sexy', '불륜', 'adultery', 'infidelity']
  
  console.log('🔍 민감한 단어 검색 중...\n')
  
  for (const keyword of keywords) {
    const { data } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_ko, meaning_en, example, category')
      .or(`word.ilike.%${keyword}%,meaning_ko.ilike.%${keyword}%,meaning_en.ilike.%${keyword}%`)
    
    if (data && data.length > 0) {
      console.log(`\n?? '${keyword}' ?? ??: ${data.length}?`)
      for (const item of data) {
        console.log(`  - [${item.mode}] ???: ${item.word}`)
        console.log(`    ??KO): ${item.meaning_ko}`)
        console.log(`    ??EN): ${item.meaning_en}`)
        console.log(`    ???: ${item.example}`)
        console.log(`    ????: ${item.category}`)
        console.log(`    ID: ${item.id}`)
        console.log('')
      }
    } else {
      console.log(`??'${keyword}': ???`)
    }
  }
}

check()
