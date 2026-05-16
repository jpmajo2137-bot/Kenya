/**
 * Oxford 5000 데이터 → Supabase 업로드
 *
 * 단계:
 *   1) CSV 파싱 → oxford_vocab 테이블에 URL 없이 upsert (DB 우선 채워서 앱 즉시 동작)
 *   2) 이미지 업로드 (oxford-images 버킷)
 *   3) 오디오 업로드 (oxford-tts 버킷)
 *   4) 행 update로 URL 채움
 *
 * 멱등(idempotent) 설계:
 *   - 기존 행은 upsert
 *   - Storage는 list로 존재 확인 후 스킵
 *   - 중간에 끊겨도 재실행하면 이어 받음
 *
 * 사용법:
 *   1) .env에 SUPABASE_SERVICE_ROLE_KEY, OXFORD_DATA_DIR 설정
 *   2) npx tsx scripts/upload-oxford-to-supabase.ts
 *   3) 옵션:
 *       --skip-upsert   : 1단계(DB upsert) 건너뛰기
 *       --skip-images   : 2단계(이미지) 건너뛰기
 *       --skip-audio    : 3단계(오디오) 건너뛰기
 *       --concurrency=8 : 병렬 업로드 수 (기본 8)
 *       --limit=100     : 처음 N개만 처리 (디버그)
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================
// 설정
// ============================================================
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const OXFORD_DIR = process.env.OXFORD_DATA_DIR

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (또는 ANON_KEY) 가 .env에 필요합니다.')
  process.exit(1)
}
if (!OXFORD_DIR) {
  console.error('OXFORD_DATA_DIR가 .env에 필요합니다.')
  console.error('예) OXFORD_DATA_DIR="/Users/.../앱 만들기 자료"')
  process.exit(1)
}

// 분류된 CSV가 있으면 우선 사용 (scripts/classify-oxford.ts 결과)
const CATEGORIZED_CSV = path.join(__dirname, '_oxford_categorized.csv')
const PERFECT_CSV = path.join(OXFORD_DIR, 'oxford_5000_with_tts(Perfect).csv')
const CSV_PATH = fs.existsSync(CATEGORIZED_CSV) ? CATEGORIZED_CSV : PERFECT_CSV
const IMAGES_DIR = path.join(OXFORD_DIR, 'oxford_5000_images')
const TTS_DIR = path.join(OXFORD_DIR, 'oxford_5000_tts')

const IMAGES_BUCKET = 'oxford-images'
const TTS_BUCKET = 'oxford-tts'

const args = new Set(process.argv.slice(2))
const argValue = (key: string): string | undefined => {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(`--${key}=`)) return a.slice(key.length + 3)
  }
  return undefined
}

const SKIP_UPSERT = args.has('--skip-upsert')
const SKIP_IMAGES = args.has('--skip-images')
const SKIP_AUDIO = args.has('--skip-audio')
const CONCURRENCY = Number(argValue('concurrency') ?? '8')
const LIMIT = argValue('limit') ? Number(argValue('limit')) : undefined

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ============================================================
// CSV 파서 (간단한 RFC 4180 호환, csv-parse 의존 제거)
// ============================================================
function parseCsv(text: string): Record<string, string>[] {
  // UTF-8 BOM 제거 (Excel/Numbers에서 저장된 CSV에 흔히 붙음)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') {
        cur.push(field)
        field = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        cur.push(field)
        field = ''
        if (cur.length > 1 || cur[0] !== '') rows.push(cur)
        cur = []
      } else {
        field += ch
      }
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? ''
    })
    return obj
  })
}

// ============================================================
// 유틸: 동시 실행 풀
// ============================================================
async function pool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
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

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}

// ============================================================
// Storage 존재 확인 (디렉토리 단위로 한번에 list 캐싱)
// ============================================================
const storageListCache = new Map<string, Set<string>>()

async function listStorageDir(bucket: string, dir: string): Promise<Set<string>> {
  const key = `${bucket}::${dir}`
  if (storageListCache.has(key)) return storageListCache.get(key)!
  const set = new Set<string>()
  let offset = 0
  const limit = 1000
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(dir, { limit, offset })
    if (error) {
      console.warn(`[list ${bucket}/${dir}] ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    for (const f of data) set.add(f.name)
    if (data.length < limit) break
    offset += limit
  }
  storageListCache.set(key, set)
  return set
}

function publicUrl(bucket: string, filePath: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
  return data.publicUrl
}

// ============================================================
// 1단계: CSV → DB upsert
// ============================================================
async function stepUpsertRows(rows: Record<string, string>[]): Promise<void> {
  console.log(`[1/4] DB upsert: ${rows.length}개 행`)
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const records = slice.map((r, idx) => {
      const diffRaw = r.difficulty?.trim()
      const difficulty = diffRaw ? Number(diffRaw) : null
      return {
        word: r.word.trim(),
        korean_meaning: (r.korean_meaning ?? '').trim(),
        level: r.level?.trim() || null,
        english_example: r.english_translation?.trim() || null,
        korean_example: r.korean_example?.trim() || null,
        order_index: i + idx,
        category: r.category?.trim() || null,
        difficulty: Number.isFinite(difficulty) ? difficulty : null,
      }
    }).filter((r) => r.word && r.korean_meaning)

    if (records.length === 0) continue
    const { error } = await supabase
      .from('oxford_vocab')
      .upsert(records, { onConflict: 'word', ignoreDuplicates: false })
    if (error) {
      console.error(`[upsert ${i}] ${error.message}`)
      continue
    }
    inserted += records.length
    process.stdout.write(`  ${inserted}/${rows.length}\r`)
  }
  console.log(`\n[1/4] 완료: ${inserted}개 upsert`)
}

// ============================================================
// 2단계: 이미지 업로드
// ============================================================
async function stepUploadImages(rows: Record<string, string>[]): Promise<void> {
  console.log(`[2/4] 이미지 업로드 (concurrency=${CONCURRENCY})`)
  const existing = await listStorageDir(IMAGES_BUCKET, '')
  console.log(`  버킷에 이미 ${existing.size}개 존재`)

  let done = 0
  let skipped = 0
  let uploaded = 0
  let missing = 0

  await pool(rows, CONCURRENCY, async (r) => {
    const word = r.word.trim()
    const fileName = r.image_file?.trim() || `${word}.png`
    const localPath = path.join(IMAGES_DIR, fileName)

    if (!fs.existsSync(localPath)) {
      missing++
    } else if (existing.has(fileName)) {
      skipped++
    } else {
      try {
        const buf = fs.readFileSync(localPath)
        await withRetry(async () => {
          const { error } = await supabase.storage
            .from(IMAGES_BUCKET)
            .upload(fileName, buf, { contentType: 'image/png', upsert: true })
          if (error) throw error
        })
        uploaded++
      } catch (err) {
        console.error(`  [img ${word}] ${(err as Error).message}`)
      }
    }
    done++
    if (done % 50 === 0) process.stdout.write(`  ${done}/${rows.length} (up=${uploaded} skip=${skipped} miss=${missing})\r`)
  })
  console.log(`\n[2/4] 완료: 업로드=${uploaded}, 스킵=${skipped}, 누락=${missing}`)
}

// ============================================================
// 3단계: 오디오 업로드 ({word}/{word}_*.mp3)
// ============================================================
type AudioKind = 'word_en' | 'meaning_ko' | 'example_en' | 'example_ko'

async function stepUploadAudio(rows: Record<string, string>[]): Promise<void> {
  console.log(`[3/4] 오디오 업로드 (concurrency=${CONCURRENCY})`)
  const kinds: AudioKind[] = ['word_en', 'meaning_ko', 'example_en', 'example_ko']

  let done = 0
  let uploaded = 0
  let skipped = 0
  let missing = 0

  await pool(rows, CONCURRENCY, async (r) => {
    const word = r.word.trim()
    if (!word) return
    // 단어별 디렉토리 list 캐싱
    const existing = await listStorageDir(TTS_BUCKET, word)
    for (const kind of kinds) {
      const fileName = `${word}_${kind}.mp3`
      const remotePath = `${word}/${fileName}`
      const localPath = path.join(TTS_DIR, word, fileName)
      if (!fs.existsSync(localPath)) {
        missing++
        continue
      }
      if (existing.has(fileName)) {
        skipped++
        continue
      }
      try {
        const buf = fs.readFileSync(localPath)
        await withRetry(async () => {
          const { error } = await supabase.storage
            .from(TTS_BUCKET)
            .upload(remotePath, buf, { contentType: 'audio/mpeg', upsert: true })
          if (error) throw error
        })
        uploaded++
      } catch (err) {
        console.error(`  [aud ${word}/${kind}] ${(err as Error).message}`)
      }
    }
    done++
    if (done % 25 === 0) process.stdout.write(`  ${done}/${rows.length} (up=${uploaded} skip=${skipped} miss=${missing})\r`)
  })
  console.log(`\n[3/4] 완료: 업로드=${uploaded}, 스킵=${skipped}, 누락=${missing}`)
}

// ============================================================
// 4단계: 행에 URL 채움
// ============================================================
async function stepUpdateUrls(rows: Record<string, string>[]): Promise<void> {
  console.log(`[4/4] URL 업데이트`)
  const BATCH = 100
  let updated = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    await pool(slice, CONCURRENCY, async (r) => {
      const word = r.word.trim()
      if (!word) return
      const imageFile = r.image_file?.trim() || `${word}.png`
      const update: Record<string, string | null> = {
        image_url: publicUrl(IMAGES_BUCKET, imageFile),
        word_audio_url: publicUrl(TTS_BUCKET, `${word}/${word}_word_en.mp3`),
        meaning_audio_url: publicUrl(TTS_BUCKET, `${word}/${word}_meaning_ko.mp3`),
        english_example_audio_url: publicUrl(TTS_BUCKET, `${word}/${word}_example_en.mp3`),
        korean_example_audio_url: publicUrl(TTS_BUCKET, `${word}/${word}_example_ko.mp3`),
      }
      const { error } = await supabase.from('oxford_vocab').update(update).eq('word', word)
      if (error) console.warn(`  [url ${word}] ${error.message}`)
      else updated++
    })
    process.stdout.write(`  ${updated}/${rows.length}\r`)
  }
  console.log(`\n[4/4] 완료: ${updated}개 업데이트`)
}

// ============================================================
// 메인
// ============================================================
async function main() {
  console.log(`Oxford 5000 → Supabase 업로드`)
  console.log(`  CSV : ${CSV_PATH}`)
  console.log(`  이미지: ${IMAGES_DIR}`)
  console.log(`  오디오: ${TTS_DIR}`)
  console.log(`  버킷  : ${IMAGES_BUCKET}, ${TTS_BUCKET}`)
  console.log(``)

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV 파일을 찾을 수 없습니다: ${CSV_PATH}`)
    process.exit(1)
  }

  const text = fs.readFileSync(CSV_PATH, 'utf-8')
  let rows = parseCsv(text)
  if (LIMIT) rows = rows.slice(0, LIMIT)
  console.log(`총 ${rows.length}개 행`)

  if (!SKIP_UPSERT) await stepUpsertRows(rows)
  if (!SKIP_IMAGES) await stepUploadImages(rows)
  if (!SKIP_AUDIO) await stepUploadAudio(rows)
  await stepUpdateUrls(rows)

  console.log(`\n완료.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
