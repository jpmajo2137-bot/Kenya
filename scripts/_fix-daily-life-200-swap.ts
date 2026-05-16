/**
 * `_finalize-daily-life-200.ts` 가 알파벳 앞쪽에서 인접 토픽 단어를 보충했더니
 * 일상생활에 부적합한 단어가 들어간 경우를 수동 교체.
 *
 * 제거: abortion, above, abroad (의미상 일상생활과 거리)
 * 추가: 알맞은 일상 단어들 (GPT 가 컷오프 9 점 동점으로 분류했지만 매칭 실패한 단어들에서)
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FILE_PATH = path.join(__dirname, '..', 'src', 'lib', 'oxfordTopicClassification.ts')

const TOPIC = '일상생활'

// DB 미존재 단어 제거 → DB 존재하며 일상생활에 적합한 단어로 교체
const REMOVE = ['monday', 'ok', 't-shirt']
const ADD = ['today', 'tomorrow', 'thirsty']

async function main() {
  const rawSrc = await fs.promises.readFile(FILE_PATH, 'utf8')
  const m = rawSrc.match(/const data\s*:\s*Record<string,\s*OxfordTopic\[\]>\s*=\s*(\{[\s\S]*?\n\})/m)
  if (!m) throw new Error('data 추출 실패')
  // TS 는 trailing comma 허용. JSON.parse 전에 제거.
  const cleaned = m[1].replace(/,(\s*[\]}])/g, '$1')
  const data = JSON.parse(cleaned) as Record<string, string[]>

  for (const k of REMOVE) {
    if (data[k]?.includes(TOPIC)) {
      data[k] = data[k].filter((t) => t !== TOPIC)
      console.log(`제거: ${k}`)
    } else console.log(`스킵 (없음): ${k}`)
  }
  for (const k of ADD) {
    if (!data[k]) {
      data[k] = [TOPIC]
      console.log(`추가 (신규 키): ${k}`)
    } else if (!data[k].includes(TOPIC)) {
      data[k] = [...data[k], TOPIC]
      console.log(`추가: ${k}`)
    } else console.log(`스킵 (이미): ${k}`)
  }

  // 검증
  const finalCount = Object.values(data).filter((ts) => ts.includes(TOPIC)).length
  console.log(`최종 일상생활: ${finalCount}`)

  // 파일 재작성 (동일 로직)
  const keys = Object.keys(data).sort((a, b) => a.localeCompare(b))
  const lines: string[] = []
  lines.push('const data: Record<string, OxfordTopic[]> = {')
  keys.forEach((k, idx) => {
    const topics = data[k] ?? []
    const keyStr = JSON.stringify(k)
    if (topics.length === 0) {
      lines.push(`  ${keyStr}: [],`)
    } else {
      lines.push(`  ${keyStr}: [`)
      topics.forEach((t, ti) => {
        const comma = ti < topics.length - 1 ? ',' : ''
        lines.push(`    ${JSON.stringify(t)}${comma}`)
      })
      lines.push(`  ]${idx < keys.length - 1 ? ',' : ''}`)
    }
  })
  lines.push('}')
  const newData = lines.join('\n')
  const newSrc = rawSrc.replace(
    /const data\s*:\s*Record<string,\s*OxfordTopic\[\]>\s*=\s*\{[\s\S]*?\n\}(?:\s+as Record<string, OxfordTopic\[\]>)?/m,
    newData,
  )
  if (newSrc === rawSrc) throw new Error('교체 실패')
  await fs.promises.writeFile(FILE_PATH, newSrc, 'utf8')
  console.log('✓ 파일 갱신')
}

main().catch(e => { console.error(e); process.exit(1) })
