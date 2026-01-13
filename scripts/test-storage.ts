/**
 * Storage 버킷 직접 업로드 테스트
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!

async function main() {
  console.log('🧪 Storage 버킷 테스트\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // 1. 버킷 목록 확인
  console.log('1️⃣ 버킷 목록:')
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
  if (bucketsError) {
    console.log(`   ⚠️ 버킷 목록 조회 실패 (권한 문제일 수 있음): ${bucketsError.message}`)
  } else {
    console.log(`   버킷 ${buckets?.length || 0}개:`)
    buckets?.forEach(b => console.log(`   - ${b.name} (public: ${b.public})`))
  }
  console.log('')

  // 2. 직접 업로드 테스트
  console.log('2️⃣ 직접 업로드 테스트:')
  const testContent = 'Hello, this is a test file for Kenya Vocab!'
  const testPath = `test/test-${Date.now()}.txt`
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('vocabaudio')
    .upload(testPath, testContent, {
      contentType: 'text/plain',
      upsert: true,
    })

  if (uploadError) {
    console.log(`   ❌ 업로드 실패: ${uploadError.message}`)
    
    if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket not found')) {
      console.log('\n   💡 해결 방법:')
      console.log('   1. Supabase Dashboard → Storage')
      console.log('   2. "New bucket" 클릭')
      console.log('   3. 이름: vocab-audio')
      console.log('   4. Public bucket: 체크 ✅')
      console.log('   5. Create bucket')
    }
  } else {
    console.log(`   ✅ 업로드 성공: ${uploadData.path}`)
    
    // 3. Public URL 확인
    const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(testPath)
    console.log(`   📎 Public URL: ${urlData.publicUrl}`)
    
    // 4. 파일 삭제
    await supabase.storage.from('vocabaudio').remove([testPath])
    console.log('   🗑️ 테스트 파일 삭제 완료')
  }

  console.log('\n✅ 테스트 완료!')
}

main().catch(console.error)

