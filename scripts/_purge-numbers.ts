/**
 * 숫자 단어 73 행 + 관련 storage 파일을 모두 삭제.
 *
 * 1) oxford_vocab 의 숫자 word 행 DELETE
 * 2) oxford-images bucket: {word}.png / {word}.svg 삭제
 * 3) oxford-tts bucket: numbers/{id}/ 디렉토리(파일 4개) 삭제
 *
 * 멱등: 이미 없는 파일은 silently skip.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('env missing'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const IMG_BUCKET = 'oxford-images'
const TTS_BUCKET = 'oxford-tts'

const NUMBER_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'forty','fifty','sixty','seventy','eighty','ninety','hundred',
]

async function main() {
  // 1) 행 id 수집 (storage TTS 경로용)
  const { data: rows, error: selErr } = await supabase
    .from('oxford_vocab')
    .select('id, word')
    .in('word', NUMBER_WORDS)
  if (selErr) { console.error('select:', selErr.message); process.exit(1) }
  const ids = (rows ?? []).map(r => r.id as string)
  console.log(`대상 행: ${ids.length}`)

  // 2) Storage: TTS 파일 (numbers/{id}/*.mp3) — 행마다 4개
  const ttsPaths: string[] = []
  for (const id of ids) {
    for (const f of ['word_en.mp3','meaning_ko.mp3','example_en.mp3','example_ko.mp3']) {
      ttsPaths.push(`numbers/${id}/${f}`)
    }
  }
  if (ttsPaths.length > 0) {
    // 100개씩 잘라서 remove
    const batch = 100
    let removed = 0
    for (let i = 0; i < ttsPaths.length; i += batch) {
      const slice = ttsPaths.slice(i, i + batch)
      const { data, error } = await supabase.storage.from(TTS_BUCKET).remove(slice)
      if (error) console.warn(`  tts remove ${i}: ${error.message}`)
      removed += data?.length ?? 0
    }
    console.log(`TTS 파일 삭제: ${removed} / ${ttsPaths.length}`)
  }

  // 3) Storage: 이미지 (word 기반, png/svg 둘 다 시도)
  const imgPaths: string[] = []
  for (const w of NUMBER_WORDS) {
    imgPaths.push(`${w}.png`, `${w}.svg`)
  }
  const { data: imgDel, error: imgErr } = await supabase.storage.from(IMG_BUCKET).remove(imgPaths)
  if (imgErr) console.warn(`  img remove: ${imgErr.message}`)
  console.log(`이미지 파일 삭제: ${imgDel?.length ?? 0} / ${imgPaths.length}`)

  // 4) DB DELETE
  const { error: delErr, count } = await supabase
    .from('oxford_vocab')
    .delete({ count: 'exact' })
    .in('word', NUMBER_WORDS)
  if (delErr) { console.error('delete:', delErr.message); process.exit(1) }
  console.log(`DB 행 삭제: ${count ?? '?'}`)

  console.log('═'.repeat(50))
  console.log('완료')
}

main().catch(e => { console.error(e); process.exit(1) })
