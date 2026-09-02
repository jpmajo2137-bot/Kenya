/**
 * AI 실시간 번역 사전 모듈
 * - Gemini Flash API로 스와힐리어 ↔ 한국어/영어 번역
 * - IndexedDB 캐싱으로 API 호출 최소화
 * - 리워드 광고 기반 횟수 충전 시스템
 */

import { callEdgeFunction, isEdgeFunctionsConfigured, EdgeFunctionError } from './edgeFunctions'

const TRANSLATE_DB_NAME = 'oxford-en-translate-cache'
const TRANSLATE_DB_VERSION = 1
const TRANSLATE_STORE = 'translations'

const DAILY_FREE_LIMIT = 5
const DAILY_RESET_KEY = 'translate_daily_reset'
const USAGE_KEY = 'translate_usage'

export interface TranslationResult {
  word: string
  from: 'sw' | 'ko' | 'en'
  pos: string
  meanings: {
    lang: 'sw' | 'ko' | 'en'
    text: string
  }[]
  examples: {
    sentence: string
    translation: string
    sw?: string
    ko?: string
    en?: string
  }[]
  synonyms: string[]
  note: string
}

// ─── IndexedDB 캐시 ───

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'))
  }
  dbPromise = new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(TRANSLATE_DB_NAME, TRANSLATE_DB_VERSION)
    } catch (e) {
      dbPromise = null
      reject(e)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(TRANSLATE_STORE)) {
        const store = db.createObjectStore(TRANSLATE_STORE, { keyPath: 'cacheKey' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      // 실패 시 캐시를 재시도할 수 있도록 promise를 리셋
      dbPromise = null
      reject(req.error)
    }
    req.onblocked = () => {
      dbPromise = null
      reject(new Error('IndexedDB blocked'))
    }
  })
  return dbPromise
}

function makeCacheKey(word: string, fromLang: string): string {
  return `${fromLang}:${word.trim().toLowerCase()}`
}

async function getCachedTranslation(word: string, fromLang: string): Promise<TranslationResult | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(TRANSLATE_STORE, 'readonly')
    const store = tx.objectStore(TRANSLATE_STORE)
    const key = makeCacheKey(word, fromLang)
    return new Promise((resolve) => {
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result?.data ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function cacheTranslation(word: string, fromLang: string, data: TranslationResult): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(TRANSLATE_STORE, 'readwrite')
    const store = tx.objectStore(TRANSLATE_STORE)
    store.put({
      cacheKey: makeCacheKey(word, fromLang),
      data,
      createdAt: Date.now(),
    })
  } catch {
    // 캐시 실패는 무시
  }
}

// ─── 사용량 관리 ───

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function resetIfNewDay(): void {
  const lastReset = localStorage.getItem(DAILY_RESET_KEY)
  const today = getTodayKey()
  if (lastReset !== today) {
    localStorage.setItem(DAILY_RESET_KEY, today)
    localStorage.setItem(USAGE_KEY, '1')
  }
}

export function getTranslateUsage(): { used: number; limit: number } {
  resetIfNewDay()
  const used = parseInt(localStorage.getItem(USAGE_KEY) || '0', 10)
  return { used, limit: DAILY_FREE_LIMIT }
}

export function canTranslate(): boolean {
  const { used, limit } = getTranslateUsage()
  return used < limit
}

function incrementUsage(): void {
  resetIfNewDay()
  const used = parseInt(localStorage.getItem(USAGE_KEY) || '0', 10)
  localStorage.setItem(USAGE_KEY, (used + 1).toString())
}

export function grantTranslateBonus(): void {
  resetIfNewDay()
  localStorage.setItem(USAGE_KEY, '0')
}

// ─── Gemini API (Edge Function 프록시 경유) ───

// 여러 모델 폴백: 앞에서부터 시도하고 503/과부하 시 다음 모델로 전환
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-flash-latest',
]

function buildPrompt(word: string, fromLang: string): string {
  const fromLabel = fromLang === 'sw' ? 'Kiswahili' : fromLang === 'ko' ? '한국어' : 'English'

  return `You are an expert Swahili↔Korean↔English dictionary. Given a word, provide accurate translations.

Word: "${word}"
Input language: ${fromLabel}

Reply ONLY with a JSON object (no markdown, no explanation, no code fences):
{
  "word": "${word}",
  "from": "${fromLang}",
  "pos": "(one of: noun, verb, adjective, adverb, phrase, other)",
  "meanings": [
    {"lang": "sw", "text": "(accurate Swahili translation/definition)"},
    {"lang": "ko", "text": "(accurate Korean translation/definition)"},
    {"lang": "en", "text": "(accurate English translation/definition)"}
  ],
  "examples": [
    {
      "sentence": "(example sentence using the word in ${fromLabel})",
      "translation": "(translation of the example in ${fromLang === 'ko' ? 'Swahili' : 'Korean'})",
      "sw": "(the example sentence in Swahili)",
      "ko": "(the example sentence in Korean)",
      "en": "(the example sentence in English)"
    }
  ],
  "synonyms": ["(up to 3 synonyms in ${fromLabel})"],
  "note": "(one-line grammar or usage tip)"
}

Important:
- For Swahili words: give the ACTUAL Korean meaning (e.g., habari→소식/안녕, nyumba→집, chakula→음식)
- For Korean words: give the ACTUAL Swahili meaning (e.g., 집→nyumba, 음식→chakula)
- meanings must contain all 3 languages with real translations, not descriptions
- examples should be natural, practical sentences`
}

