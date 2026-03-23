/**
 * 인사/기본표현 → 인사만 유지, 기본표현 제외
 * 인사 관련 키워드가 있으면 KEEP, 없으면 EXCLUDE
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import classification from '../src/lib/topicClassification'
import * as fs from 'fs'
import * as path from 'path'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

// 인사(greeting) 관련 - 이게 있으면 유지
const GREETING_KO = ['인사', '안녕', '잘 가', '잘가', '안녕히', '환영', '건배', '인사말', '헤어질', '만났을', '작별']
const GREETING_EN = ['hello', 'hi', 'bye', 'goodbye', 'welcome', 'greet', 'cheers', 'farewell', 'good night', 'good morning', 'good afternoon']
const GREETING_SW = ['jambo', 'habari', 'kwaheri', 'karibu', 'salamu', 'sijambo', 'lala salama', 'usiku', 'asubuhi', 'mchana']

function isGreeting(word: string, meaningKo: string, meaningEn: string, meaningSw: string): boolean {
  const w = (word || '').toLowerCase()
  const ko = (meaningKo || '').toLowerCase()
  const en = (meaningEn || '').toLowerCase()
  const sw = (meaningSw || '').toLowerCase()
  const all = `${w} ${ko} ${en} ${sw}`.toLowerCase()

  if (GREETING_KO.some((k) => all.includes(k))) return true
  if (GREETING_EN.some((k) => all.includes(k))) return true
  if (GREETING_SW.some((k) => all.includes(k))) return true
  return false
}

async function main() {
  const data = classification as Record<string, string[]>
  const ids: string[] = []
  for (const [id, arr] of Object.entries(data)) {
    if (Array.isArray(arr) && arr.includes('인사/기본표현')) ids.push(id)
  }

  const rows: { word: string; meaning_ko: string | null; meaning_en: string | null; meaning_sw: string | null }[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data: r } = await supabase
      .from('generated_vocab')
      .select('word, meaning_ko, meaning_en, meaning_sw')
      .in('id', ids.slice(i, i + 100))
    rows.push(...(r ?? []))
  }

  const exclude: string[] = []
  const keep: string[] = []
  for (const r of rows) {
    const word = r.word ?? ''
    if (!word) continue
    if (isGreeting(word, r.meaning_ko ?? '', r.meaning_en ?? '', r.meaning_sw ?? '')) {
      keep.push(word)
    } else {
      exclude.push(word)
    }
  }

  const outPath = path.join(process.cwd(), 'scripts', '_greeting_exclusions.json')
  fs.writeFileSync(outPath, JSON.stringify(exclude, null, 0), 'utf8')
  console.log('KEEP (인사):', keep.length)
  console.log('EXCLUDE (기본표현/기타):', exclude.length)
  console.log('Wrote exclusions to', outPath)
}

main().catch(console.error)
