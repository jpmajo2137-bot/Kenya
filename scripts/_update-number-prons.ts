/**
 * oxford_vocab.word_pron_ko 채우기 (숫자 단어 한정).
 *
 * 목적: KO-EN 사용자가 영어 숫자 단어 아래 한글 발음 가이드("원","투"...)를
 *       볼 수 있도록 DB에 발음 표기를 저장한다.
 *
 * 같은 word 행이 여럿(예: one=일/하나) 일 수 있으므로 word 기준 UPDATE 한 번이면 충분.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('env missing'); process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const PRON: Record<string, string> = {
  one: '원', two: '투', three: '쓰리', four: '포', five: '파이브',
  six: '식스', seven: '세븐', eight: '에이트', nine: '나인', ten: '텐',
  eleven: '일레븐', twelve: '트웰브', thirteen: '써틴', fourteen: '포틴', fifteen: '피프틴',
  sixteen: '식스틴', seventeen: '세븐틴', eighteen: '에이틴', nineteen: '나인틴', twenty: '트웬티',
  'twenty-one': '트웬티원', 'twenty-two': '트웬티투', 'twenty-three': '트웬티쓰리', 'twenty-four': '트웬티포', 'twenty-five': '트웬티파이브',
  'twenty-six': '트웬티식스', 'twenty-seven': '트웬티세븐', 'twenty-eight': '트웬티에이트', 'twenty-nine': '트웬티나인', thirty: '써티',
  forty: '포티', fifty: '피프티', sixty: '식스티', seventy: '세븐티', eighty: '에이티', ninety: '나인티', hundred: '헌드레드',
}

async function main() {
  let ok = 0, fail = 0
  for (const [word, pron] of Object.entries(PRON)) {
    const { error, count } = await supabase
      .from('oxford_vocab')
      .update({ word_pron_ko: pron }, { count: 'exact' })
      .eq('word', word)
    if (error) { console.error(`✗ ${word}: ${error.message}`); fail++; continue }
    console.log(`✓ ${word} → ${pron}  (rows=${count ?? '?'})`)
    ok++
  }
  console.log('═'.repeat(50))
  console.log(`완료: ${ok} 단어 업데이트, 실패 ${fail}`)
}

main().catch(e => { console.error(e); process.exit(1) })
