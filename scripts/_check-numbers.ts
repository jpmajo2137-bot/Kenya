import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!,
)

const EN_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
]

const KO_SINO = ['일','이','삼','사','오','육','칠','팔','구','십']
const KO_NATIVE = ['하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열']

async function main() {
  console.log('=== oxford_vocab 영어 숫자 행 ===')
  const { data: enRows } = await supabase
    .from('oxford_vocab')
    .select('id, word, korean_meaning, category, order_index, image_url, word_audio_url, english_example')
    .in('word', EN_WORDS)
    .order('word', { ascending: true })
  console.log(`총 ${enRows?.length ?? 0}행`)
  for (const r of enRows ?? []) {
    console.log(`  ${r.word.padEnd(12)} | ko="${r.korean_meaning}" | cat=${r.category ?? '-'} | img=${r.image_url ? 'Y' : 'N'} | audio=${r.word_audio_url ? 'Y' : 'N'}`)
  }

  console.log('\n=== 한국어 한자어 숫자 (korean_meaning 기준 일~십) ===')
  const { data: sinoRows } = await supabase
    .from('oxford_vocab')
    .select('word, korean_meaning, category, image_url')
    .in('korean_meaning', KO_SINO)
  for (const r of sinoRows ?? []) {
    console.log(`  ${r.word.padEnd(12)} | ko="${r.korean_meaning}" | cat=${r.category ?? '-'}`)
  }

  console.log('\n=== 한국어 고유어 숫자 (korean_meaning 기준 하나~열) ===')
  const { data: nativeRows } = await supabase
    .from('oxford_vocab')
    .select('word, korean_meaning, category, image_url')
    .in('korean_meaning', KO_NATIVE)
  for (const r of nativeRows ?? []) {
    console.log(`  ${r.word.padEnd(12)} | ko="${r.korean_meaning}" | cat=${r.category ?? '-'}`)
  }

  console.log('\n=== category=\"숫자\" 행 (있다면) ===')
  const { data: cat } = await supabase
    .from('oxford_vocab')
    .select('word, korean_meaning, category')
    .eq('category', '숫자')
  console.log(`${cat?.length ?? 0}개`)

  console.log('\n=== 카테고리 분포 ===')
  const { data: allCat } = await supabase
    .from('oxford_vocab')
    .select('category')
  const counts: Record<string, number> = {}
  for (const r of allCat ?? []) counts[r.category ?? 'null'] = (counts[r.category ?? 'null'] ?? 0) + 1
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
