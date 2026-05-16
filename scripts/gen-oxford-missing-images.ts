/**
 * oxford_vocab 테이블에서 image_url 이 비어있는 모든 단어에 대해
 *   1) OpenAI gpt-image-1 로 1024x1024 PNG 생성
 *   2) oxford-images 버킷에 `{word}.png` 로 업로드 (upsert)
 *   3) oxford_vocab.image_url 을 public URL 로 UPDATE
 *
 * 멱등 설계:
 *   - 이미 image_url 이 채워진 행은 SELECT 단계에서 제외 → 중간 중단 후 재실행 안전
 *   - Storage 업로드는 upsert=true (덮어쓰기)
 *
 * 실행 예:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/gen-oxford-missing-images.ts
 *   OPENAI_API_KEY=sk-... npx tsx scripts/gen-oxford-missing-images.ts --limit=20 --concurrency=2
 *
 * 옵션:
 *   --limit=N         처음 N개만 처리 (디버깅용)
 *   --concurrency=N   동시 실행 개수 (기본 3)
 *   --dry-run         실제 호출 없이 대상만 표시
 *   --level=A1,A2     특정 레벨만 (CEFR)
 *
 * 필요 환경변수:
 *   OPENAI_API_KEY           (필수)
 *   VITE_SUPABASE_URL        .env 에서 자동 로드
 *   SUPABASE_SERVICE_ROLE_KEY  .env (storage 업로드 + DB update 권한)
 */

import 'dotenv/config'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// ============================================================
// 설정
// ============================================================
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (또는 ANON_KEY) 가 .env 에 필요합니다.')
  process.exit(1)
}
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY 환경변수가 필요합니다.')
  console.error('예) OPENAI_API_KEY=sk-... npx tsx scripts/gen-oxford-missing-images.ts')
  process.exit(1)
}

const IMAGES_BUCKET = 'oxford-images'
const IMAGE_MODEL = 'gpt-image-1'
const IMAGE_SIZE: '1024x1024' = '1024x1024'

// CLI 인자
const argv = process.argv.slice(2)
const argValue = (key: string): string | undefined => {
  for (const a of argv) {
    if (a.startsWith(`--${key}=`)) return a.slice(key.length + 3)
  }
  return undefined
}
const argFlag = (key: string): boolean => argv.includes(`--${key}`)

const LIMIT = argValue('limit') ? Number(argValue('limit')) : undefined
const CONCURRENCY = Math.max(1, Number(argValue('concurrency') ?? '3'))
const DRY_RUN = argFlag('dry-run')
const LEVELS = argValue('level')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ============================================================
// 타입
// ============================================================
interface OxfordRow {
  id: number | string
  word: string
  korean_meaning: string
  english_example: string | null
  korean_example: string | null
  level: string | null
  category: string | null
  image_url: string | null
}

// ============================================================
// 유틸
// ============================================================
async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const run = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try {
        await fn(items[i], i)
      } catch (err) {
        console.error(`[pool] item ${i} 실패:`, err)
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, concurrency) }, () => run())
  await Promise.all(workers)
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1500,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`  [retry ${i + 1}/${retries}] ${label}: ${msg}`)
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}

function sanitizeFileName(word: string): string {
  // oxford-images 버킷은 `{word}.png` 컨벤션
  // Supabase Storage 키는 공백/특수문자 일부 허용하지만 안전하게 정규화
  // 단, 기존 업로드와 일관성 유지 위해 단순화만 (공백 → _ , 슬래시 제거)
  return word.replace(/\s+/g, '_').replace(/[\/\\]/g, '_')
}

function buildPrompt(row: OxfordRow): string {
  const word = row.word
  const meaning = row.korean_meaning || ''
  const example = row.english_example || ''
  const ctxParts: string[] = []
  if (meaning) ctxParts.push(`Korean meaning: "${meaning}"`)
  if (example) ctxParts.push(`Example usage: "${example}"`)
  const ctx = ctxParts.length > 0 ? `\n${ctxParts.join('\n')}` : ''

  return `A simple, clean educational illustration representing the English word "${word}".${ctx}
Style: minimalist flat vector illustration, bright cheerful colors, white or very light background, educational vocabulary flashcard style, single clear subject, easy to recognize at a glance.
IMPORTANT: No text, no letters, no words, no numbers anywhere in the image.`
}

