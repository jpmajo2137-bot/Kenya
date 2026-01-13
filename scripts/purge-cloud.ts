/**
 * 클라우드 전체 삭제 스크립트 (Supabase)
 * - generated_vocab: 모든 행 삭제(배치)
 * - Storage bucket vocabaudio: 모든 파일 삭제(하위 폴더 포함, 재귀)
 *
 * 실행:
 *   npx tsx scripts/purge-cloud.ts
 *
 * 요구:
 * - .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * - RLS가 delete를 허용해야 함(막히면 안내 메시지 출력)
 */

import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'vocabaudio'

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing env vars. Check .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
  }
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function listAllStoragePaths(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  // BFS over prefixes
  const paths: string[] = []
  const q: string[] = ['']
  const seen = new Set<string>()

  while (q.length) {
    const prefix = q.shift()!
    if (seen.has(prefix)) continue
    seen.add(prefix)

    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
    if (error) {
      throw new Error(`Storage list failed at prefix "${prefix}": ${error.message}`)
    }
    if (!data || data.length === 0) continue

    for (const entry of data) {
      const name = entry.name
      const full = prefix ? `${prefix}/${name}` : name

      // 폴더/파일 구분이 애매해서, "폴더일 가능성"을 넓게 잡고 재귀 시도
      // - 스토리지 폴더는 대개 id/metadata가 비어있고 확장자가 없는 경우가 많음
      const looksLikeFolder = !name.includes('.') && (entry.id === null || entry.metadata === null)

      if (looksLikeFolder) {
        q.push(full)
        continue
      }

      paths.push(full)
    }
  }

  return paths
}

async function purgeStorage(supabase: ReturnType<typeof createClient>) {
  console.log(`\n2️⃣ Storage 버킷(${BUCKET}) 파일 전체 삭제 중...`)

  const allPaths = await listAllStoragePaths(supabase)
  console.log(`   - 발견한 파일: ${allPaths.length}개`)

  if (allPaths.length === 0) {
    console.log('   ℹ️ 삭제할 파일이 없습니다.')
    return
  }

  const batches = chunk(allPaths, 100)
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i]!
    const { error } = await supabase.storage.from(BUCKET).remove(b)
    if (error) {
      throw new Error(`Storage remove failed (batch ${i + 1}/${batches.length}): ${error.message}`)
    }
    console.log(`   - 삭제 진행: ${i + 1}/${batches.length}`)
  }

  console.log('   ✅ Storage 파일 삭제 완료')
}

async function purgeGeneratedVocab(supabase: ReturnType<typeof createClient>) {
  console.log('1️⃣ DB(generated_vocab) 전체 삭제 중...')

  const { data: ids, error: selErr } = await supabase.from('generated_vocab').select('id')
  if (selErr) {
    throw new Error(`Select ids failed: ${selErr.message}`)
  }

  const allIds = (ids ?? []).map((r: { id: string }) => r.id).filter(Boolean)
  console.log(`   - 발견한 행: ${allIds.length}개`)

  if (allIds.length === 0) {
    console.log('   ℹ️ 삭제할 행이 없습니다.')
    return
  }

  const batches = chunk(allIds, 200)
  let deletedTotal = 0
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i]!
    const { data: deleted, error } = await supabase.from('generated_vocab').delete().in('id', b).select('id')
    if (error) {
      const msg =
        `Delete failed (batch ${i + 1}/${batches.length}): ${error.message}\n` +
        `\nRLS로 막혔다면 Supabase SQL Editor에서 아래를 실행하세요:\n` +
        `  DELETE FROM generated_vocab;`
      throw new Error(msg)
    }
    deletedTotal += (deleted ?? []).length
    console.log(`   - 삭제 진행: ${i + 1}/${batches.length}`)
  }

  if (deletedTotal === 0) {
    console.log('   ⚠️ 삭제 결과가 0개입니다. (대부분 RLS로 인해 삭제가 허용되지 않을 때 발생)')
    console.log('   👉 진짜 삭제가 필요하면 .env에 SUPABASE_SERVICE_ROLE_KEY를 추가한 뒤 다시 실행하세요.')
    console.log('   👉 대신, 지금은 데이터 내용을 무력화(삭제 처리)로 전환합니다...')
    await sanitizeGeneratedVocab(supabase, allIds)
  } else {
    console.log(`   ✅ DB 행 삭제 완료 (${deletedTotal}개)`)
  }
}

async function sanitizeGeneratedVocab(supabase: ReturnType<typeof createClient>, ids: string[]) {
  // 삭제 권한이 없을 때: 실제 텍스트/발음/번역/오디오 URL을 전부 제거(placeholder로 덮어쓰기)
  // 주의: mode+word unique 제약이 있으므로, word는 id를 섞어 고유하게 만듭니다.
  const batches = chunk(ids, 50)
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i]!
    // 각 row별로 고유 word가 필요해서 개별 update 수행
    for (const id of b) {
      const w = `__deleted__${id.slice(0, 8)}`
      const { data: updated, error } = await supabase
        .from('generated_vocab')
        .update({
          word: w,
          word_pronunciation: 'deleted',
          word_audio_url: null,
          meaning_sw: 'deleted',
          meaning_sw_pronunciation: 'deleted',
          meaning_sw_audio_url: null,
          meaning_ko: 'deleted',
          meaning_ko_pronunciation: 'deleted',
          meaning_ko_audio_url: null,
          meaning_en: 'deleted',
          meaning_en_pronunciation: 'deleted',
          meaning_en_audio_url: null,
          example: 'deleted',
          example_pronunciation: 'deleted',
          example_audio_url: null,
          example_translation_sw: 'deleted',
          example_translation_ko: 'deleted',
          example_translation_en: 'deleted',
          pos: 'deleted',
          category: 'deleted',
          difficulty: 1,
        })
        .eq('id', id)
        .select('id')
      if (error) throw new Error(`Sanitize failed for id=${id}: ${error.message}`)
      if (!updated || updated.length === 0) {
        throw new Error(
          `Sanitize affected 0 rows for id=${id}. (RLS로 update가 허용되지 않을 가능성이 큽니다)\n` +
            `👉 .env에 SUPABASE_SERVICE_ROLE_KEY를 추가한 뒤 다시 실행하세요.`,
        )
      }
    }
    console.log(`   - 무력화 진행: ${i + 1}/${batches.length}`)
  }
  console.log('   ✅ 데이터 무력화(내용 삭제) 완료')
}

async function verify(supabase: ReturnType<typeof createClient>) {
  console.log('\n3️⃣ 삭제 후 확인...')
  const { count, error } = await supabase.from('generated_vocab').select('id', { count: 'exact', head: true })
  if (error) {
    console.log(`   ⚠️ DB 카운트 확인 실패: ${error.message}`)
  } else {
    console.log(`   - generated_vocab 남은 행: ${count ?? 0}개`)
  }

  const { data: root, error: listErr } = await supabase.storage.from(BUCKET).list('', { limit: 5 })
  if (listErr) {
    console.log(`   ⚠️ Storage 확인 실패: ${listErr.message}`)
  } else {
    console.log(`   - Storage 루트 샘플(${root?.length ?? 0}개)`)
  }
}

async function main() {
  assertEnv()
  const keyToUse = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
  const supabase = createClient(SUPABASE_URL!, keyToUse!)

  console.log('🗑️ 클라우드 전체 삭제 시작 (DB + Storage)')
  await purgeGeneratedVocab(supabase)
  await purgeStorage(supabase)
  await verify(supabase)
  console.log('\n✅ 클라우드 삭제 완료')
}

main().catch((e) => {
  console.error('❌ purge-cloud 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})


