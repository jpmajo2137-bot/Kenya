import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { NUMBER_ORDER } from '../src/lib/numberOrder'
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!)

async function main() {
  const koIds = NUMBER_ORDER.ko
  console.log(`KO 총 ${koIds.length}개, Day당 36개`)
  console.log(`Day 1: indices 0-35, Day 2: indices 36-${koIds.length - 1}`)

  const { data } = await sb.from('generated_vocab').select('id,word,meaning_ko').in('id', koIds)
  const map = new Map(data?.map(r => [r.id, r]) || [])

  console.log('\n=== KO Day 1 (1~36) ===')
  koIds.slice(0, 36).forEach((id, i) => {
    const r = map.get(id)
    console.log(`  ${i + 1}. ${r?.word ?? '?'} → ${r?.meaning_ko ?? '?'}`)
  })

  console.log('\n=== KO Day 2 (37~50) ===')
  koIds.slice(36).forEach((id, i) => {
    const r = map.get(id)
    console.log(`  ${36 + i + 1}. ${r?.word ?? '?'} → ${r?.meaning_ko ?? '?'}`)
  })

  // sitini, sabini, themanini, tisini, mia 위치 확인
  const targets = ['hamsini', 'sitini', 'sabini', 'themanini', 'tisini', 'mia']
  console.log('\n=== 60~100 위치 ===')
  targets.forEach(t => {
    const entry = data?.find(r => r.word === t)
    if (entry) {
      const idx = koIds.indexOf(entry.id)
      const day = idx < 36 ? 1 : 2
      console.log(`  ${t} (${entry.meaning_ko}): index ${idx}, Day ${day}`)
    } else {
      console.log(`  ${t}: DB에 없음`)
    }
  })
}
main()
