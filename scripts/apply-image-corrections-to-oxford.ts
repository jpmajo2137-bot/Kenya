/**
 * Oxford 사진(이미지) 교정 데이터를 oxford_vocab.image_url 에 반영.
 *
 * 입력 형식 (3가지 중 하나 자동 감지):
 *
 *   1) JSON 매핑 파일: { "<word>": "<imageUrl 또는 로컬파일경로>" } 형식
 *      ↳ URL 이면 그대로 image_url 에 PATCH.
 *      ↳ 로컬 파일 경로(.png/.jpg/.jpeg/.webp) 면 oxford-images 버킷에 {word}.png 로 업로드 후
 *         publicUrl 을 image_url 에 PATCH.
 *
 *   2) CSV 매핑 파일 (헤더: word, image_url 또는 word, file 또는 word, path)
 *      ↳ JSON 과 동일 규칙으로 처리.
 *
 *   3) 로컬 디렉토리 (--images-dir=PATH): {word}.png / {word}.jpg / {word}.webp 패턴으로
 *      디렉토리를 스캔해 모든 행을 oxford-images 버킷에 업로드 후 publicUrl 로 PATCH.
 *
 * 사용법:
 *   # JSON
 *   npx tsx scripts/apply-image-corrections-to-oxford.ts --map=path/to/images.json
 *   # CSV
 *   npx tsx scripts/apply-image-corrections-to-oxford.ts --map=path/to/images.csv
 *   # 디렉토리
 *   npx tsx scripts/apply-image-corrections-to-oxford.ts --images-dir=/path/to/oxford_images_corrected
 *   # 적용
 *   npx tsx scripts/apply-image-corrections-to-oxford.ts --map=... --apply
 *
 * 옵션:
 *   --apply               실제 반영 (기본은 dry-run)
 *   --concurrency=8       업로드 병렬 수
 *   --bucket=oxford-images
 *   --skip-existing       이미 image_url 이 있는 행은 건너뛰기 (덮어쓰기 안 함)
 *
 * 필요 env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (또는 VITE_SUPABASE_ANON_KEY)
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'env missing: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (또는 VITE_SUPABASE_ANON_KEY)',
  )
  process.exit(1)
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const SKIP_EXISTING = args.includes('--skip-existing')
const argValue = (key: string): string | undefined => {
  for (const a of args) {
    if (a.startsWith(`--${key}=`)) return a.slice(key.length + 3)
  }
  return undefined
}
const MAP_FILE = argValue('map')
const IMAGES_DIR = argValue('images-dir')
const CONCURRENCY = Math.max(1, Number(argValue('concurrency') ?? '8'))
const BUCKET = argValue('bucket') ?? 'oxford-images'

if (!MAP_FILE && !IMAGES_DIR) {
  console.error('필요: --map=<file> 또는 --images-dir=<dir> 중 하나를 지정하세요.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

type WordToImage = Record<string, string> // word → URL or local path

const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp']

function looksLikeUrl(v: string): boolean {
  return /^https?:\/\//i.test(v)
}

function parseCsv(text: string): Record<string, string>[] {
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
        } else inQuotes = false
      } else field += ch
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
      } else field += ch
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (row[i] ?? '').trim()
    })
    return obj
  })
}

function loadMapping(): WordToImage {
  if (MAP_FILE) {
    if (!fs.existsSync(MAP_FILE)) {
      console.error(`매핑 파일을 찾을 수 없습니다: ${MAP_FILE}`)
      process.exit(1)
    }
    const text = fs.readFileSync(MAP_FILE, 'utf-8')
    if (MAP_FILE.toLowerCase().endsWith('.json')) {
      const obj = JSON.parse(text) as Record<string, string>
      return obj
    }
    if (MAP_FILE.toLowerCase().endsWith('.csv')) {
      const rows = parseCsv(text)
      const out: WordToImage = {}
      for (const r of rows) {
        const w = (r.word ?? r.Word ?? '').trim()
        const url = (r.image_url ?? r.url ?? r.file ?? r.path ?? r.image ?? '').trim()
        if (w && url) out[w] = url
      }
      return out
    }
    console.error('지원되지 않는 매핑 파일 확장자(.json / .csv 만 지원).')
    process.exit(1)
  }
  // images dir mode
  if (!IMAGES_DIR || !fs.existsSync(IMAGES_DIR)) {
    console.error(`이미지 디렉토리를 찾을 수 없습니다: ${IMAGES_DIR}`)
    process.exit(1)
  }
  const out: WordToImage = {}
  for (const f of fs.readdirSync(IMAGES_DIR)) {
    const ext = path.extname(f).toLowerCase()
    if (!IMG_EXTS.includes(ext)) continue
    const base = path.basename(f, ext)
    out[base] = path.join(IMAGES_DIR, f)
  }
  return out
}

async function pool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let next = 0
  const run = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try {
        await fn(items[i])
      } catch (e) {
        console.error(`pool ${i}:`, e)
      }
    }
  }
  await Promise.all(Array.from({ length: n }, () => run()))
}

async function fetchExistingRows(words: string[]): Promise<Map<string, { id: string; image_url: string | null }>> {
  // chunk in() to stay within 1000 limit
  const result = new Map<string, { id: string; image_url: string | null }>()
  const CHUNK = 500
  for (let i = 0; i < words.length; i += CHUNK) {
    const slice = words.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('oxford_vocab')
      .select('id,word,image_url')
      .in('word', slice)
    if (error) throw error
    for (const r of (data ?? []) as { id: string; word: string; image_url: string | null }[]) {
      result.set(r.word, { id: r.id, image_url: r.image_url })
    }
  }
  return result
}

function publicUrl(filePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

async function uploadLocal(file: string, word: string): Promise<string> {
  const ext = path.extname(file).toLowerCase()
  const remoteName = `${word}${ext}`
  const buf = fs.readFileSync(file)
  const contentType =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg'
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(remoteName, buf, { contentType, upsert: true })
  if (error) throw error
  return publicUrl(remoteName)
}

async function main() {
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`source: ${MAP_FILE ?? IMAGES_DIR}`)
  console.log(`bucket: ${BUCKET}`)
  console.log(`skip_existing: ${SKIP_EXISTING}`)
  console.log()

  const mapping = loadMapping()
  const words = Object.keys(mapping)
  console.log(`매핑 항목: ${words.length} 단어`)
  if (words.length === 0) {
    console.log('매핑이 비어 있어 종료.')
    return
  }

  console.log()
  console.log('1) DB 매칭 행 조회...')
  const existing = await fetchExistingRows(words)
  const matched = words.filter((w) => existing.has(w))
  const missing = words.filter((w) => !existing.has(w))
  console.log(`   매칭: ${matched.length}, 누락(=oxford_vocab 없음): ${missing.length}`)
  if (missing.length > 0) {
    console.log(`   누락 단어 일부: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' ...' : ''}`)
  }

  // skip existing
  const targets = matched.filter((w) => {
    if (!SKIP_EXISTING) return true
    return !existing.get(w)?.image_url
  })
  console.log(`   적용 대상: ${targets.length}`)
  console.log()

  // 보고
  for (const w of targets.slice(0, 50)) {
    const v = mapping[w]
    console.log(`  • ${w} → ${looksLikeUrl(v) ? '(URL)' : '(local)'} ${v}`)
  }
  if (targets.length > 50) console.log(`  ... +${targets.length - 50} more`)
  console.log()

  if (!APPLY) {
    console.log('--apply 가 없어 변경을 적용하지 않았습니다. 검토 후 다시 실행하세요.')
    return
  }

  console.log('2) 업로드(필요시) + image_url PATCH 진행...')
  let done = 0
  let uploaded = 0
  let errors = 0
  await pool(targets, CONCURRENCY, async (word) => {
    const v = mapping[word]
    const dbRow = existing.get(word)!
    try {
      let url = v
      if (!looksLikeUrl(v)) {
        url = await uploadLocal(v, word)
        uploaded++
      }
      const { error } = await supabase
        .from('oxford_vocab')
        .update({ image_url: url })
        .eq('id', dbRow.id)
      if (error) throw error
      done++
      if (done % 25 === 0 || done === targets.length) {
        process.stdout.write(`  진행 ${done}/${targets.length} (업로드 ${uploaded})\r`)
      }
    } catch (e) {
      errors++
      console.error(`  ✗ ${word}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
  console.log()
  console.log(`완료: ${done} PATCH, ${uploaded} 업로드, ${errors} 실패`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
