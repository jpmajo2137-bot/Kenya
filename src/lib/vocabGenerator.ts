import { supabase, type GeneratedVocab, type VocabMode } from './supabase'
import { generateVocabulary, generateSpeech, CATEGORIES } from './openai'

// ===========================================
// Vocabulary Generator Service
// ===========================================

export interface GenerationConfig {
  mode: VocabMode
  totalCount: number
  withAudio: boolean
  onProgress?: (status: GenerationStatus) => void
}

export interface GenerationStatus {
  phase: 'generating' | 'audio' | 'saving' | 'complete' | 'error'
  total: number
  completed: number
  current: string
  errors: string[]
}

/**
 * 단어를 생성하고 Supabase에 저장
 */
export async function generateAndSaveVocabulary(config: GenerationConfig): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  const status: GenerationStatus = {
    phase: 'generating',
    total: config.totalCount,
    completed: 0,
    current: '',
    errors: [],
  }

  const allWords: GeneratedVocab[] = []
  const wordsPerCategory = Math.ceil(config.totalCount / CATEGORIES.length)

  // 1. 카테고리별로 단어 생성
  for (const category of CATEGORIES) {
    if (allWords.length >= config.totalCount) break

    for (let difficulty = 1; difficulty <= 5; difficulty++) {
      if (allWords.length >= config.totalCount) break

      const count = Math.min(10, wordsPerCategory / 5, config.totalCount - allWords.length)
      if (count <= 0) continue

      status.current = `${getCategoryName(category)} (난이도 ${difficulty})`
      config.onProgress?.(status)

      try {
        const words = await generateVocabulary({
          mode: config.mode,
          category,
          count: Math.ceil(count),
          difficulty,
        })

        // GeneratedWord → GeneratedVocab 변환
        for (const w of words) {
          if (allWords.length >= config.totalCount) break

          const vocab: GeneratedVocab = {
            mode: config.mode,
            word: w.word,
            word_pronunciation: w.word_pronunciation,
            meaning_sw: w.meaning_sw,
            meaning_sw_pronunciation: w.meaning_sw_pronunciation,
            meaning_ko: w.meaning_ko,
            meaning_ko_pronunciation: w.meaning_ko_pronunciation,
            meaning_en: w.meaning_en,
            meaning_en_pronunciation: w.meaning_en_pronunciation,
            example: w.example,
            example_pronunciation: w.example_pronunciation,
            example_translation_ko: w.example_translation_ko,
            example_translation_en: w.example_translation_en,
            pos: w.pos,
            category,
            difficulty,
          }

          allWords.push(vocab)
          status.completed = allWords.length
          config.onProgress?.(status)
        }

        // Rate limiting
        await sleep(1000)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        status.errors.push(`${category}/${difficulty}: ${msg}`)
        config.onProgress?.(status)
        await sleep(2000) // 에러 시 더 오래 대기
      }
    }
  }

  // 2. 음성 생성 (선택)
  if (config.withAudio) {
    status.phase = 'audio'
    status.completed = 0
    status.total = allWords.length * 4 // word, meaning, example 각각

    for (let i = 0; i < allWords.length; i++) {
      const vocab = allWords[i]
      status.current = `음성 생성: ${vocab.word}`
      config.onProgress?.(status)

      try {
        // 단어 음성
        const wordLang = config.mode === 'ko' ? 'sw' : 'ko'
        const wordAudio = await generateSpeech(vocab.word, wordLang)
        vocab.word_audio_url = await uploadAudio(wordAudio, `${config.mode}/${vocab.word}_word.mp3`)
        status.completed++

        // 뜻 음성 (메인 언어)
        const meaningAudio = await generateSpeech(
          config.mode === 'ko' ? vocab.meaning_ko : vocab.meaning_sw,
          config.mode === 'ko' ? 'ko' : 'sw'
        )
        if (config.mode === 'ko') {
          vocab.meaning_ko_audio_url = await uploadAudio(meaningAudio, `${config.mode}/${vocab.word}_meaning_ko.mp3`)
        } else {
          vocab.meaning_sw_audio_url = await uploadAudio(meaningAudio, `${config.mode}/${vocab.word}_meaning_sw.mp3`)
        }
        status.completed++

        // 예문 음성
        const exampleLang = config.mode === 'ko' ? 'sw' : 'ko'
        const exampleAudio = await generateSpeech(vocab.example, exampleLang)
        vocab.example_audio_url = await uploadAudio(exampleAudio, `${config.mode}/${vocab.word}_example.mp3`)
        status.completed++

        // 영어 뜻 음성
        const enAudio = await generateSpeech(vocab.meaning_en, 'en')
        vocab.meaning_en_audio_url = await uploadAudio(enAudio, `${config.mode}/${vocab.word}_meaning_en.mp3`)
        status.completed++

        config.onProgress?.(status)
        await sleep(500) // TTS rate limiting
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        status.errors.push(`TTS ${vocab.word}: ${msg}`)
        status.completed += 4
        config.onProgress?.(status)
      }
    }
  }

  // 3. Supabase에 저장
  status.phase = 'saving'
  status.completed = 0
  status.total = allWords.length
  config.onProgress?.(status)

  // 배치로 저장 (100개씩)
  const batchSize = 100
  for (let i = 0; i < allWords.length; i += batchSize) {
    const batch = allWords.slice(i, i + batchSize)
    status.current = `저장 중: ${i + 1} ~ ${Math.min(i + batchSize, allWords.length)}`
    config.onProgress?.(status)

    try {
      const { error } = await supabase.from('generated_vocab').upsert(batch, {
        onConflict: 'mode,word',
      })

      if (error) {
        status.errors.push(`DB 저장: ${error.message}`)
      }

      status.completed = Math.min(i + batchSize, allWords.length)
      config.onProgress?.(status)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      status.errors.push(`DB 저장: ${msg}`)
    }
  }

  status.phase = 'complete'
  config.onProgress?.(status)
}

