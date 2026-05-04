import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

dotenv.config()

type ExportRow = {
  id: string
  mode: string
  word: string
  word_audio_file?: string | null
  meaning_sw_audio_file?: string | null
  meaning_ko_audio_file?: string | null
  meaning_en_audio_file?: string | null
  example_audio_file?: string | null
}

type AudioField =
  | 'word_audio_url'
  | 'meaning_sw_audio_url'
  | 'meaning_ko_audio_url'
  | 'meaning_en_audio_url'
  | 'example_audio_url'

const EXPORT_DIR =
  process.env.RESTORE_EXPORT_DIR || 'C:/kenya-vocab-export-2026-03-29T12-44-31'
const STORAGE_PREFIX = process.env.RESTORE_STORAGE_PREFIX || 'restore/2026-03-29'
const BUCKET = process.env.RESTORE_AUDIO_BUCKET || 'vocabaudio'
const LIMIT = Number(process.env.RESTORE_LIMIT || '0')
const ONLY_WORD = process.env.RESTORE_ONLY_WORD?.trim()
const START_AT = Number(process.env.RESTORE_START_AT || '0')
const CONCURRENCY = Math.max(1, Number(process.env.RESTORE_CONCURRENCY || '6') || 6)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const AUDIO_FILE_TO_URL_FIELD: Array<[keyof ExportRow, AudioField, string]> = [
  ['word_audio_file', 'word_audio_url', 'word'],
  ['meaning_sw_audio_file', 'meaning_sw_audio_url', 'meaning_sw'],
  ['meaning_ko_audio_file', 'meaning_ko_audio_url', 'meaning_ko'],
  ['meaning_en_audio_file', 'meaning_en_audio_url', 'meaning_en'],
  ['example_audio_file', 'example_audio_url', 'example'],
]

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY')
  }
}

function storagePath(row: ExportRow, kind: string) {
  return `${STORAGE_PREFIX}/${row.mode}/${kind}/${row.id}.mp3`
}

async function uploadAudio(
  supabase: ReturnType<typeof createClient>,
  localFile: string,
  remotePath: string,
) {
  const body = await readFile(localFile)
  const { data, error } = await supabase.storage.from(BUCKET).upload(remotePath, body, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) throw error

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return urlData.publicUrl
}

async function main() {
  requireEnv()
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!)
  const jsonPath = path.join(EXPORT_DIR, 'vocab_data.json')
  const raw = await readFile(jsonPath, 'utf8')
  let rows = JSON.parse(raw) as ExportRow[]

  if (ONLY_WORD) rows = rows.filter((row) => row.word === ONLY_WORD)
  if (START_AT > 0) rows = rows.slice(START_AT)
  if (LIMIT > 0) rows = rows.slice(0, LIMIT)

  console.log(`Export dir: ${EXPORT_DIR}`)
  console.log(`Storage: ${BUCKET}/${STORAGE_PREFIX}`)
  console.log(`Rows: ${rows.length}`)

  const totals = { uploaded: 0, updated: 0, missing: 0, failed: 0, completed: 0 }

  async function restoreRow(row: ExportRow) {
    const patch: Partial<Record<AudioField, string>> = {}

    for (const [fileKey, urlField, kind] of AUDIO_FILE_TO_URL_FIELD) {
      const rel = row[fileKey]
      if (!rel) continue

      const localFile = path.join(EXPORT_DIR, rel)
      if (!existsSync(localFile)) {
        totals.missing++
        continue
      }

      try {
        patch[urlField] = await uploadAudio(supabase, localFile, storagePath(row, kind))
        totals.uploaded++
      } catch (e) {
        totals.failed++
        console.error('[upload fail] ' + row.word + ' ' + urlField + ': ' + (e instanceof Error ? e.message : String(e)))
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('generated_vocab').update(patch).eq('id', row.id)
      if (error) {
        totals.failed++
        console.error('[update fail] ' + row.word + ' (' + row.id + '): ' + error.message)
      } else {
        totals.updated++
      }
    }
  }

  let cursor = 0
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++]!
      await restoreRow(row)
      totals.completed++
      if (totals.completed % 25 === 0 || totals.completed === rows.length) {
        console.log(
          '[' + totals.completed + '/' + rows.length + '] uploaded=' + totals.uploaded + ' updated=' + totals.updated + ' missing=' + totals.missing + ' failed=' + totals.failed,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()))

  console.log('Done')
  console.log(totals)
  if (totals.failed > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
