/**
 * 부적절한 콘텐츠 검사 및 삭제 스크립트
 * - 욕설, 금칙어, 19금 콘텐츠 포함 단어 찾기
 * - 해당 단어 클라우드 데이터베이스에서 삭제
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// 한국어 부적절한 단어 목록
const KOREAN_INAPPROPRIATE = [
  // 욕설/비속어
  '씨발', '시발', '씹', '개새끼', '새끼', '병신', '지랄', '염병', '좆', '보지', '자지',
  '개같', '개년', '썅', '빠구리', '꼴통', '미친놈', '미친년', '느금마', '애미', '애비',
  '호로', '창녀', '화냥년', '걸레', '잡년', '조까', '엿먹', '닥쳐', '꺼져', '죽어',
  // 성인/19금
  '섹스', '성교', '성관계', '자위', '야동', '포르노', '음란', '강간', '성폭행', '성추행',
  '음경', '질', '유두', '성기', '정액', '사정', '오르가즘', '페니스', '바기나',
  // 차별/혐오
  '흑형', '깜둥이', '쪽바리', '짱깨', '빨갱이', '종북', '홍어', '틀딱', '한남충', '김치녀',
]

// 영어 부적절한 단어 목록
const ENGLISH_INAPPROPRIATE = [
  // Profanity
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'damn', 'cunt', 'dick', 'cock', 'pussy',
  'whore', 'slut', 'motherfucker', 'bullshit', 'crap', 'piss', 'douche', 'wanker', 'twat',
  // Adult/Sexual
  'sex', 'porn', 'pornography', 'masturbate', 'masturbation', 'orgasm', 'ejaculate', 'erection',
  'penis', 'vagina', 'nipple', 'genitals', 'intercourse', 'blowjob', 'handjob', 'anal',
  'rape', 'molest', 'pedophile', 'incest',
  // Slurs (not comprehensive, just examples)
  'nigger', 'nigga', 'faggot', 'retard', 'spic', 'chink', 'kike',
]

// 스와힐리어 부적절한 단어 목록
const SWAHILI_INAPPROPRIATE = [
  // Swahili profanity/vulgar words
  'kuma', 'mboo', 'mkundu', 'malaya', 'kahaba', 'matako', 'titi',
  'kutomba', 'kufira', 'kunyonga', 'kupiga punyeto',
  // Sexual terms
  'ngono', 'kufanya mapenzi', 'ubakaji', 'unyanyasaji',
]

// 모든 부적절한 단어 통합
const ALL_INAPPROPRIATE = [
  ...KOREAN_INAPPROPRIATE,
  ...ENGLISH_INAPPROPRIATE,
  ...SWAHILI_INAPPROPRIATE,
].map(w => w.toLowerCase())

interface VocabEntry {
  id: string
  mode: string
  word: string
  word_pronunciation?: string
  meaning_sw?: string
  meaning_ko?: string
  meaning_en?: string
  example?: string
  example_translation_ko?: string
  example_translation_en?: string
  category?: string
}

// 텍스트에 부적절한 단어가 포함되어 있는지 확인
function containsInappropriate(text: string | null | undefined): { found: boolean; matches: string[] } {
  if (!text) return { found: false, matches: [] }
  
  const lowerText = text.toLowerCase()
  const matches: string[] = []
  
  for (const word of ALL_INAPPROPRIATE) {
    if (lowerText.includes(word)) {
      matches.push(word)
    }
  }
  
  return { found: matches.length > 0, matches }
}

// 단어 엔트리에서 부적절한 콘텐츠 확인
function checkEntry(entry: VocabEntry): { inappropriate: boolean; reasons: string[] } {
  const reasons: string[] = []
  
  // 단어 자체 확인
  const wordCheck = containsInappropriate(entry.word)
  if (wordCheck.found) {
    reasons.push(`word: "${entry.word}" contains [${wordCheck.matches.join(', ')}]`)
  }
  
  // 발음 확인
  const pronCheck = containsInappropriate(entry.word_pronunciation)
  if (pronCheck.found) {
    reasons.push(`pronunciation contains [${pronCheck.matches.join(', ')}]`)
  }
  
  // 뜻 확인 (모든 언어)
  const swMeaningCheck = containsInappropriate(entry.meaning_sw)
  if (swMeaningCheck.found) {
    reasons.push(`meaning_sw: "${entry.meaning_sw}" contains [${swMeaningCheck.matches.join(', ')}]`)
  }
  
  const koMeaningCheck = containsInappropriate(entry.meaning_ko)
  if (koMeaningCheck.found) {
    reasons.push(`meaning_ko: "${entry.meaning_ko}" contains [${koMeaningCheck.matches.join(', ')}]`)
  }
  
  const enMeaningCheck = containsInappropriate(entry.meaning_en)
  if (enMeaningCheck.found) {
    reasons.push(`meaning_en: "${entry.meaning_en}" contains [${enMeaningCheck.matches.join(', ')}]`)
  }
  
  // 예문 확인
  const exampleCheck = containsInappropriate(entry.example)
  if (exampleCheck.found) {
    reasons.push(`example contains [${exampleCheck.matches.join(', ')}]`)
  }
  
  const exKoCheck = containsInappropriate(entry.example_translation_ko)
  if (exKoCheck.found) {
    reasons.push(`example_translation_ko contains [${exKoCheck.matches.join(', ')}]`)
  }
  
  const exEnCheck = containsInappropriate(entry.example_translation_en)
  if (exEnCheck.found) {
    reasons.push(`example_translation_en contains [${exEnCheck.matches.join(', ')}]`)
  }
  
  return { inappropriate: reasons.length > 0, reasons }
}

async function main() {
  console.log('🔍 부적절한 콘텐츠 검사 시작...\n')
  console.log(`검사 기준 단어 수: ${ALL_INAPPROPRIATE.length}개\n`)
  
  // 모든 단어 가져오기
  const { data: allVocab, error } = await supabase
    .from('generated_vocab')
    .select('*')
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('❌ 데이터 가져오기 실패:', error.message)
    process.exit(1)
  }
  
  if (!allVocab || allVocab.length === 0) {
    console.log('📭 데이터베이스에 단어가 없습니다.')
    process.exit(0)
  }
  
  console.log(`📊 총 ${allVocab.length}개 단어 검사 중...\n`)
  
  // SW 모드와 KO 모드 분리
  const swVocab = allVocab.filter(v => v.mode === 'sw')
  const koVocab = allVocab.filter(v => v.mode === 'ko')
  
  console.log(`  - SW 모드: ${swVocab.length}개`)
  console.log(`  - KO 모드: ${koVocab.length}개\n`)
  
  // 부적절한 단어 찾기
  const inappropriateEntries: { entry: VocabEntry; reasons: string[] }[] = []
  
  for (const entry of allVocab) {
    const check = checkEntry(entry as VocabEntry)
    if (check.inappropriate) {
      inappropriateEntries.push({ entry: entry as VocabEntry, reasons: check.reasons })
    }
  }
  
  if (inappropriateEntries.length === 0) {
    console.log('✅ 부적절한 콘텐츠가 발견되지 않았습니다!')
    console.log('\n모든 단어가 안전합니다. 삭제할 항목이 없습니다.')
    process.exit(0)
  }
  
  // 부적절한 단어 출력
  console.log(`⚠️ 부적절한 콘텐츠 발견: ${inappropriateEntries.length}개\n`)
  console.log('=' .repeat(80))
  
  for (const { entry, reasons } of inappropriateEntries) {
    console.log(`\n🚫 [${entry.mode.toUpperCase()}] ${entry.word} (ID: ${entry.id})`)
    console.log(`   카테고리: ${entry.category || 'N/A'}`)
    console.log(`   이유:`)
    for (const reason of reasons) {
      console.log(`     - ${reason}`)
    }
  }
  
  console.log('\n' + '=' .repeat(80))
  
  // 삭제 확인
  console.log(`\n⚠️ 위 ${inappropriateEntries.length}개 항목을 삭제하시겠습니까?`)
  console.log('삭제를 진행하려면 스크립트를 --delete 플래그와 함께 실행하세요.')
  console.log('예: npx tsx scripts/check-inappropriate-content.ts --delete\n')
  
  // --delete 플래그가 있으면 삭제 진행
  if (process.argv.includes('--delete')) {
    console.log('🗑️ 삭제 진행 중...\n')
    
    const idsToDelete = inappropriateEntries.map(e => e.entry.id)
    
    const { error: deleteError } = await supabase
      .from('generated_vocab')
      .delete()
      .in('id', idsToDelete)
    
    if (deleteError) {
      console.error('❌ 삭제 실패:', deleteError.message)
      process.exit(1)
    }
    
    console.log(`✅ ${inappropriateEntries.length}개 항목이 성공적으로 삭제되었습니다!`)
    
    // 삭제된 단어 목록 출력
    console.log('\n삭제된 단어:')
    for (const { entry } of inappropriateEntries) {
      console.log(`  - [${entry.mode}] ${entry.word}`)
    }
  }
}

main().catch(console.error)
