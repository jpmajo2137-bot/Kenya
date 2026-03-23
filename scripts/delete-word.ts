/**
 * 단어 삭제 스크립트
 * 사용: npx tsx scripts/delete-word.ts 삽입하다
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function main() {
  const arg1 = process.argv[2]
  const arg2 = process.argv[3]
  let data: { id: number; word: string; meaning_ko: string | null; mode: string }[] | null = null
  let error: { message: string } | null = null

  if (arg1 === '--meaning-en' && arg2) {
    const res = await supabase
      .from('generated_vocab')
      .select('id, word, meaning_ko, mode')
      .eq('meaning_en', arg2)
    data = res.data
    error = res.error as { message: string } | null
  } else {
    const word = arg1 || '삽입하다'
    const res = await supabase
      .from('generated_vocab')
      .select('id, word, meaning_ko, mode')
      .eq('word', word)
    data = res.data
    error = res.error as { message: string } | null
  }

  if (error) {
    console.error('❌ 조회 실패:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('⏭️ 해당 단어가 DB에 없습니다.')
    return
  }

  const ids = data.map((r) => r.id)
  console.log(`🗑️ 삭제할 단어 (${data.length}건):`)
  for (const r of data) {
    console.log(`  - ${r.word} (${r.meaning_ko}) [${r.mode}] id=${r.id}`)
  }

  const { error: delError } = await supabase
    .from('generated_vocab')
    .delete()
    .in('id', ids)

  if (delError) {
    console.error('❌ 삭제 실패:', delError.message)
    process.exit(1)
  }

  console.log(`\n✅ ${ids.length}건 삭제 완료.`)
}

main()
