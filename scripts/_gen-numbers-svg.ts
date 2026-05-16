/**
 * 숫자 단어 이미지 — 정확한 카운트 보장을 위해 서버에서 SVG 결정적 렌더링.
 *
 * 각 숫자 word 에 대해 정확히 N 개의 빨간 사과(원 + 잎)를 흰 배경 위 격자로 배치.
 *   - 1~10: 한 줄
 *   - 11~30: 두~세 줄 (10개씩 + 나머지)
 *   - 40~100: N/10 줄 × 10
 *
 * Storage: oxford-images/{word}.svg, content-type: image/svg+xml
 * DB: 같은 word 의 모든 행에 동일 URL 패치 (sino/native 공유).
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('env missing'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const BUCKET = 'oxford-images'

const WORD_TO_N: Record<string, number> = {
  one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20,
  'twenty-one':21,'twenty-two':22,'twenty-three':23,'twenty-four':24,'twenty-five':25,
  'twenty-six':26,'twenty-seven':27,'twenty-eight':28,'twenty-nine':29, thirty:30,
  forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100,
}

function svgForNumber(n: number): string {
  const W = 1024
  const H = 1024
  const PAD = 80

  // 격자 행/열
  const cols = Math.min(10, n)
  const rows = Math.ceil(n / 10)

  const gridW = W - PAD * 2
  const gridH = H - PAD * 2
  const cellW = gridW / 10            // 항상 10 컬럼 기준 셀 폭 (밀도 일정)
  const cellH = gridH / rows
  const r = Math.min(cellW, cellH) * 0.36

  const items: string[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 10)
    const col = i % 10

    const inLastRow = row === rows - 1
    const itemsInLastRow = n - row * 10
    const lastRowCols = Math.min(10, itemsInLastRow)
    const colsThisRow = inLastRow ? lastRowCols : 10

    const rowStartX = PAD + (gridW - colsThisRow * cellW) / 2
    const cx = rowStartX + cellW * (col + 0.5)
    const cy = PAD + cellH * (row + 0.5)

    // 사과 본체
    items.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#ef4444" stroke="#b91c1c" stroke-width="3"/>`,
    )
    // 잎 (간단한 타원 + 회전)
    const lx = cx + r * 0.05
    const ly = cy - r * 0.95
    items.push(
      `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="${(r * 0.18).toFixed(1)}" ry="${(r * 0.38).toFixed(1)}" fill="#16a34a" transform="rotate(28 ${lx.toFixed(1)} ${ly.toFixed(1)})"/>`,
    )
    // 짧은 줄기
    items.push(
      `<rect x="${(cx - r * 0.05).toFixed(1)}" y="${(cy - r - r * 0.18).toFixed(1)}" width="${(r * 0.1).toFixed(1)}" height="${(r * 0.22).toFixed(1)}" fill="#78350f" rx="${(r * 0.04).toFixed(1)}"/>`,
    )
  }

  cols // (unused, kept for clarity)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${items.join('\n  ')}
</svg>`
}

async function processWord(word: string): Promise<'ok' | 'skip' | 'fail'> {
  const n = WORD_TO_N[word]
  if (!n) { console.warn(`  - ${word}: 매핑 없음`); return 'skip' }

  const svg = svgForNumber(n)
  const path = `${word}.svg`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([svg], { type: 'image/svg+xml' }), {
      contentType: 'image/svg+xml',
      upsert: true,
    })
  if (upErr) { console.error(`  ✗ upload ${word}: ${upErr.message}`); return 'fail' }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const url = pub.publicUrl
  if (!url) { console.error(`  ✗ public url empty: ${word}`); return 'fail' }

  const { error: dbErr, count } = await supabase
    .from('oxford_vocab')
    .update({ image_url: url }, { count: 'exact' })
    .eq('word', word)
  if (dbErr) { console.error(`  ✗ db update ${word}: ${dbErr.message}`); return 'fail' }

  console.log(`  ✓ ${word} (n=${n}) → ${url}  (rows=${count})`)
  return 'ok'
}

async function pool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let next = 0
  const run = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try { await fn(items[i]) } catch (e) { console.error(`pool ${i}:`, e) }
    }
  }
  await Promise.all(Array.from({ length: n }, () => run()))
}

async function main() {
  const words = Object.keys(WORD_TO_N)
  let ok = 0, skip = 0, fail = 0
  await pool(words, 8, async (w) => {
    const r = await processWord(w)
    if (r === 'ok') ok++; else if (r === 'skip') skip++; else fail++
  })
  console.log('═'.repeat(50))
  console.log(`완료: ${ok} 생성 / ${skip} skip / ${fail} 실패`)
}

main().catch(e => { console.error(e); process.exit(1) })
