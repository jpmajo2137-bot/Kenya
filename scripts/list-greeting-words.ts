/**
 * 인사/기본표현 카테고리 단어 목록 출력
 * 인사(유지) vs 기본표현(제외) 구분용
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import classification from '../src/lib/topicClassification'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function main() {
  const data = classification as Record<string, string[]>
  const ids: string[] = []
  for (const [id, arr] of Object.entries(data)) {
    if (Array.isArray(arr) && arr.includes('인사/기본표현')) ids.push(id)
  }

  const rows: { word: string; meaning_ko: string | null; meaning_en: string | null }[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data: r } = await supabase
      .from('generated_vocab')
      .select('word, meaning_ko, meaning_en')
      .in('id', ids.slice(i, i + 100))
    rows.push(...(r ?? []))
  }

  console.log('인사/기본표현 단어 (' + rows.length + '개):\n')
  for (const r of rows) {
    console.log(`${r.word} | KO: ${r.meaning_ko ?? '-'} | EN: ${r.meaning_en ?? '-'}`)
  }
}

main().catch(console.error)
