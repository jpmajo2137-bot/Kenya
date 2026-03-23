/**
 * Machi (3월) 단어를 generated_vocab에 추가하고 시간/날짜 분류에 등록
 * 사용법: npx tsx scripts/add-machi.ts
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function main() {
  console.log('🔧 Machi (3월) 단어 추가 중...')

  // 1. 기존 Machi 확인
  const { data: existing } = await supabase
    .from('generated_vocab')
    .select('id, word')
    .eq('mode', 'sw')
    .or('word.eq.Machi,word.eq.machi')
    .limit(1)

  if (existing && existing.length > 0) {
    console.log(`   ✅ 이미 존재함: "${existing[0].word}" (${existing[0].id})`)
    console.log('   topicClassification에 시간/날짜 분류 추가 필요 시 classify-words.ts 실행')
    return
  }

  // 2. Machi 삽입 (최소 필드, 오디오는 null)
  const row = {
    mode: 'sw' as const,
    word: 'Machi',
    word_pronunciation: 'MA-chi',
    word_audio_url: null as string | null,
    meaning_sw: 'Machi',
    meaning_sw_pronunciation: null as string | null,
    meaning_sw_audio_url: null as string | null,
    meaning_ko: '3월',
    meaning_ko_pronunciation: 'samwol',
    meaning_ko_audio_url: null as string | null,
    meaning_en: 'March',
    meaning_en_pronunciation: null as string | null,
    meaning_en_audio_url: null as string | null,
    example: 'Tunaanza mwezi wa Machi.',
    example_pronunciation: null as string | null,
    example_audio_url: null as string | null,
    example_translation_sw: 'Tunaanza mwezi wa Machi.',
    example_translation_ko: '우리는 3월에 시작해요.',
    example_translation_en: 'We start in March.',
    pos: 'n.',
    category: '시간',
  }

  const { data: inserted, error } = await supabase
    .from('generated_vocab')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error('   ❌ 삽입 실패:', error.message)
    throw error
  }

  const newId = inserted!.id
  console.log(`   ✅ Machi 삽입 완료: ${newId}`)

  // 3. _classify_progress.json에 추가
  const progressPath = path.join(process.cwd(), 'scripts', '_classify_progress.json')
  let progress: { results?: Record<string, string[]>; modes?: Record<string, string> } = {}
  if (fs.existsSync(progressPath)) {
    progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'))
  }
  progress.results = progress.results || {}
  progress.modes = progress.modes || {}
  progress.results[newId] = ['시간/날짜']
  progress.modes[newId] = 'sw'
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8')
  console.log(`   ✅ _classify_progress.json 업데이트`)

  // 4. topicClassification.ts에 추가 (마지막 } 앞에 새 항목 삽입)
  const tcPath = path.join(process.cwd(), 'src', 'lib', 'topicClassification.ts')
  let content = fs.readFileSync(tcPath, 'utf-8')
  const addEntry = `,"${newId}":["sw","시간/날짜"]`
  content = content.replace(/\};\r?\n\s*export default data/, `${addEntry}};\nexport default data`)
  fs.writeFileSync(tcPath, content, 'utf-8')
  console.log(`   ✅ topicClassification.ts 업데이트`)

  console.log('\n🎉 Machi (3월) 추가 완료!')
}

main().catch(console.error)
