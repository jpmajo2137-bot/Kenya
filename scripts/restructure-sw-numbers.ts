/**
 * SW 모드 숫자 단어장 재구성
 * 1~30: 한자어 (일~삼십)
 * 31~37: 사십, 오십, 육십, 칠십, 팔십, 구십, 백
 * 38~41: 예순, 일흔, 여든, 아흔
 *
 * 모든 데이터: GPT-5.2 Pro (텍스트+이미지)
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

const { NUMBER_ORDER } = await import('../src/lib/numberOrder')

// ═══ 전체 단어 목록 정의 ═══
const ALL_WORDS: Array<{ word: string; num: number; meaningSw: string; meaningEn: string }> = []

// 1~30: 한자어
const SINO = ['일','이','삼','사','오','육','칠','팔','구','십',
  '십일','십이','십삼','십사','십오','십육','십칠','십팔','십구','이십',
  '이십일','이십이','이십삼','이십사','이십오','이십육','이십칠','이십팔','이십구','삼십']
const SW_1_30 = ['moja','mbili','tatu','nne','tano','sita','saba','nane','tisa','kumi',
  'kumi na moja','kumi na mbili','kumi na tatu','kumi na nne','kumi na tano',
  'kumi na sita','kumi na saba','kumi na nane','kumi na tisa','ishirini',
  'ishirini na moja','ishirini na mbili','ishirini na tatu','ishirini na nne','ishirini na tano',
  'ishirini na sita','ishirini na saba','ishirini na nane','ishirini na tisa','thelathini']
const EN_1_30 = ['one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five',
  'twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty']

for (let i = 0; i < 30; i++) {
  ALL_WORDS.push({ word: SINO[i], num: i + 1, meaningSw: SW_1_30[i], meaningEn: EN_1_30[i] })
}

// 31~37: 한자어 큰 숫자
const SINO_BIG = [
  { word: '사십', num: 40, sw: 'arobaini', en: 'forty' },
  { word: '오십', num: 50, sw: 'hamsini', en: 'fifty' },
  { word: '육십', num: 60, sw: 'sitini', en: 'sixty' },
  { word: '칠십', num: 70, sw: 'sabini', en: 'seventy' },
  { word: '팔십', num: 80, sw: 'themanini', en: 'eighty' },
  { word: '구십', num: 90, sw: 'tisini', en: 'ninety' },
  { word: '백', num: 100, sw: 'mia', en: 'one hundred' },
]
for (const s of SINO_BIG) {
  ALL_WORDS.push({ word: s.word, num: s.num, meaningSw: s.sw, meaningEn: s.en })
}

// 38~41: 고유어 큰 숫자
const NATIVE_BIG = [
  { word: '예순', num: 60, sw: 'sitini', en: 'sixty (native Korean)' },
  { word: '일흔', num: 70, sw: 'sabini', en: 'seventy (native Korean)' },
  { word: '여든', num: 80, sw: 'themanini', en: 'eighty (native Korean)' },
  { word: '아흔', num: 90, sw: 'tisini', en: 'ninety (native Korean)' },
]
for (const n of NATIVE_BIG) {
  ALL_WORDS.push({ word: n.word, num: n.num, meaningSw: n.sw, meaningEn: n.en })
}

console.log(`총 ${ALL_WORDS.length}개 단어`)

interface GenEntry {
  word: string; word_pronunciation: string
  meaning_sw: string; meaning_ko: string; meaning_en: string; meaning_en_pronunciation: string
  example: string; example_pronunciation: string
  example_translation_sw: string; example_translation_ko: string; example_translation_en: string
  pos: string
}

async function findWord(word: string): Promise<string | null> {
  const { data } = await supabase.from('generated_vocab').select('id').eq('mode', 'sw').eq('word', word).limit(1)
  return data?.[0]?.id || null
}

async function generateBatch(
  items: Array<{ word: string; meaningSw: string; meaningEn: string; num: number }>,
): Promise<GenEntry[]> {
  const list = items.map((it, i) =>
    `${i + 1}. word="${it.word}" meaning_sw="${it.meaningSw}" meaning_en="${it.meaningEn}" (숫자 ${it.num})`
  ).join('\n')

  console.log(`   🤖 GPT-5.2 Pro: ${items.length}개 생성 중...`)
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: `You are an expert linguist creating Korean number vocabulary entries for Swahili speakers.
For each Korean number word, create these fields:
word, word_pronunciation (romanization), meaning_sw (Swahili), meaning_ko (Korean definition),
meaning_en (English), meaning_en_pronunciation (IPA), example (Korean sentence),
example_pronunciation (romanization), example_translation_sw, example_translation_ko,
example_translation_en, pos ("noun").
Use EXACTLY the word, meaning_sw, meaning_en values I provide. Return valid JSON: {"entries":[...]}` },
      { role: 'user', content: `Generate vocabulary entries for these Korean numbers as JSON:\n${list}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_completion_tokens: 16000,
  })

  const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
  let entries: GenEntry[] = parsed.entries || []
  if (!Array.isArray(entries)) {
    const k = Object.keys(parsed).find((k) => Array.isArray(parsed[k]))
    entries = k ? parsed[k] : []
  }
  for (let i = 0; i < Math.min(entries.length, items.length); i++) {
    entries[i].word = items[i].word
    entries[i].meaning_sw = items[i].meaningSw
    entries[i].meaning_en = items[i].meaningEn
  }
  console.log(`   ✅ ${entries.length}개 완료`)
  return entries
}

async function generateTTS(text: string): Promise<Buffer> {
  const r = await openai.audio.speech.create({ model: TTS_MODEL, voice: TTS_VOICE, input: text, speed: 0.9 })
  return Buffer.from(await r.arrayBuffer())
}

async function uploadAudio(buf: Buffer, fn: string): Promise<string | null> {
  const { error } = await supabase.storage.from('vocabaudio').upload(fn, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) return null
  const { data } = supabase.storage.from('vocabaudio').getPublicUrl(fn)
  return data?.publicUrl || null
}

async function genImage(num: number): Promise<string | null> {
  try {
    const response = await (openai as any).responses.create({
      model: 'gpt-5.2-pro',
      input: `Generate an image of the number "${num}" as a large, bold, playful 3D digit on a pure white background. Vibrant gradient colors (blue to purple). Cartoon balloon style. No other objects or text. Just "${num}".`,
      tools: [{ type: 'image_generation', size: '1024x1024', quality: 'medium' }],
    })
    const imgOut = response.output?.find((o: any) => o.type === 'image_generation_call')
    if (!imgOut?.result) return null
    const buf = Buffer.from(imgOut.result, 'base64')
    const ts = Date.now()
    const fn = `numbers/v3/${ts}_${num}.png`
    const { error } = await supabase.storage.from('vocabaudio').upload(fn, buf, { contentType: 'image/png', upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('vocabaudio').getPublicUrl(fn)
    return data?.publicUrl || null
  } catch (e: any) {
    console.error(`   ⚠️ 이미지 ${num} 실패: ${e.message}`)
    return null
  }
}

async function saveEntry(entry: GenEntry, idx: number, imageUrl: string | null): Promise<string> {
  const ts = Date.now()
  const p = `numv3/sw`
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
    mode: 'sw', word: entry.word, word_pronunciation: entry.word_pronunciation,
    word_audio_url: waUrl, image_url: imageUrl,
    meaning_sw: entry.meaning_sw, meaning_sw_pronunciation: null as string|null, meaning_sw_audio_url: msaUrl,
    meaning_ko: entry.meaning_ko, meaning_ko_pronunciation: null as string|null, meaning_ko_audio_url: mkaUrl,
    meaning_en: entry.meaning_en, meaning_en_pronunciation: entry.meaning_en_pronunciation, meaning_en_audio_url: meaUrl,
    example: entry.example, example_pronunciation: entry.example_pronunciation, example_audio_url: exaUrl,
    example_translation_sw: entry.example_translation_sw,
    example_translation_ko: entry.example_translation_ko,
    example_translation_en: entry.example_translation_en,
    pos: entry.pos || 'noun', category: '숫자',
  }

  const { data: exist } = await supabase.from('generated_vocab').select('id').eq('mode','sw').eq('word',entry.word).limit(1)
  if (exist && exist.length > 0) {
    await supabase.from('generated_vocab').update(row).eq('id', exist[0].id)
    console.log(`   ✅ "${entry.word}" 업데이트 → ${exist[0].id}`)
    return exist[0].id
  }
  const { data, error } = await supabase.from('generated_vocab').insert(row).select('id')
  if (error) throw new Error(`저장 실패: ${error.message}`)
  console.log(`   ✅ "${entry.word}" 신규 → ${data[0].id}`)
  return data[0].id
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🔧 SW 숫자 단어장 재구성 (GPT-5.2 Pro 전체)')
  console.log(`   1~30: 한자어(일~삼십)`)
  console.log(`   31~37: 사십, 오십, 육십, 칠십, 팔십, 구십, 백`)
  console.log(`   38~41: 예순, 일흔, 여든, 아흔`)
  console.log('═'.repeat(60))

  const finalIds: string[] = []

  // ──── 기존 단어 검색 ────
  console.log('\n📡 기존 단어 검색...')
  const missing: number[] = []
  for (let i = 0; i < ALL_WORDS.length; i++) {
    const w = ALL_WORDS[i]
    const id = await findWord(w.word)
    if (id) {
      finalIds.push(id)
      console.log(`   [${i+1}] "${w.word}" ♻️`)
    } else {
      finalIds.push('')
      missing.push(i)
      console.log(`   [${i+1}] "${w.word}" ❌ 생성 필요`)
    }
  }

  console.log(`\n📊 기존: ${ALL_WORDS.length - missing.length}개, 생성 필요: ${missing.length}개`)

  // ──── 없는 단어 GPT 생성 ────
  if (missing.length > 0) {
    const BATCH = 10
    const allEntries: Array<{ idx: number; entry: GenEntry }> = []

    for (let b = 0; b < missing.length; b += BATCH) {
      const batchIdxs = missing.slice(b, b + BATCH)
      const items = batchIdxs.map((i) => ({
        word: ALL_WORDS[i].word,
        meaningSw: ALL_WORDS[i].meaningSw,
        meaningEn: ALL_WORDS[i].meaningEn,
        num: ALL_WORDS[i].num,
      }))
      const entries = await generateBatch(items)
      for (let j = 0; j < batchIdxs.length && j < entries.length; j++) {
        allEntries.push({ idx: batchIdxs[j], entry: entries[j] })
      }
      if (b + BATCH < missing.length) await new Promise((r) => setTimeout(r, 2000))
    }

    // ──── TTS + 이미지 + DB 저장 ────
    console.log('\n💾 신규 단어 저장 (TTS + GPT-5.2 Pro 이미지)...')
    for (const { idx, entry } of allEntries) {
      const num = ALL_WORDS[idx].num
      console.log(`   🖼️ [${idx+1}] "${entry.word}" (숫자 ${num}) 이미지 생성...`)
      const imgUrl = await genImage(num)
      try {
        const id = await saveEntry(entry, idx + 1, imgUrl)
        finalIds[idx] = id
      } catch (e: any) {
        console.error(`   ❌ "${ALL_WORDS[idx].word}" 실패:`, e.message)
      }
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  // ──── 기존 단어 이미지 강제 업데이트 ────
  console.log('\n🖼️ 기존 단어 이미지 업데이트...')
  const imgCache = new Map<number, string>()

  for (let i = 0; i < finalIds.length; i++) {
    const id = finalIds[i]
    if (!id) continue
    const num = ALL_WORDS[i].num

    if (!imgCache.has(num)) {
      console.log(`   [${i+1}] "${ALL_WORDS[i].word}" → 숫자 ${num} 이미지 생성...`)
      const url = await genImage(num)
      if (url) imgCache.set(num, url)
      await new Promise((r) => setTimeout(r, 1000))
    }

    const imgUrl = imgCache.get(num)
    if (imgUrl) {
      await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
      console.log(`   ✅ [${i+1}] 이미지 적용`)
    }
  }

  // ──── numberOrder.ts 업데이트 ────
  const koIds = NUMBER_ORDER.ko || []
  const outputPath = path.join(process.cwd(), 'src', 'lib', 'numberOrder.ts')
  const tsContent = `// 숫자 단어장 순서 매핑
// SW: 1~30 한자어(일~삼십), 31~37 한자어(사십~백), 38~41 고유어(예순~아흔)
// KO: 1~50 스와힐리어(moja~hamsini)
// 생성일: ${new Date().toISOString()}

export const NUMBER_ORDER: Record<string, string[]> = {
  sw: ${JSON.stringify(finalIds)},
  ko: ${JSON.stringify(koIds)},
}
`
  fs.writeFileSync(outputPath, tsContent, 'utf-8')

  console.log(`\n✅ 완료! SW: ${finalIds.filter(Boolean).length}/${ALL_WORDS.length}`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
