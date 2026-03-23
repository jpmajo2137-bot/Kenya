/**
 * AI 실시간 번역 사전 모듈
 * - Gemini Flash API로 스와힐리어 ↔ 한국어/영어 번역
 * - IndexedDB 캐싱으로 API 호출 최소화
 * - 리워드 광고 기반 횟수 충전 시스템
 */

import { env } from './env'

const TRANSLATE_DB_NAME = 'k-kiswahili-translate-cache'
const TRANSLATE_DB_VERSION = 1
const TRANSLATE_STORE = 'translations'

const DAILY_FREE_LIMIT = 5
const AD_BONUS_TRANSLATIONS = 10
const MAX_AD_WATCHES_PER_DAY = 3
const DAILY_RESET_KEY = 'translate_daily_reset'
const USAGE_KEY = 'translate_usage'
const AD_WATCHES_KEY = 'translate_ad_watches'

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
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(TRANSLATE_DB_NAME, TRANSLATE_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(TRANSLATE_STORE)) {
        const store = db.createObjectStore(TRANSLATE_STORE, { keyPath: 'cacheKey' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
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
    localStorage.setItem(USAGE_KEY, '0')
    localStorage.setItem(AD_WATCHES_KEY, '0')
  }
}

export function getTranslateUsage(): { used: number; limit: number; adWatches: number; maxAdWatches: number } {
  resetIfNewDay()
  const used = parseInt(localStorage.getItem(USAGE_KEY) || '0', 10)
  const adWatches = parseInt(localStorage.getItem(AD_WATCHES_KEY) || '0', 10)
  const limit = DAILY_FREE_LIMIT + adWatches * AD_BONUS_TRANSLATIONS
  return { used, limit, adWatches, maxAdWatches: MAX_AD_WATCHES_PER_DAY }
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
  const adWatches = parseInt(localStorage.getItem(AD_WATCHES_KEY) || '0', 10)
  if (adWatches < MAX_AD_WATCHES_PER_DAY) {
    localStorage.setItem(AD_WATCHES_KEY, (adWatches + 1).toString())
  }
}

export function canWatchTranslateAd(): boolean {
  const { adWatches, maxAdWatches } = getTranslateUsage()
  return adWatches < maxAdWatches
}

// ─── Gemini Flash API ───

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

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

async function callGeminiAPI(word: string, fromLang: string): Promise<TranslationResult> {
  const apiKey = env.geminiApiKey
  if (!apiKey) throw new Error('Gemini API key not configured')

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(word, fromLang) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${err}`)
  }

  const data = await response.json()

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
  return Boolean(env.geminiApiKey)
}