// 네트워크/일시적 에러로 판단되면 재시도 (모바일 WebView 콜드 스타트 대응)
function isRetryableError(err: unknown, status?: number): boolean {
  if (status !== undefined) {
    // 5xx, 429(rate limit), 408(timeout) 재시도
    return status >= 500 || status === 429 || status === 408
  }
  const msg = err instanceof Error ? err.message : String(err)
  // TypeError: Failed to fetch, NetworkError, AbortError 등
  return (
    /failed to fetch|network|timeout|aborted|load failed|ERR_|ECONN|ETIMEDOUT/i.test(msg) ||
    err instanceof TypeError
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

async function callGeminiAPIOnce(
  word: string,
  fromLang: string,
  model: string,
): Promise<TranslationResult> {
  // thinkingBudget=0 적용 후 warm 응답이 평균 2~3초이므로 12s 면 충분.
  // 빠른 fallback 으로 사용자 체감 지연을 줄인다.
  const data = await callEdgeFunction<
    { prompt: string; model: string },
    GeminiResponse
  >('gemini-translate', {
    prompt: buildPrompt(word, fromLang),
    model,
  }, { timeoutMs: 12_000 })

  const parts = data?.candidates?.[0]?.content?.parts ?? []
  let text = ''
  for (const part of parts) {
    if (part.text) text = part.text
  }
  if (!text) throw new Error('Empty response from Gemini')

  // Strip markdown fences, whitespace, and any preamble before the JSON object
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd !== -1) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
  }

  const parsed = JSON.parse(cleaned) as TranslationResult
  return parsed
}

// 특정 모델 과부하(503/429/5xx) 시 다음 모델로 폴백할지 판단
function shouldFallbackToNextModel(err: unknown): boolean {
  if (err instanceof EdgeFunctionError) {
    return err.status === 502 || err.status === 503 || err.status === 429 || err.status >= 500
  }
  const status = (err as { status?: number })?.status
  if (status === undefined) return false
  return status === 503 || status === 429 || status >= 500
}

async function callGeminiAPI(word: string, fromLang: string): Promise<TranslationResult> {
  let lastErr: unknown

  for (let modelIdx = 0; modelIdx < GEMINI_MODELS.length; modelIdx++) {
    const model = GEMINI_MODELS[modelIdx]
    const isLastModel = modelIdx === GEMINI_MODELS.length - 1
    const maxAttempts = modelIdx === 0 ? 3 : 2

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await callGeminiAPIOnce(word, fromLang, model)
      } catch (err) {
        lastErr = err
        const status =
          err instanceof EdgeFunctionError
            ? err.status
            : (err as { status?: number })?.status
        const retryable = isRetryableError(err, status)

        if (retryable && attempt < maxAttempts) {
          await sleep(300 * Math.pow(2, attempt))
          continue
        }

        if (!isLastModel && shouldFallbackToNextModel(err)) {
          break
        }

        throw err
      }
    }
  }

  throw lastErr
}

// ─── Public API ───

export async function translate(word: string, fromLang: 'sw' | 'ko' | 'en'): Promise<TranslationResult> {
  const trimmed = word.trim()
  if (!trimmed) throw new Error('Empty word')

  const cached = await getCachedTranslation(trimmed, fromLang)
  if (cached) return cached

  if (!canTranslate()) {
    throw new Error('LIMIT_REACHED')
  }

  const result = await callGeminiAPI(trimmed, fromLang)
  incrementUsage()
  await cacheTranslation(trimmed, fromLang, result)
  return result
}

export function hasGeminiApi(): boolean {
  // 백엔드 프록시(Edge Function)가 설정되어 있으면 사용 가능
  return isEdgeFunctionsConfigured()
}

/**
 * Edge Function 컨테이너 콜드 스타트 워밍업.
 * - Gemini API 호출 없이 즉시 200 응답 (서버에 ping:true 핸들러 존재)
 * - 사전 화면 진입 등 사용자가 곧 검색할 가능성이 높은 시점에 fire-and-forget 호출
 * - 사용량 카운터/광고 한도에 영향 없음
 * - 호출 실패는 조용히 무시 (네트워크 없음/오프라인 등)
 */
let warmupInFlight = false
let warmupDoneAt = 0
const WARMUP_TTL_MS = 4 * 60_000 // 4분 (Supabase Edge Function 인스턴스 keep-alive 시간 대략)

export function warmupTranslate(): void {
  if (!isEdgeFunctionsConfigured()) return
  if (warmupInFlight) return
  if (Date.now() - warmupDoneAt < WARMUP_TTL_MS) return
  warmupInFlight = true
  callEdgeFunction<{ ping: true }, { ok?: boolean }>(
    'gemini-translate',
    { ping: true },
    { timeoutMs: 5_000 },
  )
    .then(() => {
      warmupDoneAt = Date.now()
    })
    .catch(() => {
      /* 무시: 워밍업 실패는 사용자 흐름에 영향 없음 */
    })
    .finally(() => {
      warmupInFlight = false
    })
}
