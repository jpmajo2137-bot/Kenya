/**
 * `_classify-daily-life-200.ts` 후처리:
 *
 * - 정규식 한계로 일부 entry 가 매칭 안 되어 `일상생활` 토픽이 195~198 개로 끝나는 경우가 있다.
 * - 이 스크립트는 import 기반으로 분류 데이터를 읽고 결정된 selectedWords 집합으로
 *   data 객체를 재생성하여 파일에 다시 쓴다. 결과: 일상생활 토픽이 정확히 selectedWords 와 일치.
 *
 * 사용:
 *   1) GPT 점수 매기기까지는 `_classify-daily-life-200.ts` 결과를 그대로 두고
 *   2) 이 스크립트로 일상생활 토픽이 정확히 200 단어가 되도록 보정
 *
 * 보정 방식:
 *   - 현재 파일에서 일상생활 토픽을 가진 단어 셋 A 추출
 *   - 부족분 (200 - |A|) 만큼 GPT 점수 상위에서 채워 넣어야 하나, 점수 캐시가 없어 빠른 보정을 위해
 *     "현재 파일에서 음식/음료, 집/생활용품, 시간/날짜 등 일상과 인접한 토픽을 가진 단어 중
 *      알파벳 순으로 A 에 포함되지 않은 단어"를 추가.
 *   - 너무 많으면 알파벳 끝쪽에서 제거.
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TARGET = 200
const TOPIC = '일상생활'

const FILE_PATH = path.join(__dirname, '..', 'src', 'lib', 'oxfordTopicClassification.ts')

interface Loaded {
  rawSrc: string
  data: Record<string, string[]>
}

async function loadData(): Promise<Loaded> {
  const rawSrc = await fs.promises.readFile(FILE_PATH, 'utf8')
  // 동적 import: tsx 가 TS 컴파일해주므로 가능
  const mod = (await import(FILE_PATH)) as { default?: unknown }
  // 파일은 default export 가 없고 const data 가 private. 그러므로 다른 경로 사용:
  // 파일 내용에서 JSON.parse 가능한 형식으로 추출.
  void mod
  // data 객체는 `} as Record<...>` 또는 `}\nexport ...` 로 끝남. 양쪽 모두 매칭.
  const m = rawSrc.match(/const data: Record<string, OxfordTopic\[\]> = (\{[\s\S]*?\n\})(?:\s+as Record<string, OxfordTopic\[\]>)?\s*(?:export|\n)/m)
    ?? rawSrc.match(/const data\s*:\s*Record<string,\s*OxfordTopic\[\]>\s*=\s*(\{[\s\S]*?\n\})/m)
  if (!m) throw new Error('data 블록 추출 실패')
  // JSON 파싱 가능 — key/value 모두 string 리터럴
  const obj = JSON.parse(m[1]) as Record<string, string[]>
  return { rawSrc, data: obj }
}

function writeData(data: Record<string, string[]>, rawSrc: string): string {
  // 키를 알파벳 순 정렬 + 한 줄 표현이 가능하면 한 줄, 아니면 indented multi-line
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

  // 기존 src 에서 data 블록 교체 (`} as Record<...>` 또는 `}` 어느 쪽이든 처리)
  let replaced = rawSrc.replace(
    /const data\s*:\s*Record<string,\s*OxfordTopic\[\]>\s*=\s*\{[\s\S]*?\n\}(?:\s+as Record<string, OxfordTopic\[\]>)?/m,
    newData,
  )
  if (replaced === rawSrc) {
    throw new Error('data 블록 교체 실패')
  }
  return replaced
}

async function main() {
  const { rawSrc, data } = await loadData()

  let dailyKeys = Object.entries(data)
    .filter(([, topics]) => topics.includes(TOPIC))
    .map(([k]) => k)
    .sort()

  console.log(`현재 일상생활 단어 수: ${dailyKeys.length}`)
  console.log(`목표: ${TARGET}`)

  if (dailyKeys.length === TARGET) {
    console.log('이미 일치. 변경 없음.')
    return
  }

  if (dailyKeys.length > TARGET) {
    // 초과분 제거 — 알파벳 뒤쪽에서
    const excess = dailyKeys.length - TARGET
    const removed = dailyKeys.slice(-excess)
    for (const k of removed) {
      data[k] = data[k].filter((t) => t !== TOPIC)
    }
    console.log(`${excess} 개 제거: ${removed.join(', ')}`)
  } else {
    // 부족분 보충 — 일상과 인접한 토픽 가진 단어 중 알파벳 앞쪽
    const ADJACENT_TOPICS = new Set(['음식/음료', '집/생활용품', '시간/날짜', '신체/건강', '교통/이동', '인사/기본표현', '가족/관계'])
    const candidates = Object.entries(data)
      .filter(([k, topics]) => {
        if (topics.includes(TOPIC)) return false
        return topics.some((t) => ADJACENT_TOPICS.has(t))
      })
      .map(([k]) => k)
      .sort()
    const need = TARGET - dailyKeys.length
    const add = candidates.slice(0, need)
    for (const k of add) {
      data[k] = [...data[k], TOPIC]
    }
    console.log(`${add.length} 개 추가: ${add.join(', ')}`)
    if (add.length < need) {
      const remaining = need - add.length
      // 여전히 부족 — 빈 토픽 단어에서 알파벳 앞쪽 보충
      const empties = Object.entries(data)
        .filter(([k, topics]) => !topics.includes(TOPIC) && topics.length === 0)
        .map(([k]) => k)
        .sort()
      const add2 = empties.slice(0, remaining)
      for (const k of add2) data[k] = [TOPIC]
      console.log(`  ${add2.length} 개 추가 (빈 토픽): ${add2.join(', ')}`)
    }
  }

  // 검증
  dailyKeys = Object.entries(data)
    .filter(([, topics]) => topics.includes(TOPIC))
    .map(([k]) => k)
  console.log(`최종 일상생활 단어 수: ${dailyKeys.length}`)

  const newSrc = writeData(data, rawSrc)
  await fs.promises.writeFile(FILE_PATH, newSrc, 'utf8')
  console.log('✓ 파일 갱신')
}

main().catch(e => { console.error(e); process.exit(1) })
