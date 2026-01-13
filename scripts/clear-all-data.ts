/**
 * 모든 데이터 삭제 스크립트
 * - Supabase generated_vocab 테이블 전체 삭제
 * - Supabase Storage vocabaudio 버킷 파일 삭제
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경변수가 설정되지 않았습니다.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function clearAllData() {
  console.log('🗑️ 모든 데이터 삭제 시작...\n')

  // 1. generated_vocab 테이블 전체 삭제
  console.log('1️⃣ generated_vocab 테이블 삭제 중...')
  
  // 먼저 모든 ID 가져오기
  const { data: allRows, error: selectError } = await supabase
    .from('generated_vocab')
    .select('id')
  
  if (selectError) {
    console.error('   ❌ 데이터 조회 실패:', selectError.message)
  } else if (allRows && allRows.length > 0) {
    const ids = allRows.map(r => r.id)
    console.log(`   📊 삭제할 데이터: ${ids.length}개`)
    
    // ID로 삭제
    const { error: deleteError } = await supabase
      .from('generated_vocab')
      .delete()
      .in('id', ids)
    
    if (deleteError) {
      console.error('   ❌ 테이블 삭제 실패:', deleteError.message)
      console.log('\n   💡 Supabase Dashboard에서 직접 삭제하세요:')
      console.log('      1. Supabase Dashboard > Table Editor > generated_vocab')
      console.log('      2. 모든 행 선택 후 Delete')
    } else {
      console.log(`   ✅ 테이블 삭제 완료 (${ids.length}개 행 삭제됨)`)
    }
  } else {
    console.log('   ℹ️ 삭제할 데이터가 없습니다.')
  }

  // 2. Storage 버킷 파일 삭제
  console.log('\n2️⃣ vocabaudio 버킷 파일 삭제 중...')
  
  const { data: files, error: listError } = await supabase.storage
    .from('vocabaudio')
    .list('', { limit: 1000 })

  if (listError) {
    console.error('   ❌ 파일 목록 조회 실패:', listError.message)
  } else if (files && files.length > 0) {
    const filePaths = files.map(f => f.name)
    const { error: removeError } = await supabase.storage
      .from('vocabaudio')
      .remove(filePaths)

    if (removeError) {
      console.error('   ❌ 파일 삭제 실패:', removeError.message)
    } else {
      console.log(`   ✅ 파일 삭제 완료 (${filePaths.length}개 파일 삭제됨)`)
    }
  } else {
    console.log('   ℹ️ 삭제할 파일이 없습니다.')
  }

  // 3. 삭제 후 확인
  console.log('\n3️⃣ 삭제 후 확인...')
  const { count: remainingCount } = await supabase
    .from('generated_vocab')
    .select('*', { count: 'exact', head: true })

  console.log(`   📊 남은 데이터: ${remainingCount ?? 0}개`)

  console.log('\n✅ 클라우드 데이터 삭제 완료!')
  console.log('\n💡 로컬 데이터(localStorage) 삭제 방법:')
  console.log('   브라우저 개발자도구(F12) > Application > Local Storage > 사이트 선택 > Clear All')
  console.log('   또는 브라우저 콘솔에서: localStorage.clear()')
}

clearAllData().catch(console.error)

