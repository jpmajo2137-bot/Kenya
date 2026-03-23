/**
 * SW 모드 숫자 단어장 구조 변경
 * 1~35: 한자어 (일~삼십오)
 * 36~50: 고유어 핵심 15개 (하나,둘,셋,넷,다섯,여섯,일곱,여덟,아홉,열,열하나,스물,서른,마흔,쉰)
 *
 * 없는 단어만 GPT-5.2 Pro로 새로 생성
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

// 기존 numberOrder 읽기
const { NUMBER_ORDER } = await import('../src/lib/numberOrder')

// ─── 1~35: 한자어 숫자 ───
const SINO = [
  '일','이','삼','사','오','육','칠','팔','구','십',
  '십일','십이','십삼','십사','십오','십육','십칠','십팔','십구','이십',
  '이십일','이십이','이십삼','이십사','이십오','이십육','이십칠','이십팔','이십구','삼십',
  '삼십일','삼십이','삼십삼','삼십사','삼십오',
]

// ─── 36~50: 고유어 핵심 ───
const NATIVE = [
  '하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열',
  '열하나','스물','서른','마흔','쉰',
]

// 고유어가 나타내는 실제 숫자 (이미지용)
const NATIVE_NUM = [1,2,3,4,5,6,7,8,9,10,11,20,30,40,50]

// 스와힐리어 대응
const SW_FOR_SINO = [
  'moja','mbili','tatu','nne','tano','sita','saba','nane','tisa','kumi',
  'kumi na moja','kumi na mbili','kumi na tatu','kumi na nne','kumi na tano',
  'kumi na sita','kumi na saba','kumi na nane','kumi na tisa','ishirini',
  'ishirini na moja','ishirini na mbili','ishirini na tatu','ishirini na nne','ishirini na tano',
  'ishirini na sita','ishirini na saba','ishirini na nane','ishirini na tisa','thelathini',
  'thelathini na moja','thelathini na mbili','thelathini na tatu','thelathini na nne','thelathini na tano',
]
const SW_FOR_NATIVE = [
  'moja','mbili','tatu','nne','tano','sita','saba','nane','tisa','kumi',
  'kumi na moja','ishirini','thelathini','arobaini','hamsini',
]

const EN_FOR_SINO = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five',
  'twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'thirty-one','thirty-two','thirty-three','thirty-four','thirty-five',
]
const EN_FOR_NATIVE = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twenty','thirty','forty','fifty',
]

interface GenEntry {
  word: string; word_pronunciation: string
  meaning_sw: string; meaning_ko: string; meaning_en: string; meaning_en_pronunciation: string
  example: string; example_pronunciation: string
  example_translation_sw: string; example_translation_ko: string; example_translation_en: string
  pos: string
}

async function findWord(word: string): Promise<string | null> {
  const { data } = await supabase
    .from('generated_vocab')
    .select('id')
    .eq('mode', 'sw')
    .eq('word', word)
    .limit(1)
  return data?.[0]?.id || null
}

async function generateBatch(
  items: Array<{ word: string; meaningSw: string; meaningEn: string; numLabel: string }>,
): Promise<GenEntry[]> {
  const list = items.map((it, i) =>
    `${i + 1}. word="${it.word}" meaning_sw="${it.meaningSw}" meaning_en="${it.meaningEn}" (숫자 ${it.numLabel})`
  ).join('\n')

  console.log(`   🤖 GPT-5.2 Pro: ${items.length}개 생성 중...`)
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: `You are an expert linguist creating Korean vocabulary entries for Swahili speakers.
For each Korean number word, create:
word, word_pronunciation (romanization), meaning_sw (Swahili), meaning_ko (Korean def), meaning_en (English),
meaning_en_pronunciation (IPA), example (Korean sentence using the number), example_pronunciation (romanization),
example_translation_sw, example_translation_ko, example_translation_en, pos ("noun").
Use EXACTLY the word, meaning_sw, meaning_en I provide. Return valid JSON object with key "entries" containing the array.` },
      { role: 'user', content: `Generate vocabulary entries for these numbers as JSON:\n${list}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_completion_tokens: 16000,
  })

  const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
  let entries: GenEntry[] = parsed.entries || parsed.vocabulary || []
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

async function generateDigitImage(num: number): Promise<string | null> {
  try {
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: `A large, bold, playful 3D number "${num}" centered on a pure white background. Vibrant gradient colors (blue to purple). Cartoon balloon style. No other objects, no other text. Just the single number "${num}".`,
      n: 1, size: '1024x1024', quality: 'standard',
    })
    const url = res.data[0]?.url
    if (!url) return null
    const imgBuf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const ts = Date.now()
    const { error } = await supabase.storage.from('vocabaudio').upload(`numbers/d2/${ts}_${num}.png`, imgBuf, { contentType: 'image/png', upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('vocabaudio').getPublicUrl(`numbers/d2/${ts}_${num}.png`)
    return data?.publicUrl || null
  } catch { return null }
}

async function saveEntry(entry: GenEntry, idx: number, imageUrl: string | null): Promise<string> {
  const ts = Date.now()
  const p = `numfix2/sw`
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
  console.log('🔧 SW 모드 숫자 구조 변경: 1~35 한자어 + 36~50 고유어 핵심')
  console.log('═'.repeat(60))

  const finalIds: string[] = []

  // ──────── 1~35: 한자어 ────────
  console.log('\n📘 1~35 한자어 검색/생성...')
  const missingIdx: number[] = []

  for (let i = 0; i < 35; i++) {
    const word = SINO[i]
    const id = await findWord(word)
    if (id) {
      finalIds.push(id)
      console.log(`   [${i+1}] "${word}" ♻️ ${id}`)
    } else {
      finalIds.push('')
      missingIdx.push(i)
      console.log(`   [${i+1}] "${word}" ❌ 생성 필요`)
    }
  }

  if (missingIdx.length > 0) {
    const items = missingIdx.map((i) => ({
      word: SINO[i], meaningSw: SW_FOR_SINO[i], meaningEn: EN_FOR_SINO[i], numLabel: String(i + 1),
    }))
    const entries = await generateBatch(items)

    console.log('\n💾 한자어 신규 저장...')
    for (let j = 0; j < missingIdx.length; j++) {
      const i = missingIdx[j]
      const entry = entries[j]
      if (!entry) continue
      // 이미지 생성
      console.log(`   🖼️ 숫자 ${i+1} 이미지 생성...`)
      const imgUrl = await generateDigitImage(i + 1)
      try {
        const id = await saveEntry(entry, i + 1, imgUrl)
        finalIds[i] = id
      } catch (e: any) { console.error(`   ❌ ${SINO[i]} 실패:`, e.message) }
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  // ──────── 36~50: 고유어 핵심 ────────
  console.log('\n📗 36~50 고유어 핵심 검색/생성...')
  const nativeMissingIdx: number[] = []

  for (let i = 0; i < 15; i++) {
    const word = NATIVE[i]
    const id = await findWord(word)
    if (id) {
      finalIds.push(id)
      console.log(`   [${i+36}] "${word}" ♻️ ${id}`)
    } else {
      finalIds.push('')
      nativeMissingIdx.push(i)
      console.log(`   [${i+36}] "${word}" ❌ 생성 필요`)
    }
  }

  if (nativeMissingIdx.length > 0) {
    const items = nativeMissingIdx.map((i) => ({
      word: NATIVE[i], meaningSw: SW_FOR_NATIVE[i], meaningEn: EN_FOR_NATIVE[i], numLabel: String(NATIVE_NUM[i]),
    }))
    const entries = await generateBatch(items)

    console.log('\n💾 고유어 신규 저장...')
    for (let j = 0; j < nativeMissingIdx.length; j++) {
      const i = nativeMissingIdx[j]
      const entry = entries[j]
      if (!entry) continue
      const numVal = NATIVE_NUM[i]
      console.log(`   🖼️ 숫자 ${numVal} 이미지 생성...`)
      const imgUrl = await generateDigitImage(numVal)
      try {
        const id = await saveEntry(entry, 35 + i + 1, imgUrl)
        finalIds[35 + i] = id
      } catch (e: any) { console.error(`   ❌ ${NATIVE[i]} 실패:`, e.message) }
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  // ──────── 기존 이미지가 없거나 잘못된 것 수정 ────────
  console.log('\n🖼️ 이미지 확인/수정...')
  for (let i = 0; i < finalIds.length; i++) {
    const id = finalIds[i]
    if (!id) continue
    const numVal = i < 35 ? (i + 1) : NATIVE_NUM[i - 35]
    const { data } = await supabase.from('generated_vocab').select('image_url').eq('id', id).single()
    if (data?.image_url) continue // 이미 있음
    console.log(`   [${i+1}] 이미지 없음 → 숫자 ${numVal} 생성...`)
    const imgUrl = await generateDigitImage(numVal)
    if (imgUrl) {
      await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
      console.log('   ✅')
    }
    await new Promise((r) => setTimeout(r, 1500))
  }

  // ──────── numberOrder.ts 업데이트 ────────
  const koIds = NUMBER_ORDER.ko || []
  const outputPath = path.join(process.cwd(), 'src', 'lib', 'numberOrder.ts')
  const tsContent = `// 숫자 단어장 순서 매핑
// SW 모드: 1~35 한자어(일~삼십오), 36~50 고유어 핵심(하나,둘...쉰)
// KO 모드: 1~50 스와힐리어(moja~hamsini), meaning_ko = 하나(일)형식
// 생성일: ${new Date().toISOString()}

export const NUMBER_ORDER: Record<string, string[]> = {
  sw: ${JSON.stringify(finalIds)},
  ko: ${JSON.stringify(koIds)},
}
`
  fs.writeFileSync(outputPath, tsContent, 'utf-8')

  console.log(`\n✅ 완료!`)
  console.log(`   SW: ${finalIds.filter(Boolean).length}/50`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