// ============================================================
// 이미지 생성 (gpt-image-1)
// ============================================================
async function generateImageBuffer(prompt: string): Promise<Buffer> {
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: IMAGE_SIZE,
  })
  const item = response.data?.[0]
  if (!item) throw new Error('No image data in response')
  if (item.url) {
    const res = await fetch(item.url)
    if (!res.ok) throw new Error(`download ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  const b64 = (item as Record<string, unknown>).b64_json as string | undefined
  if (b64) return Buffer.from(b64, 'base64')
  throw new Error('No url / b64_json in response')
}

// ============================================================
// 업로드 + DB 업데이트
// ============================================================
async function uploadAndPatch(row: OxfordRow, buf: Buffer): Promise<string> {
  const fileName = `${sanitizeFileName(row.word)}.png`

  const { error: upErr } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(fileName, buf, { contentType: 'image/png', upsert: true })
  if (upErr) throw new Error(`storage upload: ${upErr.message}`)

  const { data: pub } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(fileName)
  const url = pub.publicUrl
  if (!url) throw new Error('getPublicUrl returned empty')

  const { error: dbErr } = await supabase
    .from('oxford_vocab')
    .update({ image_url: url })
    .eq('id', row.id)
  if (dbErr) throw new Error(`db update: ${dbErr.message}`)

  return url
}

// ============================================================
// 대상 행 수집 (image_url IS NULL or empty)
// ============================================================
async function fetchMissingRows(): Promise<OxfordRow[]> {
  const PAGE = 1000
  const out: OxfordRow[] = []
  let from = 0
  while (true) {
    let q = supabase
      .from('oxford_vocab')
      .select('id, word, korean_meaning, english_example, korean_example, level, category, image_url')
      .or('image_url.is.null,image_url.eq.')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (LEVELS && LEVELS.length > 0) q = q.in('level', LEVELS)
    const { data, error } = await q
    if (error) throw new Error(`fetch missing rows: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as OxfordRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

// ============================================================
// 메인
// ============================================================
async function main() {
  console.log('═'.repeat(60))
  console.log(`Oxford vocab → 누락 이미지 생성 (${IMAGE_MODEL} ${IMAGE_SIZE})`)
  console.log('═'.repeat(60))
  console.log(`  Supabase URL : ${SUPABASE_URL}`)
  console.log(`  Bucket       : ${IMAGES_BUCKET}`)
  console.log(`  Concurrency  : ${CONCURRENCY}`)
  console.log(`  Limit        : ${LIMIT ?? '(전체)'}`)
  console.log(`  Levels       : ${LEVELS?.join(',') ?? '(전체)'}`)
  console.log(`  Dry-run      : ${DRY_RUN ? 'yes' : 'no'}`)
  console.log('')

  console.log('대상 행 조회 중...')
  let rows = await fetchMissingRows()
  console.log(`  → image_url 비어있는 행: ${rows.length}개`)
  if (LIMIT) {
    rows = rows.slice(0, LIMIT)
    console.log(`  → --limit ${LIMIT} 적용, 처리 대상: ${rows.length}개`)
  }
  if (rows.length === 0) {
    console.log('처리할 행이 없습니다.')
    return
  }

  // 비용 추정 (gpt-image-1 standard 1024x1024 ≈ $0.04/장)
  const estCost = (rows.length * 0.04).toFixed(2)
  console.log(`  추정 비용    : ~$${estCost} (gpt-image-1 standard 1024x1024 기준)`)
  console.log('')

  if (DRY_RUN) {
    console.log('--- DRY-RUN: 처음 10개 미리보기 ---')
    for (const r of rows.slice(0, 10)) {
      console.log(`  ${r.id} | ${r.word} (${r.level || '-'}) | ${r.korean_meaning}`)
    }
    console.log('...')
    console.log('--dry-run 옵션 → 실제 호출 없이 종료')
    return
  }

  let done = 0
  let success = 0
  let failed = 0
  const startedAt = Date.now()

  await pool(rows, CONCURRENCY, async (row) => {
    const tag = `[${row.id}] ${row.word}`
    try {
      const prompt = buildPrompt(row)
      const buf = await withRetry(`gen ${tag}`, () => generateImageBuffer(prompt), 3, 2000)
      const url = await withRetry(`upload ${tag}`, () => uploadAndPatch(row, buf), 3, 1000)
      success++
      console.log(`  ✓ ${tag} → ${url}`)
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${tag}: ${msg}`)
    } finally {
      done++
      if (done % 10 === 0 || done === rows.length) {
        const elapsed = Math.round((Date.now() - startedAt) / 1000)
        const rate = done / Math.max(1, elapsed)
        const remaining = Math.round((rows.length - done) / Math.max(0.01, rate))
        console.log(
          `  진행 ${done}/${rows.length} (성공 ${success}, 실패 ${failed}) · ${elapsed}s 경과 · 남은 시간 ~${remaining}s`,
        )
      }
    }
  })

  console.log('')
  console.log('═'.repeat(60))
  console.log(`완료: 성공 ${success}, 실패 ${failed} / 총 ${rows.length}`)
  console.log('═'.repeat(60))
  if (failed > 0) {
    console.log('실패한 행은 다시 실행하면 자동으로 재시도됩니다 (멱등).')
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
