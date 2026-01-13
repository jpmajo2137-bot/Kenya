import OpenAI from 'openai'
import { env } from './env'

// OpenAI client
export const openai = env.openaiApiKey
  ? new OpenAI({
      apiKey: env.openaiApiKey,
      dangerouslyAllowBrowser: true,
    })
  : null

// ===========================================
// Vocabulary Generation
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
Return as valid JSON array.`

const CATEGORIES = [
  'greetings', 'numbers', 'colors', 'family', 'food', 'drinks',
  'animals', 'body_parts', 'clothing', 'weather', 'time', 'days_months',
  'places', 'transportation', 'shopping', 'restaurant', 'hotel', 'health',
  'emotions', 'actions', 'adjectives', 'questions', 'directions', 'nature',
  'technology', 'work', 'school', 'sports', 'music', 'religion',
  'government', 'emergency', 'travel', 'household', 'tools', 'professions'
]

export async function generateVocabulary(
  request: VocabGenerationRequest
): Promise<GeneratedWord[]> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  const systemPrompt = request.mode === 'sw' ? SYSTEM_PROMPT_SW : SYSTEM_PROMPT_KO
  const targetLang = request.mode === 'sw' ? 'Korean' : 'Swahili'
  
  const userPrompt = `Generate ${request.count} ${targetLang} vocabulary words in the category "${request.category}".
Difficulty level: ${request.difficulty}/5`

  const response = await openai.chat.completions.create({
    model: env.openaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 4000,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  try {
    const parsed = JSON.parse(content)
    const words = Array.isArray(parsed) ? parsed : parsed.words || parsed.vocabulary || []
    return words as GeneratedWord[]
  } catch {
    console.error('Failed to parse OpenAI response:', content)
    throw new Error('Invalid JSON response from OpenAI')
  }
}

// ===========================================
// Text-to-Speech (TTS)
// ===========================================

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'

const VOICE_MAP: Record<string, TTSVoice> = {
  sw: 'onyx',
  ko: 'nova',
  en: 'alloy',
}

export async function generateSpeech(
  text: string,
  language: 'sw' | 'ko' | 'en'
): Promise<ArrayBuffer> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  const voice = VOICE_MAP[language] || 'alloy'

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice,
    input: text,
    speed: 0.9,
  })

  return response.arrayBuffer()
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

export async function generateWordImage(
  word: string,
  meaning: string
): Promise<string | null> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: `A simple, clean illustration representing the word "${word}" which means "${meaning}". Educational vocabulary flashcard style, minimal background, clear visual.`,
      n: 1,
      size: '1024x1024',
    })
    const data = response.data
    if (data && data[0] && data[0].url) {
      return data[0].url
    }
    return null
  } catch (error) {
    console.error('Image generation failed:', error)
    return null
  }
}
