import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function deleteWords() {
  // 삭제할 단어 ID 목록 (성적인/민감한 단어)
  const idsToDelete = [
    'd823e024-5f8e-4161-9067-82820ee92124', // kondomu (콘돔)
    '5baf8f55-5133-4207-8a79-f90dfdc04fd5', // 섹시하다
    '42991b9c-8c74-4c06-b727-10942f41bdf5', // seksi
    '7f2af359-39d4-4b05-a314-580955a76b5c', // 불륜
    '3b5bf904-50e6-44c6-a990-e832bd21fd5f', // uhusiano wa siri (불륜)
    'b0ab526e-a198-47bd-bef2-0fa51b44f6a3', // 성적인 (sexual)
    'bc6ffb85-bdde-422d-9049-37c881bd7561', // 성적 지향 (sexuality)
    '5b84299a-9721-4bb0-a66e-c2054133a94d', // kingono (sexual)
    '1e69f608-0abb-403c-93f8-73cad743df0d', // ujinsia (sexuality)
  ]

  console.log('🗑️ 민감한 단어 삭제 중...\n')

  // 삭제 전 단어 확인
  const { data: beforeData } = await supabase
    .from('generated_vocab')
    .select('id, word, meaning_ko')
    .in('id', idsToDelete)

  if (beforeData && beforeData.length > 0) {
    console.log('삭제할 단어:')
    for (const item of beforeData) {
      console.log(`  - ${item.word} (${item.meaning_ko})`)
    }
    console.log('')
  }

  // 삭제 실행
  const { error } = await supabase
    .from('generated_vocab')
    .delete()
    .in('id', idsToDelete)

  if (error) {
    console.error('❌ 삭제 실패:', error.message)
    process.exit(1)
  }

  console.log(`✅ ${idsToDelete.length}개 단어가 성공적으로 삭제되었습니다!`)

  // 삭제 후 확인
  const { data: afterData } = await supabase
    .from('generated_vocab')
    .select('id')
    .in('id', idsToDelete)

  if (afterData && afterData.length === 0) {
    console.log('✅ 삭제 확인 완료 - 해당 단어들이 데이터베이스에서 완전히 제거되었습니다.')
  }

  // 남은 단어 수 확인
  const { count } = await supabase
    .from('generated_vocab')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📊 현재 데이터베이스 단어 수: ${count}개`)
}

deleteWords()
