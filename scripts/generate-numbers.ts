/**
 * GPT-5.2 Pro로 숫자 1~50 어휘 데이터 생성
 * - 기존 DB에 있는 숫자 단어는 참조 (복사X)
 * - 없는 숫자는 새로 생성 (단어, 발음, 뜻, 예문, TTS 오디오)
 * - 순서 매핑 파일 출력: src/lib/numberOrder.ts
 *
 * 사용법: npx tsx scripts/generate-numbers.ts
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

const ENGLISH_NUMBERS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five',
  'twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
  'thirty-one','thirty-two','thirty-three','thirty-four','thirty-five',
  'thirty-six','thirty-seven','thirty-eight','thirty-nine','forty',
  'forty-one','forty-two','forty-three','forty-four','forty-five',
  'forty-six','forty-seven','forty-eight','forty-nine','fifty',
]

const SW_NUMBERS = [
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

const KO_SINO_NUMBERS = [
  '일','이','삼','사','오','육','칠','팔','구','십',
  '십일','십이','십삼','십사','십오','십육','십칠','십팔','십구','이십',
  '이십일','이십이','이십삼','이십사','이십오',
  '이십육','이십칠','이십팔','이십구','삼십',
  '삼십일','삼십이','삼십삼','삼십사','삼십오',
  '삼십육','삼십칠','삼십팔','삼십구','사십',
  '사십일','사십이','사십삼','사십사','사십오',
  '사십육','사십칠','사십팔','사십구','오십',
]

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

function getSwPrompt(): string {
  return `You are an expert linguist creating vocabulary entries for Swahili speakers learning Korean.
For each number, create a Korean vocabulary entry:

1. word: The Korean number word (Sino-Korean form: 일, 이, 삼...)
2. word_pronunciation: Korean romanization
3. meaning_sw: Swahili meaning (the number in Swahili)
4. meaning_ko: Korean definition
5. meaning_en: English meaning (the number in English)
6. meaning_en_pronunciation: IPA pronunciation
7. example: A natural Korean example sentence USING this number
8. example_pronunciation: Romanization of the Korean example
9. example_translation_sw: Swahili translation
10. example_translation_ko: Korean (same as example)
11. example_translation_en: English translation
12. pos: "noun"

CRITICAL: Each example sentence must naturally use the number in context (counting things, telling time, age, etc).
Return as valid JSON array.`
}

function getKoPrompt(): string {
  return `You are an expert linguist creating vocabulary entries for Korean speakers learning Swahili.
For each number, create a Swahili vocabulary entry:

1. word: The Swahili number word
2. word_pronunciation: Phonetic pronunciation guide
3. meaning_sw: Swahili definition
4. meaning_ko: Korean meaning (한국어 뜻)
5. meaning_en: English meaning (the number in English)
6. meaning_en_pronunciation: IPA pronunciation
7. example: A natural Swahili example sentence USING this number
8. example_pronunciation: Phonetic pronunciation
9. example_translation_sw: Same as example
10. example_translation_ko: Korean translation
11. example_translation_en: English translation
12. pos: "noun"

CRITICAL: Each example sentence must naturally use the number in context.
Return as valid JSON array.`
}

async function generateNumberBatch(
  mode: 'sw' | 'ko',
  numbers: Array<{ num: number; en: string; target: string }>,
): Promise<GeneratedEntry[]> {
  const wordList = numbers
    .map((n) => `${n.num}. ${n.en} → ${n.target}`)
    .join('\n')

  console.log(`   🤖 GPT-5.2 Pro로 ${numbers.length}개 숫자 생성 중...`)

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: mode === 'sw' ? getSwPrompt() : getKoPrompt() },
      {
        role: 'user',
        content: `Generate vocabulary entries for these ${numbers.length} numbers:\n\n${wordList}\n\nReturn a JSON object with a "entries" key containing an array of exactly ${numbers.length} entries in the same order. Each entry must have: word, word_pronunciation, meaning_sw, meaning_ko, meaning_en, meaning_en_pronunciation, example, example_pronunciation, example_translation_sw, example_translation_ko, example_translation_en, pos.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_completion_tokens: 16000,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No response from GPT')
  const parsed = JSON.parse(content)

  let entries: GeneratedEntry[]
  if (Array.isArray(parsed)) {
    entries = parsed
  } else if (parsed.entries && Array.isArray(parsed.entries)) {
    entries = parsed.entries
  } else {
    const firstArrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]))
    entries = firstArrayKey ? parsed[firstArrayKey] : []
  }

  // 검증: 각 항목에 word 필드가 있는지 확인
  entries = entries.filter((e) => e && typeof e.word === 'string' && e.word.length > 0)

  if (entries.length !== numbers.length) {
    console.log(`   ⚠️ 요청 ${numbers.length}개 vs 생성 ${entries.length}개 (차이 있음)`)
  }
  console.log(`   ✅ ${entries.length}개 생성 완료`)
  return entries
}

async function generateTTS(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    speed: 0.9,
  })
  return Buffer.from(await response.arrayBuffer())
}

async function uploadAudio(buffer: Buffer, filename: string): Promise<string | null> {
  const { error } = await supabase.storage
    .from('vocabaudio')
    .upload(filename, buffer, { contentType: 'audio/mpeg', upsert: true })
  if (error) {
    console.error(`   ❌ 오디오 업로드 실패: ${filename}`, error.message)
    return null
  }
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(filename)
  return urlData?.publicUrl || null
}

async function findExistingWord(
  mode: string,
  wordCandidates: string[],
  meaningEn: string,
): Promise<string | null> {
  for (const word of wordCandidates) {
    const { data } = await supabase
      .from('generated_vocab')
      .select('id, word')
      .eq('mode', mode)
      .ilike('word', word)
      .limit(1)
    if (data && data.length > 0) {
      console.log(`   ♻️ 기존 단어 발견: "${data[0].word}" (${data[0].id})`)
      return data[0].id
    }
  }

  const { data } = await supabase
    .from('generated_vocab')
    .select('id, word')
    .eq('mode', mode)
    .ilike('meaning_en', meaningEn)
    .limit(1)
  if (data && data.length > 0) {
    console.log(`   ♻️ 기존 단어 발견 (meaning_en): "${data[0].word}" (${data[0].id})`)
    return data[0].id
  }
  return null
}

async function saveNewEntry(mode: string, entry: GeneratedEntry, idx: number): Promise<string> {
  console.log(`   🔊 TTS 생성: "${entry.word}"`)
  const ts = Date.now()
  const prefix = `numbers/${mode}`

  const wordAudio = await generateTTS(entry.word)
  const meaningSwAudio = await generateTTS(entry.meaning_sw)
  const meaningKoAudio = await generateTTS(entry.meaning_ko)
  const meaningEnAudio = await generateTTS(entry.meaning_en)
  const exampleAudio = await generateTTS(entry.example)

  const wordAudioUrl = await uploadAudio(wordAudio, `${prefix}/${ts}_word_${idx}.mp3`)
  const meaningSwAudioUrl = await uploadAudio(meaningSwAudio, `${prefix}/${ts}_msw_${idx}.mp3`)
  const meaningKoAudioUrl = await uploadAudio(meaningKoAudio, `${prefix}/${ts}_mko_${idx}.mp3`)
  const meaningEnAudioUrl = await uploadAudio(meaningEnAudio, `${prefix}/${ts}_men_${idx}.mp3`)
  const exampleAudioUrl = await uploadAudio(exampleAudio, `${prefix}/${ts}_ex_${idx}.mp3`)

  const row = {
    mode,
    word: entry.word,
    word_pronunciation: entry.word_pronunciation,
    word_audio_url: wordAudioUrl,
    meaning_sw: entry.meaning_sw,
    meaning_sw_pronunciation: null as string | null,
    meaning_sw_audio_url: meaningSwAudioUrl,
    meaning_ko: entry.meaning_ko,
    meaning_ko_pronunciation: null as string | null,
    meaning_ko_audio_url: meaningKoAudioUrl,
    meaning_en: entry.meaning_en,
    meaning_en_pronunciation: entry.meaning_en_pronunciation,
    meaning_en_audio_url: meaningEnAudioUrl,
    example: entry.example,
    example_pronunciation: entry.example_pronunciation,
    example_audio_url: exampleAudioUrl,
    example_translation_sw: entry.example_translation_sw,
    example_translation_ko: entry.example_translation_ko,
    example_translation_en: entry.example_translation_en,
    pos: entry.pos || 'noun',
    category: '숫자',
  }

  const { data, error } = await supabase.from('generated_vocab').insert(row).select('id')
  if (error) throw new Error(`DB 저장 실패: ${error.message}`)
  console.log(`   ✅ "${entry.word}" 저장 완료 (${data[0].id})`)
  return data[0].id
}

async function processMode(mode: 'sw' | 'ko'): Promise<string[]> {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`🔢 ${mode.toUpperCase()} 모드: 숫자 1~50 처리`)
  console.log('═'.repeat(60))

  const targetNumbers = mode === 'sw' ? KO_SINO_NUMBERS : SW_NUMBERS
  const orderedIds: string[] = []
  const missingNumbers: Array<{ num: number; en: string; target: string; idx: number }> = []

  // 1단계: 기존 단어 검색
  console.log('\n📡 기존 단어 검색 중...')
  for (let i = 0; i < 50; i++) {
    const num = i + 1
    const en = ENGLISH_NUMBERS[i]
    const target = targetNumbers[i]
    const candidates = [target]
    if (mode === 'sw' && i < 10) {
      const nativeKo = ['하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열']
      candidates.push(nativeKo[i])
    }

    console.log(`   [${num}] "${target}" (${en}) 검색...`)
    const existingId = await findExistingWord(mode, candidates, en)

    if (existingId) {
      orderedIds.push(existingId)
    } else {
      orderedIds.push('') // placeholder
      missingNumbers.push({ num, en, target, idx: i })
    }
  }

  console.log(`\n📊 결과: 기존 ${50 - missingNumbers.length}개, 생성 필요 ${missingNumbers.length}개`)

  // 2단계: 없는 숫자 GPT로 생성
  if (missingNumbers.length > 0) {
    const BATCH = 25
    const allGenerated: GeneratedEntry[] = []

    for (let b = 0; b < missingNumbers.length; b += BATCH) {
      const batch = missingNumbers.slice(b, b + BATCH)
      const entries = await generateNumberBatch(
        mode,
        batch.map((m) => ({ num: m.num, en: m.en, target: m.target })),
      )
      allGenerated.push(...entries)
      if (b + BATCH < missingNumbers.length) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    // 3단계: TTS + DB 저장
    console.log('\n💾 새 단어 저장 중...')
    for (let i = 0; i < missingNumbers.length; i++) {
      const missing = missingNumbers[i]
      const entry = allGenerated[i]
      if (!entry) {
        console.error(`   ❌ 생성된 데이터 없음: 숫자 ${missing.num}`)
        continue
      }
      try {
        const newId = await saveNewEntry(mode, entry, missing.num)
        orderedIds[missing.idx] = newId
      } catch (err) {
        console.error(`   ❌ 숫자 ${missing.num} 저장 실패:`, err)
      }

      if (i < missingNumbers.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  return orderedIds
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🚀 숫자 1~50 어휘 데이터 생성 시작 (GPT-5.2 Pro)')
  console.log('═'.repeat(60))

  const swOrderedIds = await processMode('sw')
  const koOrderedIds = await processMode('ko')

  // 4단계: 순서 매핑 파일 생성
  const outputPath = path.join(process.cwd(), 'src', 'lib', 'numberOrder.ts')
  const tsContent = `// 숫자 1~50 순서 매핑 (GPT-5.2 Pro 생성)
// 각 배열의 index = 숫자 - 1 (index 0 = 숫자 1)
// 생성일: ${new Date().toISOString()}

export const NUMBER_ORDER: Record<string, string[]> = {
  sw: ${JSON.stringify(swOrderedIds)},
  ko: ${JSON.stringify(koOrderedIds)},
}
`
  fs.writeFileSync(outputPath, tsContent, 'utf-8')

  // 분류 데이터도 업데이트 (숫자1-50 태그 추가)
  const classificationPath = path.join(process.cwd(), 'src', 'lib', 'topicClassification.ts')
  if (fs.existsSync(classificationPath)) {
    let content = fs.readFileSync(classificationPath, 'utf-8')

    const allIds = [...swOrderedIds, ...koOrderedIds].filter(Boolean)
    const dataMatch = content.match(/const data: Record<string, string\[\]> = ({[\s\S]*?})\n\nexport/)
    if (dataMatch) {
      const existingData = JSON.parse(dataMatch[1]) as Record<string, string[]>

      // 숫자1-50 태그 추가
      for (let i = 0; i < swOrderedIds.length; i++) {
        const id = swOrderedIds[i]
        if (id && existingData[id]) {
          if (!existingData[id].includes('숫자1-50')) existingData[id].push('숫자1-50')
        } else if (id) {
          existingData[id] = ['sw', '숫자/수량', '숫자1-50']
        }
      }
      for (let i = 0; i < koOrderedIds.length; i++) {
        const id = koOrderedIds[i]
        if (id && existingData[id]) {
          if (!existingData[id].includes('숫자1-50')) existingData[id].push('숫자1-50')
        } else if (id) {
          existingData[id] = ['ko', '숫자/수량', '숫자1-50']
        }
      }

      content = content.replace(
        /const data: Record<string, string\[\]> = {[\s\S]*?}\n\nexport/,
        `const data: Record<string, string[]> = ${JSON.stringify(existingData)}\n\nexport`,
      )
      fs.writeFileSync(classificationPath, content, 'utf-8')
      console.log(`\n✅ 분류 데이터 업데이트 완료 (${allIds.length}개에 숫자1-50 태그 추가)`)
    }
  }

  console.log(`\n✅ 순서 매핑 저장: ${outputPath}`)
  console.log(`   SW: ${swOrderedIds.filter(Boolean).length}/50`)
  console.log(`   KO: ${koOrderedIds.filter(Boolean).length}/50`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
