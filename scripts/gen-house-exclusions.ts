/**
 * 집/생활용품 제외 목록 생성
 * 집(방/문/창/가구/건축), 생활용품(주방/청소/수납/도구) 직접 관련만 유지
 * 출력: filterUtils에 추가할 제외 단어 배열
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import classification from '../src/lib/topicClassification'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

// 유지할 키워드 (뜻에 이게 있으면 KEEP) - 집·생활용품 직결
const KEEP_KO = ['집', '방', '문', '창', '벽', '지붕', '바닥', '천장', '부엌', '침실', '화장실', '욕실', '가구', '의자', '책상', '침대', '선반', '찬장', '거울', '접시', '그릇', '냄비', '칼', '숟가락', '컵', '병', '냉장고', '오븐', '도구', '바늘', '사다리', '밧줄', '자물쇠', '열쇠', '청소', '쓰레기', '상자', '바구니', '가방', '봉투', '나무', '천', '종이', '전등', '램프', '계단', '복도', '차고', '지하실', '담요', '시트', '우산', '펜', '연필', '테이프', '붙이다', '열다', '닫다', '놓다', '두다', '걸다', '채우다', '버리다', '고치다', '수리하다', '안에', '밖에', '위에', '밖', '출구', '문턱', '구석', '창고', '목재', '가닥', '바닥', '콘센트', '전선', '케이블']
const KEEP_EN = ['house', 'home', 'room', 'door', 'window', 'wall', 'roof', 'floor', 'ceiling', 'kitchen', 'bedroom', 'bathroom', 'furniture', 'chair', 'table', 'bed', 'shelf', 'cabinet', 'mirror', 'plate', 'bowl', 'pot', 'cup', 'knife', 'spoon', 'bottle', 'fridge', 'oven', 'tool', 'needle', 'ladder', 'rope', 'lock', 'key', 'clean', 'rubbish', 'box', 'basket', 'bag', 'envelope', 'wood', 'cloth', 'paper', 'lamp', 'light', 'stair', 'corridor', 'garage', 'basement', 'blanket', 'sheet', 'umbrella', 'pen', 'pencil', 'tape', 'stick', 'attach', 'open', 'close', 'put', 'place', 'leave', 'hang', 'fill', 'throw', 'fix', 'repair', 'inside', 'outside', 'exit', 'threshold', 'corner', 'storage', 'timber', 'strand', 'outlet', 'wire', 'cable']

function shouldKeep(word: string, meaningKo: string, meaningEn: string): boolean {
  const ko = (meaningKo || '').toLowerCase()
  const en = (meaningEn || '').toLowerCase()
  const w = word.toLowerCase()
  if (KEEP_KO.some((k) => ko.includes(k) || w.includes(k))) return true
  if (KEEP_EN.some((k) => en.includes(k) || w.includes(k))) return true
  // 스와힐리어 집/가구 관련
  const swKeep = ['nyumba', 'chumba', 'mlango', 'dirisha', 'ukuta', 'paa', 'sakafu', 'jiko', 'choo', 'samani', 'kiti', 'kitanda', 'rafu', 'kabati', 'kioo', 'sahani', 'sufuria', 'kisu', 'kijiko', 'kikombe', 'chupa', 'oveni', 'friji', 'zana', 'kamba', 'kufuli', 'ufunguo', 'kikapu', 'begi', 'bahasha', 'sanduku', 'mbao', 'kitambaa', 'karatasi', 'taa', 'ngazi', 'gereji', 'shuka', 'blanketi', 'mwavuli', 'ghala', 'tofali', 'bafu', 'chumba cha kulala', 'chumba cha kusomea', 'kizingiti', 'kona', 'dari', 'tundu la umeme', 'waya', 'kebo']
  if (swKeep.some((k) => w.includes(k))) return true
  return false
}

async function main() {
  const data = classification as Record<string, string[]>
  const houseIds: string[] = []
  for (const [id, arr] of Object.entries(data)) {
    if (Array.isArray(arr) && arr.includes('집/생활용품')) houseIds.push(id)
  }

  const allRows: { word: string; meaning_ko: string | null; meaning_en: string | null }[] = []
  for (let i = 0; i < houseIds.length; i += 100) {
    const { data: rows } = await supabase
      .from('generated_vocab')
      .select('word, meaning_ko, meaning_en')
      .in('id', houseIds.slice(i, i + 100))
    allRows.push(...(rows ?? []))
  }

  const exclude: string[] = []
  for (const r of allRows) {
    const word = r.word ?? ''
    if (!word) continue
    if (!shouldKeep(word, r.meaning_ko ?? '', r.meaning_en ?? '')) {
      exclude.push(word)
    }
  }

  const existing = ['benchi', 'besi', 'bunduki', 'muzikali']
  const toAdd = exclude.filter((w) => !existing.includes(w))
  const allExclusions = [...existing, ...toAdd]
  const fs = await import('fs')
  const path = await import('path')
  const outPath = path.join(process.cwd(), 'scripts', '_house_exclusions.json')
  fs.writeFileSync(outPath, JSON.stringify(allExclusions, null, 0), 'utf8')
  console.log('Wrote', allExclusions.length, 'exclusions to', outPath)
}

main().catch(console.error)
