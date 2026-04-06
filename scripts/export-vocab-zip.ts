/**
 * 모든 단어장 데이터를 교정(오버라이드) 적용 후 ZIP으로 내보내기
 * 오디오(TTS) 및 이미지 파일도 실제 파일로 다운로드하여 포함
 *
 * 사용: npx tsx scripts/export-vocab-zip.ts
 *
 * 출력: exports/kenya-vocab-export-{timestamp}.zip
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import archiver from 'archiver'
import { koModeSwahiliPronDisplay } from '../src/lib/swahiliPronDisplay'
import {
  KO_DISPLAY_OVERRIDE,
  KO_DISPLAY_OVERRIDE_BY_WORD,
  EN_DISPLAY_OVERRIDE,
  EN_DISPLAY_OVERRIDE_BY_WORD,
  EN_DISPLAY_OVERRIDE_BY_EXAMPLE,
  SW_DISPLAY_OVERRIDE,
  SW_DISPLAY_OVERRIDE_BY_WORD,
  EXAMPLE_DISPLAY_OVERRIDE,
  EXAMPLE_TRANSLATION_KO_OVERRIDE,
  EXAMPLE_TRANSLATION_EN_OVERRIDE,
  EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD,
  WORD_DISPLAY_OVERRIDE,
} from '../src/lib/displayOverrides'
import { stripKoreanFromEnDisplay } from '../src/lib/meaningEnTts'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Helpers ───

function safeName(text: string): string {
  return text.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_').slice(0, 60)
}

async function downloadFile(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return null
    return Buffer.from(await resp.arrayBuffer())
  } catch {
    return null
  }
}

async function downloadBatch(items: { url: string; key: string }[], concurrency = 10): Promise<Map<string, Buffer>> {
  const results = new Map<string, Buffer>()
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      const item = items[idx]
      const buf = await downloadFile(item.url)
      if (buf && buf.length > 0) results.set(item.key, buf)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function getFileExtFromUrl(url: string): string {
  const u = new URL(url)
  const ext = path.extname(u.pathname).toLowerCase()
  if (['.mp3', '.wav', '.ogg', '.m4a', '.webm'].includes(ext)) return ext
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return ext
  return '.mp3'
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Main ───

async function main() {
  console.log('=== 단어장 ZIP 내보내기 ===\n')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase 환경변수가 없습니다.')
    process.exit(1)
  }

  // Fetch all vocab from both modes
  const allRows: any[] = []
  for (const mode of ['sw', 'ko'] as const) {
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await supabase
        .from('generated_vocab')
        .select('*')
        .eq('mode', mode)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) { console.error(`DB 조회 실패 (mode=${mode}):`, error.message); break }
      if (!data?.length) break
      const cleaned = data.filter((r: any) => !r.word?.startsWith('__deleted__'))
      allRows.push(...cleaned)
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  console.log(`총 ${allRows.length}개 단어 로드됨\n`)
  if (!allRows.length) { console.log('내보낼 데이터가 없습니다.'); return }

  // Prepare export dir
  const exportDir = path.resolve('exports')
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const zipPath = path.join(exportDir, `kenya-vocab-export-${ts}.zip`)

  const output = fs.createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.pipe(output)

  // Phase 1: Build text data and collect unique URLs
  console.log('Phase 1: 텍스트 데이터 준비 및 URL 수집...')
  const exportData: any[] = []
  const urlToArchivePath = new Map<string, string>()
  const allDownloads: { url: string; key: string }[] = []

  for (let idx = 0; idx < allRows.length; idx++) {
    const r = allRows[idx]
    const mode = r.mode as string
    const seqNum = idx + 1

    const wordOverride = WORD_DISPLAY_OVERRIDE[r.word]
    const displayWord = wordOverride?.word ?? r.word
    const displayWordPron =
      mode === 'ko'
        ? koModeSwahiliPronDisplay(displayWord, r.word_pronunciation, wordOverride?.pron)
        : (wordOverride?.pron ?? r.word_pronunciation)

    let displaySw = r.meaning_sw
    if (mode === 'sw') {
      const isHada = /하다$/.test(r.word ?? '')
      if (isHada && displaySw && !/^kuwa\s+/i.test(displaySw)) displaySw = `kuwa ${displaySw.trim()}`
      if (r.word && SW_DISPLAY_OVERRIDE_BY_WORD[r.word]) displaySw = SW_DISPLAY_OVERRIDE_BY_WORD[r.word]
      else if (r.meaning_sw && SW_DISPLAY_OVERRIDE[r.meaning_sw]) displaySw = SW_DISPLAY_OVERRIDE[r.meaning_sw]
    }

    let displayKo = r.meaning_ko
    if (r.word && KO_DISPLAY_OVERRIDE_BY_WORD[r.word]) displayKo = KO_DISPLAY_OVERRIDE_BY_WORD[r.word]
    else if (r.meaning_ko && KO_DISPLAY_OVERRIDE[r.meaning_ko]) displayKo = KO_DISPLAY_OVERRIDE[r.meaning_ko]

    let displayEn = r.meaning_en ?? null
    displayEn = EN_DISPLAY_OVERRIDE[displayEn ?? ''] ?? displayEn
    if (r.word && EN_DISPLAY_OVERRIDE_BY_WORD[r.word]) displayEn = EN_DISPLAY_OVERRIDE_BY_WORD[r.word]
    if (r.example && EN_DISPLAY_OVERRIDE_BY_EXAMPLE[r.example]) displayEn = EN_DISPLAY_OVERRIDE_BY_EXAMPLE[r.example]
    if (displayEn) displayEn = stripKoreanFromEnDisplay(displayEn)

    const exOverride = r.example ? EXAMPLE_DISPLAY_OVERRIDE[r.example] : undefined
    const displayExample = exOverride?.text ?? r.example
    const displayExamplePron =
      mode === 'ko'
        ? koModeSwahiliPronDisplay(displayExample, r.example_pronunciation, exOverride?.pron)
        : (exOverride?.pron ?? r.example_pronunciation)

    const trByWord = r.word ? EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD[r.word] : undefined
    let displayExTransKo = r.example_translation_ko
    if (r.example_translation_ko && EXAMPLE_TRANSLATION_KO_OVERRIDE[r.example_translation_ko]) {
      displayExTransKo = EXAMPLE_TRANSLATION_KO_OVERRIDE[r.example_translation_ko]
    }
    const displayExTransSw = trByWord?.sw ?? r.example_translation_sw
    let displayExTransEn = trByWord?.en ?? r.example_translation_en
    if (r.example_translation_en && EXAMPLE_TRANSLATION_EN_OVERRIDE[r.example_translation_en]) {
      displayExTransEn = EXAMPLE_TRANSLATION_EN_OVERRIDE[r.example_translation_en]
    }

    const wordSafe = safeName(displayWord)
    const prefix = `${String(seqNum).padStart(4, '0')}_${wordSafe}`

    const record: any = {
      id: r.id, mode,
      category: r.category, difficulty: r.difficulty, pos: r.pos,
      word: displayWord,
      word_original: r.word !== displayWord ? r.word : undefined,
      word_pronunciation: displayWordPron,
      meaning_sw: displaySw, meaning_sw_pronunciation: r.meaning_sw_pronunciation,
      meaning_ko: displayKo, meaning_ko_pronunciation: r.meaning_ko_pronunciation,
      meaning_en: displayEn, meaning_en_pronunciation: r.meaning_en_pronunciation,
      example: displayExample, example_pronunciation: displayExamplePron,
      example_translation_sw: displayExTransSw,
      example_translation_ko: displayExTransKo,
      example_translation_en: displayExTransEn,
    }

    const mediaFields = [
      { field: 'word_audio', url: r.word_audio_url, subdir: 'audio/word' },
      { field: 'meaning_sw_audio', url: r.meaning_sw_audio_url, subdir: 'audio/meaning_sw' },
      { field: 'meaning_ko_audio', url: r.meaning_ko_audio_url, subdir: 'audio/meaning_ko' },
      { field: 'meaning_en_audio', url: r.meaning_en_audio_url, subdir: 'audio/meaning_en' },
      { field: 'example_audio', url: r.example_audio_url, subdir: 'audio/example' },
      { field: 'image', url: r.image_url, subdir: 'images' },
    ]

    for (const mf of mediaFields) {
      if (!mf.url) continue
      const ext = getFileExtFromUrl(mf.url)
      const archiveName = `${mf.subdir}/${prefix}${ext}`
      record[`${mf.field}_file`] = archiveName

      if (!urlToArchivePath.has(mf.url)) {
        urlToArchivePath.set(mf.url, archiveName)
        allDownloads.push({ url: mf.url, key: mf.url })
      } else {
        record[`${mf.field}_file`] = urlToArchivePath.get(mf.url)
      }
    }

    exportData.push(record)
  }

  console.log(`  ${exportData.length}개 레코드 준비, ${allDownloads.length}개 고유 미디어 URL`)

  // Phase 2: Batch download all media concurrently
  console.log('\nPhase 2: 미디어 파일 병렬 다운로드 (동시 15개)...')
  const BATCH_SIZE = 200
  let downloaded = 0
  let failed = 0

  for (let bStart = 0; bStart < allDownloads.length; bStart += BATCH_SIZE) {
    const batch = allDownloads.slice(bStart, bStart + BATCH_SIZE)
    const results = await downloadBatch(batch, 15)

    for (const [url, buf] of results) {
      const archiveName = urlToArchivePath.get(url)!
      archive.append(buf, { name: archiveName })
      downloaded++
    }
    failed += batch.length - results.size

    const progress = Math.min(bStart + BATCH_SIZE, allDownloads.length)
    console.log(`  ${progress}/${allDownloads.length} URL 처리 (다운로드: ${downloaded}, 실패: ${failed})`)
  }

  // Add JSON data
  archive.append(JSON.stringify(exportData, null, 2), { name: 'vocab_data.json' })

  // Add TSV for spreadsheet convenience
  const tsvHeader = [
    'mode', 'category', 'difficulty', 'pos',
    'word', 'word_pronunciation',
    'meaning_sw', 'meaning_sw_pronunciation',
    'meaning_ko', 'meaning_ko_pronunciation',
    'meaning_en', 'meaning_en_pronunciation',
    'example', 'example_pronunciation',
    'example_translation_sw', 'example_translation_ko', 'example_translation_en',
  ].join('\t')
  const tsvRows = exportData.map((r) => [
    r.mode, r.category, r.difficulty, r.pos,
    r.word, r.word_pronunciation,
    r.meaning_sw, r.meaning_sw_pronunciation,
    r.meaning_ko, r.meaning_ko_pronunciation,
    r.meaning_en, r.meaning_en_pronunciation,
    r.example, r.example_pronunciation,
    r.example_translation_sw, r.example_translation_ko, r.example_translation_en,
  ].map((v) => (v ?? '').toString().replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'))
  archive.append(`${tsvHeader}\n${tsvRows.join('\n')}`, { name: 'vocab_data.tsv' })

  console.log(`\n총 ${exportData.length}개 단어, ${downloaded}개 미디어 파일 다운로드 (실패: ${failed})`)
  console.log('ZIP 아카이브 생성 중...')

  await archive.finalize()
  await new Promise<void>((resolve) => output.on('close', resolve))

  const size = fs.statSync(zipPath).size
  console.log(`\n=== 완료 ===`)
  console.log(`파일: ${zipPath}`)
  console.log(`크기: ${(size / 1024 / 1024).toFixed(1)} MB`)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
