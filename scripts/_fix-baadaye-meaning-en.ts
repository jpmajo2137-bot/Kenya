/**
 * baadaye 의 DB meaning_en 값을 'future / later' → 'future, later' 로 업데이트.
 * (슬래시 표기 → 쉼표 표기로 정제)
 * 이렇게 해야 앱 코드가 DB URL(Jenny 여성 음성)을 직접 재생하고
 * Web Speech API 폴백으로 빠지지 않음.
 *
 * 실행: npx tsx scripts/_fix-baadaye-meaning-en.ts
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY!,
)

const OLD_VALUE = 'future / later'
const NEW_VALUE = 'future, later'

async function main() {
  // 대상 행 조회
  const { data, error } = await supabase
    .from('generated_vocab')
    .select('id, mode, word, meaning_en, meaning_en_audio_url')
    .eq('meaning_en', OLD_VALUE)
  if (error) throw error

  if (!data?.length) {
    console.log(`"${OLD_VALUE}" 값을 가진 행이 없습니다.`)
    return
  }

  console.log(`대상 ${data.length}개 행:`)
  for (const r of data) {
    console.log(`  word=${r.word}  mode=${r.mode}  id=${r.id}`)
  }

  // meaning_en 값 업데이트
  const { error: upErr } = await supabase
    .from('generated_vocab')
    .update({ meaning_en: NEW_VALUE })
    .eq('meaning_en', OLD_VALUE)
  if (upErr) {
    console.error('❌ 업데이트 실패:', upErr.message)
    process.exit(1)
  }
  console.log(`\n✅ meaning_en: "${OLD_VALUE}" → "${NEW_VALUE}" 업데이트 완료`)
  console.log('현재 meaning_en_audio_url (Jenny 여성 음성) 은 그대로 유지됩니다.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
