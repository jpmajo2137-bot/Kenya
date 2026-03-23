/**
 * SW 숫자 단어장: 38번부터 고유어 추가
 * 38~48: 하나, 둘, 셋, 넷, 다섯, 여섯, 일곱, 여덟, 아홉, 열, 열하나
 * 49~56: 스물, 서른, 마흔, 쉰, 예순, 일흔, 여든, 아흔
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY })
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)

const { NUMBER_ORDER } = await import('../src/lib/numberOrder')
const OPENAI_MODEL = 'gpt-5.2'
const TTS_MODEL = 'tts-1-hd'
const TTS_VOICE = 'nova'

// 38번부터 추가할 고유어 단어
const NATIVE_WORDS = [
  { word: '하나', num: 1, sw: 'moja', en: 'one' },
  { word: '둘', num: 2, sw: 'mbili', en: 'two' },
  { word: '셋', num: 3, sw: 'tatu', en: 'three' },
  { word: '넷', num: 4, sw: 'nne', en: 'four' },
  { word: '다섯', num: 5, sw: 'tano', en: 'five' },
  { word: '여섯', num: 6, sw: 'sita', en: 'six' },
  { word: '일곱', num: 7, sw: 'saba', en: 'seven' },
  { word: '여덟', num: 8, sw: 'nane', en: 'eight' },
  { word: '아홉', num: 9, sw: 'tisa', en: 'nine' },
  { word: '열', num: 10, sw: 'kumi', en: 'ten' },
  { word: '열하나', num: 11, sw: 'kumi na moja', en: 'eleven' },
  { word: '스물', num: 20, sw: 'ishirini', en: 'twenty' },
  { word: '서른', num: 30, sw: 'thelathini', en: 'thirty' },
  { word: '마흔', num: 40, sw: 'arobaini', en: 'forty' },
  { word: '쉰', num: 50, sw: 'hamsini', en: 'fifty' },
  { word: '예순', num: 60, sw: 'sitini', en: 'sixty' },
  { word: '일흔', num: 70, sw: 'sabini', en: 'seventy' },
  { word: '여든', num: 80, sw: 'themanini', en: 'eighty' },
  { word: '아흔', num: 90, sw: 'tisini', en: 'ninety' },
]

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

async function generateBatch(items: typeof NATIVE_WORDS): Promise<GenEntry[]> {
  const list = items.map((it, i) =>
    `${i+1}. word="${it.word}" meaning_sw="${it.sw}" meaning_en="${it.en}" (숫자 ${it.num}, 고유어)`
  ).join('\n')

  console.log(`   🤖 GPT-5.2 Pro: ${items.length}개 생성 중...`)
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: `You are an expert linguist creating Korean number vocabulary entries for Swahili speakers.
Create entries with: word, word_pronunciation, meaning_sw, meaning_ko, meaning_en, meaning_en_pronunciation,
example, example_pronunciation, example_translation_sw, example_translation_ko, example_translation_en, pos ("noun").
Use EXACTLY the word, meaning_sw, meaning_en I provide. Return valid JSON: {"entries":[...]}` },
      { role: 'user', content: `Generate vocabulary entries for these native Korean numbers as JSON:\n${list}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3, max_completion_tokens: 16000,
  })
  const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
  let entries: GenEntry[] = parsed.entries || []
  if (!Array.isArray(entries)) {
    const k = Object.keys(parsed).find((k) => Array.isArray(parsed[k]))
    entries = k ? parsed[k] : []
  }
  for (let i = 0; i < Math.min(entries.length, items.length); i++) {
    entries[i].word = items[i].word
    entries[i].meaning_sw = items[i].sw
    entries[i].meaning_en = items[i].en
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
    const fn = `numbers/v4/${ts}_${num}.png`
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
  const p = `numv4/sw`
  const wa = await generateTTS(entry.word)
  const msa = await generateTTS(entry.meaning_sw)
  const mka = await generateTTS(entry.meaning_ko)
  const mea = await generateTTS(entry.meaning_en)
  const exa = await generateTTS(entry.example)
  const row = {
    mode: 'sw', word: entry.word, word_pronunciation: entry.word_pronunciation,
    word_audio_url: await uploadAudio(wa, `${p}/${ts}_w_${idx}.mp3`), image_url: imageUrl,
    meaning_sw: entry.meaning_sw, meaning_sw_pronunciation: null as string|null,
    meaning_sw_audio_url: await uploadAudio(msa, `${p}/${ts}_msw_${idx}.mp3`),
    meaning_ko: entry.meaning_ko, meaning_ko_pronunciation: null as string|null,
    meaning_ko_audio_url: await uploadAudio(mka, `${p}/${ts}_mko_${idx}.mp3`),
    meaning_en: entry.meaning_en, meaning_en_pronunciation: entry.meaning_en_pronunciation,
    meaning_en_audio_url: await uploadAudio(mea, `${p}/${ts}_men_${idx}.mp3`),
    example: entry.example, example_pronunciation: entry.example_pronunciation,
    example_audio_url: await uploadAudio(exa, `${p}/${ts}_ex_${idx}.mp3`),
    example_translation_sw: entry.example_translation_sw,
    example_translation_ko: entry.example_translation_ko,
    example_translation_en: entry.example_translation_en,
    pos: 'noun', category: '숫자',
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
  console.log('🔧 SW 숫자: 38번부터 고유어 추가')
  console.log('   38~48: 하나~열하나')
  console.log('   49~56: 스물~아흔')
  console.log('═'.repeat(60))

  // 기존 1~37 유지
  const existingSw = NUMBER_ORDER.sw.slice(0, 37)
  console.log(`기존 1~37 유지 (${existingSw.length}개)`)

  // 38번부터 고유어
  const nativeIds: string[] = []
  const missing: number[] = []

  console.log('\n📡 고유어 검색...')
  for (let i = 0; i < NATIVE_WORDS.length; i++) {
    const w = NATIVE_WORDS[i]
    const id = await findWord(w.word)
    if (id) {
      nativeIds.push(id)
      console.log(`   [${38+i}] "${w.word}" ♻️`)
    } else {
      nativeIds.push('')
      missing.push(i)
      console.log(`   [${38+i}] "${w.word}" ❌ 생성 필요`)
    }
  }

  if (missing.length > 0) {
    const items = missing.map((i) => NATIVE_WORDS[i])
    const entries = await generateBatch(items)

    console.log('\n💾 신규 저장...')
    for (let j = 0; j < missing.length && j < entries.length; j++) {
      const i = missing[j]
      const num = NATIVE_WORDS[i].num
      console.log(`   🖼️ "${NATIVE_WORDS[i].word}" (${num}) 이미지 + TTS...`)
      const imgUrl = await genImage(num)
      try {
        const id = await saveEntry(entries[j], 38 + i, imgUrl)
        nativeIds[i] = id
      } catch (e: any) { console.error(`   ❌`, e.message) }
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  // 이미지 업데이트 (기존 단어도 숫자 이미지로)
  console.log('\n🖼️ 고유어 이미지 확인...')
  const imgCache = new Map<number, string>()
  for (let i = 0; i < nativeIds.length; i++) {
    const id = nativeIds[i]
    if (!id) continue
    const num = NATIVE_WORDS[i].num
    const { data } = await supabase.from('generated_vocab').select('image_url').eq('id', id).single()
    if (data?.image_url && data.image_url.includes('numbers/')) continue

    if (!imgCache.has(num)) {
      console.log(`   숫자 ${num} 이미지 생성...`)
      const url = await genImage(num)
      if (url) imgCache.set(num, url)
      await new Promise((r) => setTimeout(r, 1000))
    }
    const imgUrl = imgCache.get(num)
    if (imgUrl) {
      await supabase.from('generated_vocab').update({ image_url: imgUrl }).eq('id', id)
      console.log(`   ✅ [${38+i}] "${NATIVE_WORDS[i].word}" 이미지 적용`)
    }
  }

  // numberOrder.ts 업데이트
  const finalSw = [...existingSw, ...nativeIds]
  const koIds = NUMBER_ORDER.ko || []

  const outputPath = path.join(process.cwd(), 'src', 'lib', 'numberOrder.ts')
  fs.writeFileSync(outputPath, `// 숫자 단어장 순서 매핑
// SW: 1~30 한자어, 31~37 한자어(사십~백), 38~48 고유어(하나~열하나), 49~56 고유어(스물~아흔)
// KO: 1~50 스와힐리어
// 생성일: ${new Date().toISOString()}

export const NUMBER_ORDER: Record<string, string[]> = {
  sw: ${JSON.stringify(finalSw)},
  ko: ${JSON.stringify(koIds)},
}
`, 'utf-8')

  console.log(`\n✅ 완료! SW: ${finalSw.filter(Boolean).length}/${finalSw.length}`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
