/**
 * Machi(3월)가 "모든 단어"에서 어느 위치에 있는지 확인
 * 사용법: npx tsx scripts/find-machi-position.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

const MACHI_ID = 'f78ecc20-3cc2-4224-b4af-20bb841380c6'
const WORDS_PER_DAY = 40

async function main() {
  console.log('🔍 Machi 위치 확인 중...\n')

  const { data: machi, error: machiErr } = await supabase
    .from('generated_vocab')
    .select('id, word, created_at, mode')
    .eq('id', MACHI_ID)
    .single()

  if (machiErr || !machi) {
    console.log('❌ Machi를 DB에서 찾을 수 없습니다.')
    return
  }

  console.log('Machi 정보:', { word: machi.word, created_at: machi.created_at, mode: machi.mode })

  const { count: totalSw } = await supabase
    .from('generated_vocab')
    .select('*', { count: 'exact', head: true })
    .eq('mode', 'sw')
    .not('word', 'like', '__deleted__%')

  const { data: beforeMachi } = await supabase
    .from('generated_vocab')
    .select('id')
    .eq('mode', 'sw')
    .not('word', 'like', '__deleted__%')
    .lt('created_at', machi.created_at)
    .order('created_at', { ascending: true })

  const index = beforeMachi?.length ?? 0
  const position = index + 1
  const day = Math.floor(index / WORDS_PER_DAY) + 1
  const posInDay = (index % WORDS_PER_DAY) + 1

  console.log('\n=== "모든 단어" (SW 모드, created_at 오름차순) ===')
  console.log(`전체 SW 단어 수: ${totalSw ?? '?'}`)
  console.log(`Machi 순번: ${position}번째 (0-based 인덱스: ${index})`)
  console.log(`Day: ${day} (wordsPerDay=${WORDS_PER_DAY} 기준)`)
  console.log(`해당 Day 내: ${posInDay}번째`)

  const { data: nearby } = await supabase
    .from('generated_vocab')
    .select('word, created_at')
    .eq('mode', 'sw')
    .not('word', 'like', '__deleted__%')
    .order('created_at', { ascending: true })
    .range(Math.max(0, index - 3), index + 3)

  if (nearby?.length) {
    console.log('\nMachi 주변 단어 (created_at 순):')
    const startIdx = Math.max(0, index - 3)
    nearby.forEach((r, i) => {
      const marker = r.word?.toLowerCase() === 'machi' ? ' ← Machi (3월)' : ''
      console.log(`  ${startIdx + i + 1}번째: ${r.word}${marker}`)
    })
  }
}

main().catch(console.error)
