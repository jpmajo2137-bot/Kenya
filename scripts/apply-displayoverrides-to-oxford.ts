/**
 * displayOverrides.ts 의 모든 교정값을 Supabase oxford_vocab 테이블에 영구 적용.
 *
 * 적용 대상 (Oxford KO-EN / EN-KO 양방향):
 *   1) korean_meaning  ← WORD_DISPLAY_OVERRIDE / KO_DISPLAY_OVERRIDE_BY_WORD / KO_DISPLAY_OVERRIDE
 *   2) english 글로스(=word 컬럼은 변경하지 않고, korean_example 등 보조 데이터에 한정)
 *      ※ word 컬럼은 학습 대상 식별자이므로 보존. EN_DISPLAY_OVERRIDE_BY_WORD/EN_DISPLAY_OVERRIDE 는
 *        클라이언트에서만 보정한다 (DB 에는 저장하지 않음).
 *   3) korean_example  ← EXAMPLE_DISPLAY_OVERRIDE.text
 *   4) english_example ← EXAMPLE_TRANSLATION_EN_OVERRIDE / EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD.en
 *   5) (없으면 추가) korean_example 도 EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD.ko 가 있으면 우선.
 *
 * dry-run 기본: 어떤 행이 어떻게 바뀌는지 출력만 한다.
 * 실제 반영하려면 `--apply` 플래그.
 *
 * 결과: 변경 행은 stdout 으로 보고하고, 함께 변경된 텍스트의 audio_url 컬럼들을 NULL 로 비워서
 * 후속 TTS 재생성 스크립트(`regen-corrected-oxford-audio.ts`)가 정확히 그 행들만 다시 만들도록 한다.
 *
 * 사용법:
 *   npx tsx scripts/apply-displayoverrides-to-oxford.ts             # dry-run
 *   npx tsx scripts/apply-displayoverrides-to-oxford.ts --apply     # 실제 반영
 *   npx tsx scripts/apply-displayoverrides-to-oxford.ts --apply --no-clear-audio
 *       (오디오 url 을 비우지 않음. 이미 음성이 정확하다고 확신할 때)
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  WORD_DISPLAY_OVERRIDE,
  KO_DISPLAY_OVERRIDE,
  KO_DISPLAY_OVERRIDE_BY_WORD,
  EXAMPLE_DISPLAY_OVERRIDE,
  EXAMPLE_TRANSLATION_KO_OVERRIDE,
  EXAMPLE_TRANSLATION_EN_OVERRIDE,
  EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD,
} from '../src/lib/displayOverrides'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'env missing: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (또는 VITE_SUPABASE_ANON_KEY)',
  )
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const NO_CLEAR_AUDIO = args.has('--no-clear-audio')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

type OxfordRow = {
  id: string
  word: string
  korean_meaning: string | null
  english_example: string | null
  korean_example: string | null
  word_audio_url: string | null
  meaning_audio_url: string | null
  english_example_audio_url: string | null
  korean_example_audio_url: string | null
}

function applyKoDisplay(word: string, rawMeaning: string): string {
  // KO_DISPLAY_OVERRIDE_BY_WORD 는 SW-KO 와 공유라 키가 스와힐리 단어인 경우가 많지만,
  // word(=영어 단어) 와 매칭되는 항목이 있으면 그대로 적용 (예: 'Machi' 같은 일부 항목).
  if (KO_DISPLAY_OVERRIDE_BY_WORD[word]) return KO_DISPLAY_OVERRIDE_BY_WORD[word]
  return KO_DISPLAY_OVERRIDE[rawMeaning] ?? rawMeaning
}

function correctedFor(r: OxfordRow): {
  patch: Partial<OxfordRow>
  audioPatch: Partial<OxfordRow>
  changes: string[]
} {
  const patch: Partial<OxfordRow> = {}
  const audioPatch: Partial<OxfordRow> = {}
  const changes: string[] = []

  // 1) korean_meaning: WORD_DISPLAY_OVERRIDE 우선 → KO_DISPLAY_OVERRIDE_BY_WORD/KO_DISPLAY_OVERRIDE
  const original = r.korean_meaning ?? ''
  const wordOverride = WORD_DISPLAY_OVERRIDE[original]
  const afterWord = wordOverride?.word ?? original
  const finalKorean = applyKoDisplay(r.word, afterWord)
  if (finalKorean !== original) {
    patch.korean_meaning = finalKorean
    audioPatch.meaning_audio_url = null
    changes.push(`korean_meaning: "${original}" → "${finalKorean}"`)
  }

  // 2) korean_example: 단어별 번역 우선 → EXAMPLE_DISPLAY_OVERRIDE → EXAMPLE_TRANSLATION_KO_OVERRIDE
  if (r.korean_example) {
    const wordTrans = EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD[r.word]?.ko
    const exDisplay = EXAMPLE_DISPLAY_OVERRIDE[r.korean_example]?.text
    const exTrans = EXAMPLE_TRANSLATION_KO_OVERRIDE[r.korean_example]
    const finalKoEx = wordTrans ?? exDisplay ?? exTrans ?? r.korean_example
    if (finalKoEx !== r.korean_example) {
      patch.korean_example = finalKoEx
      audioPatch.korean_example_audio_url = null
      changes.push(`korean_example: "${r.korean_example}" → "${finalKoEx}"`)
    }
  }

  // 3) english_example: 단어별 번역 우선 → EXAMPLE_TRANSLATION_EN_OVERRIDE
  if (r.english_example) {
    const wordTrans = EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD[r.word]?.en
    const exTrans = EXAMPLE_TRANSLATION_EN_OVERRIDE[r.english_example]
    const finalEnEx = wordTrans ?? exTrans ?? r.english_example
    if (finalEnEx !== r.english_example) {
      patch.english_example = finalEnEx
      audioPatch.english_example_audio_url = null
      changes.push(`english_example: "${r.english_example}" → "${finalEnEx}"`)
    }
  }

  return { patch, audioPatch, changes }
}

async function fetchAllRows(): Promise<OxfordRow[]> {
  const collected: OxfordRow[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('oxford_vocab')
      .select(
        'id,word,korean_meaning,english_example,korean_example,word_audio_url,meaning_audio_url,english_example_audio_url,korean_example_audio_url',
      )
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    collected.push(...(data as OxfordRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return collected
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`clear_audio_on_change: ${!NO_CLEAR_AUDIO}`)
  console.log()

  console.log('1) oxford_vocab 전체 행 로드 중...')
  const rows = await fetchAllRows()
  console.log(`   총 ${rows.length} 행`)
  console.log()

  console.log('2) 각 행에 displayOverrides 적용해 변경 사항 수집 중...')
  type Update = {
    id: string
    word: string
    patch: Partial<OxfordRow>
    audioPatch: Partial<OxfordRow>
    changes: string[]
  }
  const updates: Update[] = []
  for (const r of rows) {
    const { patch, audioPatch, changes } = correctedFor(r)
    if (changes.length > 0) {
      updates.push({ id: r.id, word: r.word, patch, audioPatch, changes })
    }
  }
  console.log(`   변경 대상: ${updates.length} 행`)
  console.log()

  if (updates.length === 0) {
    console.log('변경 없음. 종료.')
    return
  }

  // 변경 사항 보고
  let reportCount = 0
  for (const u of updates) {
    if (reportCount < 200) {
      console.log(`  • [${u.word}]`)
      for (const c of u.changes) console.log(`      ${c}`)
    }
    reportCount++
  }
  if (reportCount > 200) {
    console.log(`  ... +${reportCount - 200} more`)
  }
  console.log()

  if (!APPLY) {
    console.log('--apply 가 없어 변경을 적용하지 않았습니다. 검토 후 다시 실행하세요.')
    return
  }

  console.log('3) 실제 DB 업데이트 중...')
  let done = 0
  let errors = 0
  for (const u of updates) {
    const fullPatch = NO_CLEAR_AUDIO
      ? u.patch
      : { ...u.patch, ...u.audioPatch }
    const { error } = await supabase
      .from('oxford_vocab')
      .update(fullPatch)
      .eq('id', u.id)
    if (error) {
      console.error(`  ✗ ${u.word}: ${error.message}`)
      errors++
    } else {
      done++
    }
    if (done % 25 === 0 || done === updates.length) {
      process.stdout.write(`  진행 ${done}/${updates.length}\r`)
    }
  }
  console.log()
  console.log()
  console.log(`완료: ${done} 적용 / ${errors} 실패`)
  if (!NO_CLEAR_AUDIO) {
    console.log(
      `audio_url 컬럼은 변경된 텍스트에 한해 NULL 로 비워졌습니다. ` +
        `이제 \`scripts/regen-corrected-oxford-audio.ts\` 를 실행해 TTS 를 재생성하세요.`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
