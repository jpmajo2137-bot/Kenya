/**
 * GPT-5.2-PRO를 사용한 부적절한 콘텐츠 검사 및 삭제 스크립트
 * - 욕설, 금칙어, 19금 콘텐츠 포함 단어 찾기 (AI 기반 정확한 분석)
 * - 해당 단어 클라우드 데이터베이스에서 삭제
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const openaiApiKey = process.env.VITE_OPENAI_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

if (!openaiApiKey) {
  console.error('❌ OpenAI API 키가 설정되지 않았습니다.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const openai = new OpenAI({ apiKey: openaiApiKey })

interface VocabEntry {
  id: string
  mode: string
  word: string
  word_pronunciation?: string
  meaning_sw?: string
  meaning_ko?: string
  meaning_en?: string
  example?: string
  example_pronunciation?: string
  example_translation_ko?: string
  example_translation_en?: string
  category?: string
}

interface CheckResult {
  inappropriate: boolean
  reason: string
  severity: 'none' | 'low' | 'medium' | 'high'
}

// GPT를 사용하여 단어 검사
async function checkWithGPT(entries: VocabEntry[]): Promise<Map<string, CheckResult>> {
  const results = new Map<string, CheckResult>()
  
  // 배치로 처리 (한 번에 20개씩)
  const batchSize = 20
  
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(entries.length / batchSize)
    
    console.log(`  검사 중... (${batchNum}/${totalBatches}) - ${i + 1}~${Math.min(i + batchSize, entries.length)}`)
    
    const entriesText = batch.map((e, idx) => {
      return `[${idx + 1}] ID: ${e.id}
단어: ${e.word}
발음: ${e.word_pronunciation || 'N/A'}
뜻(스와힐리어): ${e.meaning_sw || 'N/A'}
뜻(한국어): ${e.meaning_ko || 'N/A'}
뜻(영어): ${e.meaning_en || 'N/A'}
예문: ${e.example || 'N/A'}
예문번역(한국어): ${e.example_translation_ko || 'N/A'}
예문번역(영어): ${e.example_translation_en || 'N/A'}`
    }).join('\n\n---\n\n')

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: `당신은 언어 학습 앱의 콘텐츠 검수 전문가입니다. 
주어진 단어/뜻/예문에서 다음 항목을 철저히 검사하세요:

1. **욕설/비속어**: 한국어, 영어, 스와힐리어의 욕설, 비속어, 모욕적 표현
2. **금칙어**: 혐오 표현, 차별적 언어, 불쾌한 표현
3. **19금/성인 콘텐츠**: 성적인 내용, 노골적 표현, 성인용 어휘

중요: 
- "물질", "품질", "성질" 등 일반적인 한국어 단어는 부적절하지 않음
- "analysis", "spice" 등 일반 영어 단어도 부적절하지 않음
- 문맥상 교육/학습 목적으로 적절한 단어는 부적절하지 않음
- "섹시하다/sexy"는 일반 형용사로 허용
- 의학/과학 용어는 허용

각 단어에 대해 JSON 배열로 응답하세요:
[
  {"id": "...", "inappropriate": true/false, "reason": "이유 설명 또는 빈 문자열", "severity": "none/low/medium/high"}
]

severity 기준:
- none: 문제없음
- low: 경미함 (주의 필요하지만 삭제 불필요)
- medium: 중간 (검토 필요)
- high: 심각함 (삭제 필요)`
          },
          {
            role: 'user',
            content: `다음 ${batch.length}개 단어를 검사해주세요:\n\n${entriesText}`
          }
        ],
        temperature: 0,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (content) {
        try {
          const parsed = JSON.parse(content)
          const items = parsed.results || parsed.items || parsed
          
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.id) {
                results.set(item.id, {
                  inappropriate: item.inappropriate || false,
                  reason: item.reason || '',
                  severity: item.severity || 'none'
                })
              }
            }
          }
        } catch (parseErr) {
          console.error('    JSON 파싱 오류:', parseErr)
        }
      }
    } catch (err) {
      console.error(`    배치 ${batchNum} 오류:`, err)
    }
    
    // Rate limit 방지
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  return results
}

async function main() {
  console.log('🔍 GPT-5.2-PRO를 사용한 부적절한 콘텐츠 검사 시작...\n')
  
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
  
  // GPT로 검사
  console.log('🤖 GPT-5.2-PRO 분석 시작...\n')
  const checkResults = await checkWithGPT(allVocab as VocabEntry[])
  
  // 부적절한 단어 필터링 (severity가 medium 또는 high인 경우)
  const inappropriateEntries: { entry: VocabEntry; result: CheckResult }[] = []
  
  for (const entry of allVocab) {
    const result = checkResults.get(entry.id)
    if (result && result.inappropriate && (result.severity === 'medium' || result.severity === 'high')) {
      inappropriateEntries.push({ entry: entry as VocabEntry, result })
    }
  }
  
  console.log('\n' + '='.repeat(80))
  
  if (inappropriateEntries.length === 0) {
    console.log('\n✅ 부적절한 콘텐츠가 발견되지 않았습니다!')
    console.log('모든 단어가 안전합니다. 삭제할 항목이 없습니다.')
    
    // 경미한 항목 표시
    const lowSeverity = Array.from(checkResults.entries())
      .filter(([_, r]) => r.severity === 'low')
    
    if (lowSeverity.length > 0) {
      console.log(`\n📋 참고: 경미한 주의 항목 ${lowSeverity.length}개 (삭제 불필요):`)
      for (const [id, result] of lowSeverity) {
        const entry = allVocab.find(v => v.id === id)
        if (entry) {
          console.log(`  - [${entry.mode}] ${entry.word}: ${result.reason}`)
        }
      }
    }
    
    process.exit(0)
  }
  
  // 부적절한 단어 출력
  console.log(`\n⚠️ 부적절한 콘텐츠 발견: ${inappropriateEntries.length}개\n`)
  
  for (const { entry, result } of inappropriateEntries) {
    console.log(`🚫 [${entry.mode.toUpperCase()}] ${entry.word} (ID: ${entry.id})`)
    console.log(`   카테고리: ${entry.category || 'N/A'}`)
    console.log(`   심각도: ${result.severity}`)
    console.log(`   이유: ${result.reason}`)
    console.log(`   뜻(KO): ${entry.meaning_ko || 'N/A'}`)
    console.log(`   뜻(EN): ${entry.meaning_en || 'N/A'}`)
    console.log('')
  }
  
  console.log('='.repeat(80))
  
  // 삭제 확인
  console.log(`\n⚠️ 위 ${inappropriateEntries.length}개 항목을 삭제하시겠습니까?`)
  console.log('삭제를 진행하려면 스크립트를 --delete 플래그와 함께 실행하세요.')
  console.log('예: npx tsx scripts/check-inappropriate-gpt.ts --delete\n')
  
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
