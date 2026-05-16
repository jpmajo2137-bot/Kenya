/**
 * 일상생활 토픽 200 단어가 oxford_vocab 에서 텍스트/이미지/오디오 컬럼이
 * 얼마나 채워져 있는지 점검.
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
  const m = src.match(/const data\s*:\s*Record<string,\s*OxfordTopic\[\]>\s*=\s*(\{[\s\S]*?\n\})/m)!
  const data = JSON.parse(m[1].replace(/,(\s*[\]}])/g, '$1')) as Record<string, string[]>
  const dailyWords = Object.entries(data).filter(([, ts]) => ts.includes('일상생활')).map(([k]) => k)

  const { data: rows } = await supabase
    .from('oxford_vocab')
    .select('word, korean_meaning, english_example, korean_example, image_url, word_audio_url, meaning_audio_url, english_example_audio_url, korean_example_audio_url')
    .in('word', dailyWords)
  const list = rows ?? []
  console.log(`일상생활 행: ${list.length}`)

  const has = (v: string | null | undefined) => !!(v && v.trim())
  const cnt = {
    en_ex: 0, ko_ex: 0, img: 0, w_au: 0, m_au: 0, ee_au: 0, ke_au: 0,
  }
  const missing: Record<string, string[]> = {}
  for (const r of list) {
    if (has(r.english_example)) cnt.en_ex++
    else (missing.en_ex ??= []).push(r.word)
    if (has(r.korean_example)) cnt.ko_ex++
    else (missing.ko_ex ??= []).push(r.word)
    if (has(r.image_url)) cnt.img++
    else (missing.img ??= []).push(r.word)
    if (has(r.word_audio_url)) cnt.w_au++
    else (missing.w_au ??= []).push(r.word)
    if (has(r.meaning_audio_url)) cnt.m_au++
    else (missing.m_au ??= []).push(r.word)
    if (has(r.english_example_audio_url)) cnt.ee_au++
    else (missing.ee_au ??= []).push(r.word)
    if (has(r.korean_example_audio_url)) cnt.ke_au++
    else (missing.ke_au ??= []).push(r.word)
  }
  console.log('필드 채움 수:', cnt)
  for (const [k, words] of Object.entries(missing)) {
    if (words.length > 0) {
      console.log(`  ${k} 누락 ${words.length}: ${words.slice(0, 8).join(', ')}${words.length > 8 ? ` ... (+${words.length-8})` : ''}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
