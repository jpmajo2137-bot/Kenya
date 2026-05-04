/**
 * OpenAI 호출 (Edge Function 프록시 경유)
 *  - 클라이언트는 OpenAI 키를 갖지 않습니다.
 *  - 모든 호출은 Supabase Edge Function 'openai-vocab' / 'openai-image' 를 거칩니다.
 *  - 빌드 타임에 OpenAI SDK 가 번들에 포함되지 않습니다.
 */

import { callEdgeFunction, isEdgeFunctionsConfigured } from './edgeFunctions'

// ===========================================
// 단어 생성
// ===========================================

export interface VocabGenerationRequest {
  mode: 'sw' | 'ko'
  category: string
  count: number
  difficulty: number
}

export interface GeneratedWord {
  word: string
  word_pronunciation: string
  meaning_sw: string
  meaning_sw_pronunciation: string
  meaning_ko: string
  meaning_ko_pronunciation: string
  meaning_en: string
  meaning_en_pronunciation: string
  example: string
  example_pronunciation: string
  example_translation_ko: string
  example_translation_en: string
  pos: string
}

const SYSTEM_PROMPT_SW = `You are an expert linguist specializing in Swahili (Kiswahili) and Korean languages.
Your task is to generate high-quality vocabulary entries for Swahili speakers learning Korean.
Return as valid JSON array.`

const SYSTEM_PROMPT_KO = `You are an expert linguist specializing in Swahili (Kiswahili) and Korean languages.
Your task is to generate high-quality vocabulary entries for Korean speakers learning Swahili.
- For Korean verbs ending in -하다 (e.g. 중요하다, 필요하다), give Swahili and English meanings in VERB form: use "kuwa + adjective" in Swahili (e.g. kuwa muhimu for 중요하다) and "to be + adjective" in English (e.g. to be important). Do not use only the adjective (e.g. not "muhimu" or "important" alone).
Return as valid JSON array.`

const CATEGORIES = [
  'greetings', 'numbers', 'colors', 'family', 'food', 'drinks',
  'animals', 'body_parts', 'clothing', 'weather', 'time', 'days_months',
  'places', 'transportation', 'shopping', 'restaurant', 'hotel', 'health',
  'emotions', 'actions', 'adjectives', 'questions', 'directions', 'nature',
  'technology', 'work', 'school', 'sports', 'music', 'religion',
  'government', 'emergency', 'travel', 'household', 'tools', 'professions'
]

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
}

export async function generateVocabulary(
  request: VocabGenerationRequest
): Promise<GeneratedWord[]> {
  if (!isEdgeFunctionsConfigured()) {
    throw new Error('Backend not configured')
  }

  const systemPrompt = request.mode === 'sw' ? SYSTEM_PROMPT_SW : SYSTEM_PROMPT_KO
  const targetLang = request.mode === 'sw' ? 'Korean' : 'Swahili'

  const userPrompt = `Generate ${request.count} ${targetLang} vocabulary words in the category "${request.category}".
Difficulty level: ${request.difficulty}/5`

  const response = await callEdgeFunction<
    {
      systemPrompt: string
      userPrompt: string
      temperature: number
      responseFormat: 'json_object'
    },
    ChatCompletionResponse
  >('openai-vocab', {
    systemPrompt,
    userPrompt,
    temperature: 80,
    responseFormat: 'json_object',
  })

  const content = response.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No response from backend')
  }

  try {
    const parsed = JSON.parse(content)
    const words = Array.isArray(parsed) ? parsed : parsed.words || parsed.vocabulary || []
    return words as GeneratedWord[]
  } catch {
    throw new Error('Invalid JSON response from backend')
  }
}

// ===========================================
// Batch Generation Helper
// ===========================================

export interface BatchProgress {
  total: number
  completed: number
  current: string
  errors: string[]
}

export async function* generateBatch(
  mode: 'sw' | 'ko',
  totalCount: number,
  onProgress?: (progress: BatchProgress) => void
): AsyncGenerator<GeneratedWord[], void, unknown> {
  const progress: BatchProgress = {
    total: totalCount,
    completed: 0,
    current: '',
    errors: [],
  }

  const wordsPerCategory = Math.ceil(totalCount / CATEGORIES.length)
  const wordsPerRequest = 10

  for (const category of CATEGORIES) {
    if (progress.completed >= totalCount) break

    const remaining = totalCount - progress.completed
    const categoryCount = Math.min(wordsPerCategory, remaining)

    for (let difficulty = 1; difficulty <= 5; difficulty++) {
      if (progress.completed >= totalCount) break

      const count = Math.min(wordsPerRequest, categoryCount / 5)
      if (count <= 0) continue

      progress.current = `${category} (level ${difficulty})`
      onProgress?.(progress)

      try {
        const words = await generateVocabulary({
          mode,
          category,
          count: Math.ceil(count),
          difficulty,
        })

        progress.completed += words.length
        onProgress?.(progress)

        yield words

        await new Promise(r => setTimeout(r, 1000))
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        progress.errors.push(`${category}/${difficulty}: ${msg}`)
        onProgress?.(progress)
      }
    }
  }
}

export { CATEGORIES }

// ===========================================
// Image Generation
// ===========================================

interface ImageResponse {
  url: string | null
  b64_json: string | null
}

export async function generateWordImage(
  word: string,
  meaning: string
): Promise<string | null> {
  if (!isEdgeFunctionsConfigured()) {
    throw new Error('Backend not configured')
  }

  const response = await callEdgeFunction<
    { prompt: string; size: '1024x1024' },
    ImageResponse
  >('openai-image', {
    prompt: `A simple, clean illustration representing the word "${word}" which means "${meaning}". Educational vocabulary flashcard style, minimal background, clear visual.`,
    size: '1024x1024',
  }, { timeoutMs: 120_000 })

  if (response.url) return response.url
  if (response.b64_json) return `data:image/png;base64,${response.b64_json}`
  throw new Error('No image data in response')
}

// 구 인터페이스 호환을 위한 placeholder (다른 코드가 import openai 했을 때)
export const openai = null
