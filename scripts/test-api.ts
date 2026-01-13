/**
 * API 연결 테스트 스크립트
 * 실행: npx tsx scripts/test-api.ts
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as dotenv from 'dotenv'

// .env 파일 로드
dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const OPENAI_KEY = process.env.VITE_OPENAI_API_KEY

async function main() {
  console.log('========================================')
  console.log('🧪 Kenya Vocab API 테스트')
  console.log('========================================\n')

  // 1. 환경 변수 확인
  console.log('1️⃣ 환경 변수 확인')
  console.log(`   SUPABASE_URL: ${SUPABASE_URL ? '✅ 설정됨' : '❌ 없음'}`)
  console.log(`   SUPABASE_KEY: ${SUPABASE_KEY ? '✅ 설정됨' : '❌ 없음'}`)
  console.log(`   OPENAI_KEY: ${OPENAI_KEY ? '✅ 설정됨' : '❌ 없음'}`)
  console.log('')

  if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
    console.error('❌ 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.')
    process.exit(1)
  }

  // 2. Supabase 연결 테스트
  console.log('2️⃣ Supabase 연결 테스트')
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  
  try {
    const { data, error } = await supabase.from('generated_vocab').select('id').limit(1)
    if (error) {
      console.log(`   ❌ 테이블 접근 실패: ${error.message}`)
      console.log('   → generated_vocab 테이블이 생성되었는지 확인하세요.')
    } else {
      console.log(`   ✅ 테이블 접근 성공 (현재 ${data?.length || 0}개 레코드)`)
    }
  } catch (e) {
    console.log(`   ❌ 연결 실패: ${e}`)
  }
  console.log('')

  // 3. Storage 버킷 테스트
  console.log('3️⃣ Storage 버킷 테스트')
  try {
    // NOTE: anon 키에서는 listBuckets가 빈 배열로 나올 수 있어 직접 업로드로 확인합니다.
    const testPath = `test/test-${Date.now()}.txt`
    const { error: uploadError } = await supabase.storage
      .from('vocabaudio')
      .upload(testPath, 'ping', { contentType: 'text/plain', upsert: true })
    if (uploadError) {
      console.log(`   ❌ 업로드 실패: ${uploadError.message}`)
      console.log('   → Storage bucket 이름(vocabaudio) / RLS 정책을 확인하세요.')
    } else {
      console.log('   ✅ 업로드 성공 (vocabaudio)')
      await supabase.storage.from('vocabaudio').remove([testPath])
    }
  } catch (e) {
    console.log(`   ⚠️ 버킷 확인 실패: ${e}`)
  }
  console.log('')

  // 4. OpenAI 연결 테스트
  console.log('4️⃣ OpenAI 연결 테스트')
  const openai = new OpenAI({ apiKey: OPENAI_KEY })
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "Hello" in Swahili and Korean in JSON format: {"sw": "...", "ko": "..."}' }],
      response_format: { type: 'json_object' },
      max_tokens: 100,
    })
    const content = response.choices[0]?.message?.content
    console.log(`   ✅ OpenAI 응답: ${content}`)
  } catch (e) {
    console.log(`   ❌ OpenAI 실패: ${e}`)
  }
  console.log('')

  // 5. 단어 생성 테스트 (5개)
  console.log('5️⃣ 단어 생성 테스트 (5개)')
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Swahili-Korean language expert. Generate vocabulary entries for Korean speakers learning Swahili.
Return a JSON object with a "words" array containing exactly 5 entries.
Each entry must have: word, word_pronunciation, meaning_ko, meaning_en, example, example_translation_ko, pos`
        },
        {
          role: 'user',
          content: 'Generate 5 basic Swahili greeting words for beginners.'
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    })
    
    const content = response.choices[0]?.message?.content
    if (content) {
      const parsed = JSON.parse(content)
      const words = parsed.words || parsed.vocabulary || []
      console.log(`   ✅ 생성된 단어 ${words.length}개:`)
      for (const w of words.slice(0, 5)) {
        console.log(`      - ${w.word} (${w.word_pronunciation}) = ${w.meaning_ko}`)
      }

      // DB에 저장 테스트
      if (words.length > 0) {
        console.log('\n6️⃣ DB 저장 테스트')
        const testWord = {
          mode: 'ko',
          word: words[0].word + '_test_' + Date.now(),
          word_pronunciation: words[0].word_pronunciation,
          meaning_ko: words[0].meaning_ko,
          meaning_en: words[0].meaning_en,
          example: words[0].example,
          example_translation_ko: words[0].example_translation_ko,
          pos: words[0].pos,
          category: 'test',
          difficulty: 1,
        }
        
        const { error } = await supabase.from('generated_vocab').insert(testWord)
        if (error) {
          console.log(`   ❌ 저장 실패: ${error.message}`)
        } else {
          console.log('   ✅ 저장 성공!')
          
          // 저장된 데이터 확인
          const { data } = await supabase
            .from('generated_vocab')
            .select('*')
            .eq('category', 'test')
            .order('created_at', { ascending: false })
            .limit(1)
          
          if (data?.[0]) {
            console.log(`   📝 저장된 데이터: ${data[0].word} = ${data[0].meaning_ko}`)
          }
        }
      }
    }
  } catch (e) {
    console.log(`   ❌ 단어 생성 실패: ${e}`)
  }

  console.log('\n========================================')
  console.log('✅ 테스트 완료!')
  console.log('========================================')
}

main().catch(console.error)

