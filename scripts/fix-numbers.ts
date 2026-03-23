/**
 * 숫자 1~50 데이터 수정 스크립트
 *
 * SW 모드 (스와힐리어 사용자 = 한국어 단어 학습):
 *   1~25: 한자어 숫자 (일, 이, 삼, 사, ... 이십오)
 *   26~50: 고유어 숫자 (하나, 둘, 셋, 넷, ... 스물다섯)
 *
 * KO 모드 (한국어 사용자 = 스와힐리어 단어 학습):
 *   1~50: 스와힐리어 숫자 (moja ~ hamsini)
 *         meaning_ko = "하나(일)", "둘(이)" ... "쉰(오십)" 형식
 *
 * 사용법: npx tsx scripts/fix-numbers.ts
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const OPENAI_MODEL = 'gpt-5.2'
const TTS_MODEL = 'tts-1-hd'
const TTS_VOICE = 'nova'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

// ─── 한자어 숫자 (1~25) ───
const SINO_KO = [
  '일','이','삼','사','오','육','칠','팔','구','십',
  '십일','십이','십삼','십사','십오','십육','십칠','십팔','십구','이십',
  '이십일','이십이','이십삼','이십사','이십오',
]

// ─── 고유어 숫자 (1~25) ───
const NATIVE_KO = [
  '하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열',
  '열하나','열둘','열셋','열넷','열다섯','열여섯','열일곱','열여덟','열아홉','스물',
  '스물하나','스물둘','스물셋','스물넷','스물다섯',
]

// ─── 스와힐리어 숫자 (1~50) ───
const SW_NUMS = [
  'moja','mbili','tatu','nne','tano','sita','saba','nane','tisa','kumi',
  'kumi na moja','kumi na mbili','kumi na tatu','kumi na nne','kumi na tano',
  'kumi na sita','kumi na saba','kumi na nane','kumi na tisa','ishirini',
  'ishirini na moja','ishirini na mbili','ishirini na tatu','ishirini na nne','ishirini na tano',
  'ishirini na sita','ishirini na saba','ishirini na nane','ishirini na tisa','thelathini',
  'thelathini na moja','thelathini na mbili','thelathini na tatu','thelathini na nne','thelathini na tano',
  'thelathini na sita','thelathini na saba','thelathini na nane','thelathini na tisa','arobaini',
  'arobaini na moja','arobaini na mbili','arobaini na tatu','arobaini na nne','arobaini na tano',
  'arobaini na sita','arobaini na saba','arobaini na nane','arobaini na tisa','hamsini',
]

// ─── 영어 숫자 (1~50) ───
const EN_NUMS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five',
  'twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'thirty-one','thirty-two','thirty-three','thirty-four','thirty-five',
  'thirty-six','thirty-seven','thirty-eight','thirty-nine','forty',
  'forty-one','forty-two','forty-three','forty-four','forty-five',
  'forty-six','forty-seven','forty-eight','forty-nine','fifty',
]

// ─── 한자어 숫자 1~50 (전체) ───
const SINO_KO_50 = [
  '일','이','삼','사','오','육','칠','팔','구','십',
  '십일','십이','십삼','십사','십오','십육','십칠','십팔','십구','이십',
  '이십일','이십이','이십삼','이십사','이십오','이십육','이십칠','이십팔','이십구','삼십',
  '삼십일','삼십이','삼십삼','삼십사','삼십오','삼십육','삼십칠','삼십팔','삼십구','사십',
  '사십일','사십이','사십삼','사십사','사십오','사십육','사십칠','사십팔','사십구','오십',
]

// ─── 고유어 숫자 1~50 (전체) ───
const NATIVE_KO_50 = [
  '하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열',
  '열하나','열둘','열셋','열넷','열다섯','열여섯','열일곱','열여덟','열아홉','스물',
  '스물하나','스물둘','스물셋','스물넷','스물다섯','스물여섯','스물일곱','스물여덟','스물아홉','서른',
  '서른하나','서른둘','서른셋','서른넷','서른다섯','서른여섯','서른일곱','서른여덟','서른아홉','마흔',
  '마흔하나','마흔둘','마흔셋','마흔넷','마흔다섯','마흔여섯','마흔일곱','마흔여덟','마흔아홉','쉰',
]

// ─── KO 모드용 meaning_ko: "하나(일)" 형식 ───
const KO_MEANING = NATIVE_KO_50.map((native, i) => `${native}(${SINO_KO_50[i]})`)

interface GeneratedEntry {
  word: string
  word_pronunciation: string
  meaning_sw: string
  meaning_ko: string
  meaning_en: string
  meaning_en_pronunciation: string
  example: string
  example_pronunciation: string
  example_translation_sw: string
  example_translation_ko: string
  example_translation_en: string
  pos: string
}

// ─── GPT 생성 ───
async function generateBatch(
  mode: 'sw' | 'ko',
  items: Array<{ num: number; word: string; meaningKo: string; meaningSw: string; meaningEn: string }>,
): Promise<GeneratedEntry[]> {
  const systemPrompt = mode === 'sw'
    ? `You are an expert linguist creating Korean vocabulary entries for Swahili speakers.
For each Korean number word provided, create a vocabulary entry with these exact fields:
1. word: The Korean number word (EXACTLY as provided)
2. word_pronunciation: Korean romanization (Revised Romanization)
3. meaning_sw: Swahili meaning (EXACTLY as provided)
4. meaning_ko: Korean definition (the number + counter context)
5. meaning_en: English meaning (EXACTLY as provided)
6. meaning_en_pronunciation: IPA pronunciation of English meaning
7. example: A natural Korean example sentence using this number
8. example_pronunciation: Romanization of Korean example
9. example_translation_sw: Swahili translation of example
10. example_translation_ko: Same as example
11. example_translation_en: English translation of example
12. pos: "noun"

CRITICAL: Use the EXACT word, meaning_sw, and meaning_en values I provide. Do NOT change them.
Return a JSON object with key "entries" containing an array.`
    : `You are an expert linguist creating Swahili vocabulary entries for Korean speakers.
For each Swahili number word provided, create a vocabulary entry with these exact fields:
1. word: The Swahili number word (EXACTLY as provided)
2. word_pronunciation: Phonetic pronunciation guide for Korean speakers
3. meaning_sw: Swahili definition
4. meaning_ko: Korean meaning (EXACTLY as provided - format: 하나(일), 둘(이) etc.)
5. meaning_en: English meaning (EXACTLY as provided)
6. meaning_en_pronunciation: IPA pronunciation of English meaning
7. example: A natural Swahili example sentence using this number
8. example_pronunciation: Phonetic pronunciation for Korean speakers
9. example_translation_sw: Same as example
10. example_translation_ko: Korean translation of example
11. example_translation_en: English translation of example
12. pos: "noun"

CRITICAL: Use the EXACT word, meaning_ko, and meaning_en values I provide. Do NOT change them.
Return a JSON object with key "entries" containing an array.`

  const wordList = items
    .map((it) => `${it.num}. word="${it.word}" meaning_ko="${it.meaningKo}" meaning_sw="${it.meaningSw}" meaning_en="${it.meaningEn}"`)
    .join('\n')

  console.log(`   🤖 GPT-5.2 Pro: ${items.length}개 생성 중...`)

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate vocabulary entries for these ${items.length} number words. Use EXACTLY the word and meaning values provided:\n\n${wordList}\n\nReturn {"entries": [...]} with exactly ${items.length} entries in order.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_completion_tokens: 16000,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No GPT response')
  const parsed = JSON.parse(content)
  let entries: GeneratedEntry[]
  if (Array.isArray(parsed)) entries = parsed
  else if (parsed.entries && Array.isArray(parsed.entries)) entries = parsed.entries
  else {
    const k = Object.keys(parsed).find((k) => Array.isArray(parsed[k]))
    entries = k ? parsed[k] : []
  }

  // 검증 + word 강제 보정
  for (let i = 0; i < Math.min(entries.length, items.length); i++) {
    if (!entries[i] || typeof entries[i].word !== 'string') continue
    entries[i].word = items[i].word
    entries[i].meaning_en = items[i].meaningEn
    if (mode === 'sw') {
      entries[i].meaning_sw = items[i].meaningSw
    } else {
      entries[i].meaning_ko = items[i].meaningKo
    }
  }

  entries = entries.filter((e) => e && typeof e.word === 'string' && e.word.length > 0)
  console.log(`   ✅ ${entries.length}개 완료`)
  return entries
}

// ─── TTS + 업로드 ───
async function generateTTS(text: string): Promise<Buffer> {
  const res = await openai.audio.speech.create({ model: TTS_MODEL, voice: TTS_VOICE, input: text, speed: 0.9 })
  return Buffer.from(await res.arrayBuffer())
}

async function uploadAudio(buf: Buffer, filename: string): Promise<string | null> {
  const { error } = await supabase.storage.from('vocabaudio').upload(filename, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) { console.error(`   ❌ 업로드 실패: ${filename}`, error.message); return null }
  const { data } = supabase.storage.from('vocabaudio').getPublicUrl(filename)
  return data?.publicUrl || null
}

async function saveEntry(mode: string, entry: GeneratedEntry, idx: number): Promise<string> {
  console.log(`   🔊 [${idx}] "${entry.word}" TTS + 저장...`)
  const ts = Date.now()
  const p = `numfix/${mode}`

  const wa = await generateTTS(entry.word)
  const msa = await generateTTS(entry.meaning_sw)
  const mka = await generateTTS(entry.meaning_ko)
  const mea = await generateTTS(entry.meaning_en)
  const exa = await generateTTS(entry.example)

  const waUrl = await uploadAudio(wa, `${p}/${ts}_w_${idx}.mp3`)
  const msaUrl = await uploadAudio(msa, `${p}/${ts}_msw_${idx}.mp3`)
  const mkaUrl = await uploadAudio(mka, `${p}/${ts}_mko_${idx}.mp3`)
  const meaUrl = await uploadAudio(mea, `${p}/${ts}_men_${idx}.mp3`)
  const exaUrl = await uploadAudio(exa, `${p}/${ts}_ex_${idx}.mp3`)

  const row = {
    mode,
    word: entry.word,
    word_pronunciation: entry.word_pronunciation,
    word_audio_url: waUrl,
    meaning_sw: entry.meaning_sw,
    meaning_sw_pronunciation: null as string | null,
    meaning_sw_audio_url: msaUrl,
    meaning_ko: entry.meaning_ko,
    meaning_ko_pronunciation: null as string | null,
    meaning_ko_audio_url: mkaUrl,
    meaning_en: entry.meaning_en,
    meaning_en_pronunciation: entry.meaning_en_pronunciation,
    meaning_en_audio_url: meaUrl,
    example: entry.example,
    example_pronunciation: entry.example_pronunciation,
    example_audio_url: exaUrl,
    example_translation_sw: entry.example_translation_sw,
    example_translation_ko: entry.example_translation_ko,
    example_translation_en: entry.example_translation_en,
    pos: entry.pos || 'noun',
    category: '숫자',
  }

  // 동일 mode+word가 이미 존재하면 업데이트, 아니면 새로 삽입
  const { data: existing } = await supabase
    .from('generated_vocab')
    .select('id')
    .eq('mode', mode)
    .eq('word', entry.word)
    .limit(1)

  if (existing && existing.length > 0) {
    const existId = existing[0].id
    const { error: upErr } = await supabase.from('generated_vocab').update(row).eq('id', existId)
    if (upErr) throw new Error(`DB 업데이트 실패: ${upErr.message}`)
    console.log(`   ✅ "${entry.word}" 업데이트 → ${existId}`)
    return existId
  }

  const { data, error } = await supabase.from('generated_vocab').insert(row).select('id')
  if (error) throw new Error(`DB 저장 실패: ${error.message}`)
  console.log(`   ✅ "${entry.word}" 신규 → ${data[0].id}`)
  return data[0].id
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🔧 숫자 1~50 데이터 수정 시작 (GPT-5.2 Pro)')
  console.log('═'.repeat(60))

  // 1단계: 기존 잘못된 숫자 데이터 삭제 (category='숫자')
  console.log('\n🗑️ 기존 category=숫자 데이터 삭제 중...')
  const { data: existingNums, error: fetchErr } = await supabase
    .from('generated_vocab')
    .select('id, word, mode')
    .eq('category', '숫자')
  if (fetchErr) throw fetchErr

  if (existingNums && existingNums.length > 0) {
    const ids = existingNums.map((r) => r.id)
    console.log(`   삭제 대상: ${ids.length}개`)
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      const { error: delErr } = await supabase.from('generated_vocab').delete().in('id', batch)
      if (delErr) console.error('   삭제 오류:', delErr.message)
    }
    console.log(`   ✅ ${ids.length}개 삭제 완료`)
  } else {
    console.log('   삭제할 데이터 없음')
  }

  // ═══════════════════════════════════════
  // 2단계: SW 모드 (스와힐리어 사용자 = 한국어 단어 학습)
  // 1~25: 한자어 (일, 이, 삼...)
  // 26~50: 고유어 (하나, 둘, 셋...)
  // ═══════════════════════════════════════
  console.log('\n' + '═'.repeat(60))
  console.log('📘 SW 모드: 1~25 한자어 + 26~50 고유어')
  console.log('═'.repeat(60))

  const swItems: Array<{ num: number; word: string; meaningKo: string; meaningSw: string; meaningEn: string }> = []

  // 1~25 한자어
  for (let i = 0; i < 25; i++) {
    swItems.push({
      num: i + 1,
      word: SINO_KO[i],
      meaningKo: `${SINO_KO[i]} (숫자 ${i + 1})`,
      meaningSw: SW_NUMS[i],
      meaningEn: EN_NUMS[i],
    })
  }
  // 26~50 고유어 (숫자 1~25의 고유어 표현)
  for (let i = 0; i < 25; i++) {
    swItems.push({
      num: i + 26,
      word: NATIVE_KO[i],
      meaningKo: `${NATIVE_KO[i]} (숫자 ${i + 1}, 고유어)`,
      meaningSw: SW_NUMS[i],
      meaningEn: EN_NUMS[i],
    })
  }

  const swIds: string[] = []
  const BATCH = 10

  // GPT 배치 생성
  const allSwEntries: GeneratedEntry[] = []
  for (let b = 0; b < swItems.length; b += BATCH) {
    const batch = swItems.slice(b, b + BATCH)
    const entries = await generateBatch('sw', batch)
    allSwEntries.push(...entries)
    if (b + BATCH < swItems.length) await new Promise((r) => setTimeout(r, 2000))
  }

  // TTS + DB 저장
  console.log('\n💾 SW 모드 저장 중...')
  for (let i = 0; i < allSwEntries.length; i++) {
    try {
      const id = await saveEntry('sw', allSwEntries[i], i + 1)
      swIds.push(id)
    } catch (err) {
      console.error(`   ❌ ${i + 1}번 저장 실패:`, err)
      swIds.push('')
    }
    if (i < allSwEntries.length - 1) await new Promise((r) => setTimeout(r, 300))
  }

  // ═══════════════════════════════════════
  // 3단계: KO 모드 (한국어 사용자 = 스와힐리어 단어 학습)
  // 1~50: 스와힐리어 숫자, meaning_ko = "하나(일)" 형식
  // ═══════════════════════════════════════
  console.log('\n' + '═'.repeat(60))
  console.log('📗 KO 모드: 1~50 스와힐리어 숫자 (뜻: 하나(일) 형식)')
  console.log('═'.repeat(60))

  const koItems: Array<{ num: number; word: string; meaningKo: string; meaningSw: string; meaningEn: string }> = []
  for (let i = 0; i < 50; i++) {
    koItems.push({
      num: i + 1,
      word: SW_NUMS[i],
      meaningKo: KO_MEANING[i],
      meaningSw: `nambari ${i + 1}`,
      meaningEn: EN_NUMS[i],
    })
  }

  const koIds: string[] = []
  const allKoEntries: GeneratedEntry[] = []
  for (let b = 0; b < koItems.length; b += BATCH) {
    const batch = koItems.slice(b, b + BATCH)
    const entries = await generateBatch('ko', batch)
    allKoEntries.push(...entries)
    if (b + BATCH < koItems.length) await new Promise((r) => setTimeout(r, 2000))
  }

  console.log('\n💾 KO 모드 저장 중...')
  for (let i = 0; i < allKoEntries.length; i++) {
    try {
      const id = await saveEntry('ko', allKoEntries[i], i + 1)
      koIds.push(id)
    } catch (err) {
      console.error(`   ❌ ${i + 1}번 저장 실패:`, err)
      koIds.push('')
    }
    if (i < allKoEntries.length - 1) await new Promise((r) => setTimeout(r, 300))
  }

  // 4단계: numberOrder.ts 업데이트
  const outputPath = path.join(process.cwd(), 'src', 'lib', 'numberOrder.ts')
  const tsContent = `// 숫자 1~50 순서 매핑 (GPT-5.2 Pro 생성)
// SW 모드: 1~25 한자어(일,이,삼...), 26~50 고유어(하나,둘,셋...)
// KO 모드: 1~50 스와힐리어(moja~hamsini), meaning_ko = 하나(일)형식
// 생성일: ${new Date().toISOString()}

export const NUMBER_ORDER: Record<string, string[]> = {
  sw: ${JSON.stringify(swIds)},
  ko: ${JSON.stringify(koIds)},
}
`
  fs.writeFileSync(outputPath, tsContent, 'utf-8')

  // 5단계: 분류 데이터 업데이트
  const classPath = path.join(process.cwd(), 'src', 'lib', 'topicClassification.ts')
  if (fs.existsSync(classPath)) {
    let content = fs.readFileSync(classPath, 'utf-8')
    const m = content.match(/const data: Record<string, string\[\]> = ({[\s\S]*?})\n\nexport/)
    if (m) {
      const existingData = JSON.parse(m[1]) as Record<string, string[]>
      for (const id of swIds.filter(Boolean)) {
        existingData[id] = ['sw', '숫자/수량', '숫자1-50']
      }
      for (const id of koIds.filter(Boolean)) {
        existingData[id] = ['ko', '숫자/수량', '숫자1-50']
      }
      content = content.replace(
        /const data: Record<string, string\[\]> = {[\s\S]*?}\n\nexport/,
        `const data: Record<string, string[]> = ${JSON.stringify(existingData)}\n\nexport`,
      )
      fs.writeFileSync(classPath, content, 'utf-8')
      console.log('\n✅ 분류 데이터 업데이트 완료')
    }
  }

  console.log(`\n✅ 순서 매핑 저장: ${outputPath}`)
  console.log(`   SW: ${swIds.filter(Boolean).length}/50`)
  console.log(`   KO: ${koIds.filter(Boolean).length}/50`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
