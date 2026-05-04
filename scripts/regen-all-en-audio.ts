import * as dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

function envFromFile(file: string, key: string): string {
  const txt = readFileSync(file, 'utf8')
  const line = txt.split(/\r?\n/).find((l) => l.trim().startsWith(key + '='))
  if (!line) return ''
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = envFromFile('.env.full-backup-20260502-181034', 'SUPABASE_SERVICE_ROLE_KEY')
const AZURE_KEY = envFromFile('.env.full-backup-20260502-181034', 'AZURE_SPEECH_KEY') || envFromFile('.env.full-backup-20260502-181034', 'VITE_AZURE_TTS_KEY')
const AZURE_REGION = envFromFile('.env.full-backup-20260502-181034', 'AZURE_SPEECH_REGION') || envFromFile('.env.full-backup-20260502-181034', 'VITE_AZURE_TTS_REGION') || 'koreacentral'

const CONCURRENCY = 4
const DELAY_MS = 120

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function sanitizeForTts(text: string): string {
  let s = text.trim()
  s = s.replace(/\s+\/\s+/g, ', ')
  s = s.replace(/\//g, ' or ')
  s = s.replace(/[()]/g, '')
  return s.trim()
}

async function azureTts(text: string): Promise<ArrayBuffer> {
  const ttsText = sanitizeForTts(text)
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='en-US-AriaNeural'>
    <prosody rate='0.9'>${escapeXml(ttsText)}</prosody>
  </voice>
</speak>`
  const res = await fetch(
    `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'KenyaVocabRegenAll',
      },
      body: ssml,
    },
  )
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') || '10') * 1000
    console.log('  rate-limited, waiting ' + wait + 'ms')
    await delay(wait)
    return azureTts(text)
  }
  if (!res.ok) throw new Error('Azure ' + res.status + ': ' + (await res.text().catch(() => '')))
  return res.arrayBuffer()
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

type Row = { id: string; mode: string; word: string; meaning_en: string }

const totals = { ok: 0, fail: 0, completed: 0 }

async function processRow(row: Row) {
  try {
    const audio = await azureTts(row.meaning_en)
    const path = `regen-en/${row.mode}/${row.id}_meaning_en_${Date.now()}.mp3`
    const { data, error } = await supabase.storage.from('vocabaudio').upload(path, new Blob([audio], { type: 'audio/mpeg' }), {
      contentType: 'audio/mpeg',
      upsert: true,
    })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(data.path)
    const { error: dbErr } = await supabase
      .from('generated_vocab')
      .update({ meaning_en_audio_url: urlData.publicUrl })
      .eq('id', row.id)
    if (dbErr) throw dbErr
    totals.ok++
  } catch (e) {
    totals.fail++
    console.error('[fail] ' + row.word + ' (' + row.meaning_en + '): ' + (e instanceof Error ? e.message : String(e)))
  }
  totals.completed++
  await delay(DELAY_MS)
}

async function main() {
  if (!AZURE_KEY) throw new Error('No Azure key')
  if (!SERVICE_ROLE) throw new Error('No service role key')

  const PAGE = 1000
  let allRows: Row[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, meaning_en')
      .not('meaning_en', 'is', null)
      .not('meaning_en', 'eq', '')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || !data.length) break
    allRows = allRows.concat(data as Row[])
    from += PAGE
    if (data.length < PAGE) break
  }

  console.log('Total rows: ' + allRows.length)
  console.log('Concurrency: ' + CONCURRENCY)
  console.log('Voice: en-US-AriaNeural 24khz-96kbps')

  let cursor = 0
  async function worker() {
    while (cursor < allRows.length) {
      const row = allRows[cursor++]!
      await processRow(row)
      if (totals.completed % 50 === 0 || totals.completed === allRows.length) {
        console.log('[' + totals.completed + '/' + allRows.length + '] ok=' + totals.ok + ' fail=' + totals.fail)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allRows.length) }, () => worker()))
  console.log('Done', totals)
  if (totals.fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
