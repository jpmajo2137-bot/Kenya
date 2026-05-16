/**
 * Oxford 5000 단어를 SW-KO/KO-SW 와 동일한 8개 카테고리로 분류한다.
 *
 *   상황 카테고리 (우선 매칭):
 *     - 위기탈출  (Emergency)
 *     - 비즈니스  (Business)
 *     - 여행      (Travel)
 *     - 쇼핑      (Shopping)
 *
 *   난이도 카테고리 (위 4개에 매칭되지 않은 나머지를 빈도순 → 4분할):
 *     - 입문 (top 1000)
 *     - 초급 (1001..2500)
 *     - 중급 (2501..4000)
 *     - 고급 (4001..)
 *
 * 결과:
 *   - 입력 CSV (Perfect.csv) 끝에 `category` 와 `difficulty` 컬럼이 추가된 새 CSV 작성
 *     출력: scripts/_oxford_categorized.csv  (앱에서 직접 읽지 않고 업로드 스크립트가 사용)
 *   - 분류 통계를 콘솔에 출력
 *
 * 사용법:
 *   npx tsx scripts/classify-oxford.ts
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const OXFORD_DIR = process.env.OXFORD_DATA_DIR
if (!OXFORD_DIR) {
  console.error('OXFORD_DATA_DIR 가 .env 에 필요합니다.')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SRC_CSV = path.join(OXFORD_DIR, 'oxford_5000_with_tts(Perfect).csv')
const OUT_CSV = path.join(__dirname, '_oxford_categorized.csv')

// ============================================================
// 1) 카테고리 키워드 (소문자)
//    - 단어 정확 일치 + 일부 어근 prefix 매칭
//    - 우선순위: 위기탈출 → 비즈니스 → 여행 → 쇼핑
// ============================================================
const EMERGENCY = new Set<string>(
  `accident ambulance alarm allergic alarmed angry anxious arrest arrested attack
  bandage bleed blood bomb break broken bruise burn burning cancer cell choke
  collapse collision crash crime criminal cure damage danger dangerous dead death
  destroy destruction die disaster disease doctor drown drowning earthquake emergency
  epidemic escape evacuate evil explode explosion fail failure faint fall famine fatal
  fear fight fire firefighter flood flu gun harm harmful hazard heal health
  helpless hospital hurricane hurt ill illness infect infected infection injure
  injury jail kill killed killer knife lost medic medical medicine missing murder
  nightmare nurse outbreak pain painful panic patient pill pills poison police
  poison prison prisoner punish punishment quarantine refuge refugee rescue risk
  robber robbery sad sadness safety scar scare scared serious shock shot shoot
  shooting shout shouted sick sickness siren slip smoke sob sorrow steal stolen
  stuck suffer suffering surgery survive survival symptom temperature terror
  terrorism terrorist theft thief threat threatened tragedy trap trapped tremble
  tsunami violent violence virus volcano vomit warn warning weak weapon wound
  wounded crash collapse trauma traumatic`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean),
)

const BUSINESS = new Set<string>(
  `accountant acquire acquisition advertise advertisement advertising agent agreement
  analyst applicant application apply appoint appointment asset audit auditor balance
  bank banker bankrupt bid bill billion board bond bonus boss brand briefcase budget
  business buyer capital capitalism career cash ceo chairman chart client colleague
  commercial commission committee company competition competitor conference consultant
  consumer contract corporate corporation cost cover currency customer deadline deal
  debt deficit deliver delivery demand department deposit develop development director
  discount distribute distribution dividend document downsize earn earnings economic
  economy efficient employ employee employer employment enterprise entrepreneur equity
  estimate executive expand expansion expense expensive expert export factory finance
  financial firm fiscal fund funding gain global goal goods graph growth hire human
  income incorporate industrial industry inflation interview invest investment investor
  invoice job join labor launch leadership ledger lease loan logo loss management
  manager manufacture margin market marketing meeting memo merge merger mortgage
  negotiate negotiation network office offshore operation organisation organization
  outsource overhead overtime owner ownership partner partnership patent payment
  pension percent percentage performance plan planning portfolio position presentation
  president price pricing producer product production productivity profession
  professional profit project promote promotion proposal prospect purchase quality
  quarterly quota recession recruit refund register regulation report represent
  representative resource resources retail retire retirement revenue salary sale
  sales scale schedule sector securities sell seller service share shareholder
  signature skilled spreadsheet staff stake startup statistics stock strategy
  subsidiary subsidy success successful supplier supply target tariff tax taxes
  team technology tender trade trader transaction transfer turnover unemployed
  unemployment vacancy venture wage warehouse workforce workplace yield`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean),
)

const TRAVEL = new Set<string>(
  `abroad accommodation adventure airline airport altitude arrival arrive backpack
  bag baggage beach board boarding boat book booking border breakfast bridge bus
  cabin camera camp camping canyon capital castle cathedral church climate
  coast continent country countryside cruise culture currency customs delay
  depart departure desert destination distance domestic drive driver east embassy
  exchange exit expedition explore explorer ferry flight foreign forest gate global
  guide guidebook harbor hike hiking hill historic holiday hostel hotel hour
  immigrant immigration import information inn international island itinerary
  journey landmark landscape language lake leave leisure lighthouse local lodge
  luggage map metro mountain motel motorcycle museum nation national nationality
  native nature ocean overseas pack package palace passport peak photo photograph
  picnic pier pilgrimage pilot plane platform port province railway region
  reservation resort restaurant return ride river road route rural safari sail
  sailor scenic sea seaside season shore sightseeing south southwest southeast spa
  stadium station stay statue stream street suburb suitcase summit sunlight sunny
  sunrise sunset taxi temple territory ticket time timezone tour tourism tourist
  tower town tradition traditional trail train tram transport transportation travel
  trip tropical tunnel valley vacation vehicle view village visit visitor visa
  voyage walk waterfall weather west wilderness window winter zone`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean),
)

const SHOPPING = new Set<string>(
  `accessory advertise affordable apparel auction backpack bag bargain barcode basket
  belt bill blouse boot boots boutique bracelet brand bulk button buy buyer
  cabinet cap cart cash cashier catalogue catalog change cheap checkout choice
  choose clearance cloak clothes clothing coat coin collar color colour consumer
  cosmetic costume coupon credit currency customer deal debit deliver delivery
  department designer device discount display drawer dress earring earrings
  exchange expensive fabric fashion fee fitting footwear free gift glass
  glove gloves goods grocery handbag hat haute heel hood inventory invoice item
  jacket jeans jewelry jewellery label leather list logo lottery loyalty mall
  market merchandise model necklace offer online order outfit outlet packet
  packaging pants payment perfume pocket polish premium price pricing product
  promo promotion purchase purse quality queue receipt refund register retail
  retailer return ribbon ring sale salesperson sample scarf seller selling
  service shawl shirt shoe shoes shop shopper shopping shoppingbag silk size
  skirt sleeve socks souvenir special spend stock store stripe stuff style stylish
  sweater tag tailor textile tie till tip toy trolley trouser trousers trade
  tradition trend tshirt umbrella uniform unique value variety vault vendor
  voucher wallet watch wear window wholesale wrap zipper`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean),
)

// ============================================================
// 2) 분류 함수
// ============================================================
type Cat = '위기탈출' | '비즈니스' | '여행' | '쇼핑' | '입문' | '초급' | '중급' | '고급'

function classifyTopic(word: string): Cat | null {
  const w = word.toLowerCase().trim()
  if (EMERGENCY.has(w)) return '위기탈출'
  if (BUSINESS.has(w)) return '비즈니스'
  if (TRAVEL.has(w)) return '여행'
  if (SHOPPING.has(w)) return '쇼핑'
  return null
}

function difficultyFor(orderIndex: number): { cat: Cat; level: number } {
  if (orderIndex < 1000) return { cat: '입문', level: 1 }
  if (orderIndex < 2500) return { cat: '초급', level: 2 }
  if (orderIndex < 4000) return { cat: '중급', level: 3 }
  return { cat: '고급', level: 4 }
}

// 카테고리별 기본 난이도 (정렬용)
const TOPIC_DIFFICULTY: Record<Cat, number> = {
  입문: 1,
  초급: 2,
  중급: 3,
  고급: 4,
  여행: 2,
  비즈니스: 3,
  쇼핑: 2,
  위기탈출: 3,
}

// ============================================================
// 3) CSV 파서/직렬화 (BOM 처리)
// ============================================================
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
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
  if (rows.length === 0) return { headers: [], rows: [] }
  return { headers: rows[0], rows: rows.slice(1) }
}

function serializeCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) =>
    /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const out: string[] = [headers.map(escape).join(',')]
  for (const r of rows) out.push(r.map(escape).join(','))
  return out.join('\n')
}

// ============================================================
// 4) 메인
// ============================================================
function main() {
  const text = fs.readFileSync(SRC_CSV, 'utf-8')
  const { headers, rows } = parseCsv(text)
  console.log(`총 ${rows.length}개 행 로드 (${headers.length} 컬럼)`)

  const wordIdx = headers.indexOf('word')
  if (wordIdx < 0) {
    console.error('word 컬럼을 찾을 수 없습니다.')
    process.exit(1)
  }

  // 결과 컬럼 추가
  const newHeaders = [...headers]
  if (!newHeaders.includes('category')) newHeaders.push('category')
  if (!newHeaders.includes('difficulty')) newHeaders.push('difficulty')
  const catIdx = newHeaders.indexOf('category')
  const diffIdx = newHeaders.indexOf('difficulty')

  const stats: Record<Cat, number> = {
    입문: 0,
    초급: 0,
    중급: 0,
    고급: 0,
    여행: 0,
    비즈니스: 0,
    쇼핑: 0,
    위기탈출: 0,
  }

  const newRows: string[][] = rows.map((row, i) => {
    const word = (row[wordIdx] ?? '').trim()
    let cat: Cat
    let level: number
    const topic = classifyTopic(word)
    if (topic) {
      cat = topic
      level = TOPIC_DIFFICULTY[topic]
    } else {
      const d = difficultyFor(i)
      cat = d.cat
      level = d.level
    }
    stats[cat] += 1
    const out = [...row]
    while (out.length < newHeaders.length) out.push('')
    out[catIdx] = cat
    out[diffIdx] = String(level)
    return out
  })

  fs.writeFileSync(OUT_CSV, serializeCsv(newHeaders, newRows), 'utf-8')

  console.log(`\n분류 통계:`)
  for (const k of [
    '입문',
    '초급',
    '중급',
    '고급',
    '여행',
    '비즈니스',
    '쇼핑',
    '위기탈출',
  ] as Cat[]) {
    console.log(`  ${k}\t${stats[k]}`)
  }
  console.log(`\n출력: ${OUT_CSV}`)
}

main()
