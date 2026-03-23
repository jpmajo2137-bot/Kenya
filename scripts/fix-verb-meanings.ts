/**
 * "중요하다" 등 한국어 동사(-하다) 단어의 뜻을 동사형으로 수정합니다.
 * - meaning_sw: 형용사 "muhimu" → 동사형 "kuwa muhimu" (to be important)
 * - meaning_en: "significant; important" → "to be important"
 *
 * 사용:
 *   npx tsx scripts/fix-verb-meanings.ts           # 아래 목록 일괄 적용
 *   npx tsx scripts/fix-verb-meanings.ts --search   # '중요' 포함 단어 조회 (DB 확인용)
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

/** 동사형으로 바꿀 단어 목록: [word] => { meaning_sw, meaning_en } */
const VERB_MEANING_UPDATES: Record<string, { meaning_sw: string; meaning_en: string }> = {
  중요하다: {
    meaning_sw: 'kuwa muhimu',
    meaning_en: 'to be important',
  },
}

async function searchWord() {
  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, meaning_sw, meaning_en')
    .eq('mode', 'ko')
    .ilike('word', '%중요%')

  if (error) {
    console.error('조회 실패:', error.message)
    return
  }
  console.log("'중요' 포함 단어 (mode=ko):", data?.length ?? 0, '개\n')
  data?.forEach((r) => {
    console.log(`  word="${r.word}"  meaning_sw="${r.meaning_sw}"  meaning_en="${r.meaning_en}"`)
  })
}

async function main() {
  const doSearch = process.argv.includes('--search')
  if (doSearch) {
    await searchWord()
    return
  }

  console.log('동사형 뜻 수정 스크립트 (중요하다 등)\n')

  for (const [word, meanings] of Object.entries(VERB_MEANING_UPDATES)) {
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_sw, meaning_en')
      .eq('mode', 'ko')
      .eq('word', word)

    if (error) {
      console.error(`❌ ${word} 조회 실패:`, error.message)
      continue
    }

    if (!data || data.length === 0) {
      console.log(`⏭️ ${word}: DB에 없음. 'npx tsx scripts/fix-verb-meanings.ts --search' 로 단어 확인.`)
      continue
    }

    for (const row of data) {
      const { error: updateError } = await supabase
        .from('generated_vocab')
        .update({
          meaning_sw: meanings.meaning_sw,
          meaning_en: meanings.meaning_en,
        })
        .eq('id', row.id)

      if (updateError) {
        console.error(`❌ ${word} (id=${row.id}) 업데이트 실패:`, updateError.message)
      } else {
        console.log(`✅ ${word}`)
        console.log(`   이전: SW "${row.meaning_sw}" / EN "${row.meaning_en}"`)
        console.log(`   이후: SW "${meanings.meaning_sw}" / EN "${meanings.meaning_en}"`)
      }
    }
  }

  console.log('\n완료.')
}

main()