/**
 * 음성 파일을 Supabase Storage에 업로드
 */
async function uploadAudio(audioData: ArrayBuffer, path: string): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase.storage
    .from('vocabaudio')
    .upload(path, audioData, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) throw error

  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(data.path)
  return urlData.publicUrl
}

/**
 * 생성된 단어 조회
 */
export async function getGeneratedVocab(
  mode: VocabMode,
  options?: {
    category?: string
    difficulty?: number
    limit?: number
    offset?: number
  }
): Promise<GeneratedVocab[]> {
  if (!supabase) throw new Error('Supabase not configured')

  let query = supabase
    .from('generated_vocab')
    .select('*')
    .eq('mode', mode)
    .order('created_at', { ascending: false })

  if (options?.category) {
    query = query.eq('category', options.category)
  }
  if (options?.difficulty) {
    query = query.eq('difficulty', options.difficulty)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/**
 * 통계 조회
 */
export async function getVocabStats(): Promise<{
  sw: number
  ko: number
  total: number
  categories: Record<string, number>
}> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: swData } = await supabase
    .from('generated_vocab')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'sw')

  const { data: koData } = await supabase
    .from('generated_vocab')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'ko')

  const sw = (swData as unknown as { count: number })?.count || 0
  const ko = (koData as unknown as { count: number })?.count || 0

  return {
    sw,
    ko,
    total: sw + ko,
    categories: {}, // TODO: 카테고리별 통계
  }
}

// ===========================================
// Helpers
// ===========================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    greetings: '인사',
    numbers: '숫자',
    colors: '색깔',
    family: '가족',
    food: '음식',
    drinks: '음료',
    animals: '동물',
    body_parts: '신체',
    clothing: '의류',
    weather: '날씨',
    time: '시간',
    days_months: '요일/월',
    places: '장소',
    transportation: '교통',
    shopping: '쇼핑',
    restaurant: '식당',
    hotel: '호텔',
    health: '건강',
    emotions: '감정',
    actions: '동작',
    adjectives: '형용사',
    questions: '의문사',
    directions: '방향',
    nature: '자연',
    technology: '기술',
    work: '직장',
    school: '학교',
    sports: '스포츠',
    music: '음악',
    religion: '종교',
    government: '정부',
    emergency: '응급',
    travel: '여행',
    household: '가정용품',
    tools: '도구',
    professions: '직업',
  }
  return names[category] || category
}

export { CATEGORIES, getCategoryName }

