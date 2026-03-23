/**
 * 특정 meaning_en의 음성 URL을 null로 설정 (소리 안 나게)
 * 사용: npx tsx scripts/mute-meaning-en-audio.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

/** 음성 제거할 meaning_en 목록 */
const MEANING_EN_TO_MUTE: string[] = []

async function main() {
  console.log('영어 뜻 음성 제거 (meaning_en_audio_url → null)\n')

  for (const meaningEn of MEANING_EN_TO_MUTE) {
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, word, mode, meaning_en')
      .eq('meaning_en', meaningEn)

    if (error) {
      console.error(`❌ "${meaningEn}" 조회 실패:`, error.message)
      continue
    }

    if (!data || data.length === 0) {
      console.log(`⏭️ "${meaningEn}" 단어 없음`)
      continue
    }

    for (const row of data) {
      console.log(`  ${row.word} (${row.mode}) id=${row.id}`)
    }

    const ids = data.map((r) => r.id)
    const { error: updateError } = await supabase
      .from('generated_vocab')
      .update({ meaning_en_audio_url: null })
      .in('id', ids)

    if (updateError) {
      console.error(`❌ 업데이트 실패: ${updateError.message}`)
    } else {
      console.log(`✅ ${ids.length}건 음성 제거 완료\n`)
    }
  }

  console.log('완료.')
}

main()
