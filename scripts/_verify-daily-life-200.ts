/**
 * 일상생활 토픽 200 단어가 모두 oxford_vocab DB 에 존재하는지 검증.
 * EN-KO: 한 word 당 row 수 (sino/native 합산 가능),
 * KO-EN: distinct word 기준.
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

async function main() {
  const file = path.join(__dirname, '..', 'src', 'lib', 'oxfordTopicClassification.ts')
  const src = await fs.promises.readFile(file, 'utf8')
  const m = src.match(/const data\s*:\s*Record<string,\s*OxfordTopic\[\]>\s*=\s*(\{[\s\S]*?\n\})/m)
  if (!m) { console.error('data not found'); process.exit(1) }
  const data = JSON.parse(m[1].replace(/,(\s*[\]}])/g, '$1')) as Record<string, string[]>
  const dailyWords = Object.entries(data).filter(([, ts]) => ts.includes('일상생활')).map(([k]) => k)
  console.log(`일상생활 단어: ${dailyWords.length}`)

  // DB 조회
  const { data: rows, error } = await supabase
    .from('oxford_vocab')
    .select('word')
    .in('word', dailyWords)
  if (error) { console.error('select:', error.message); process.exit(1) }
  const dbWords = new Set((rows ?? []).map((r) => (r.word ?? '').toLowerCase().trim()))
  console.log(`DB row 매칭 (중복 포함): ${rows?.length ?? 0}`)
  console.log(`DB distinct word: ${dbWords.size}`)
  const missing = dailyWords.filter((w) => !dbWords.has(w))
  if (missing.length > 0) {
    console.log(`DB 누락 ${missing.length}: ${missing.join(', ')}`)
  } else {
    console.log('✓ 모든 단어가 DB 에 존재')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
