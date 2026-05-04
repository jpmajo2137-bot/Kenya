import { supabase } from './supabase'

type Lang = 'sw' | 'ko' | 'en'

const BUCKET = 'vocabaudio'
const FOLDER = 'tts-cache'
const VOICE_VERSION = 1

const memUrlCache = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

function lsKey(key: string): string {
  return 'tts-cache:' + key
}

function loadPersisted(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(lsKey(key)) : null
  } catch {
    return null
  }
}

function savePersisted(key: string, url: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(lsKey(key), url)
  } catch {
    return
  }
}

async function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const buf = await crypto.subtle.digest('SHA-1', data)
    const bytes = Array.from(new Uint8Array(buf))
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let h = 5381
  for (let i = 0; i < data.length; i++) h = ((h << 5) + h + data[i]) >>> 0
  return ('0000000' + h.toString(16)).slice(-8)
}

interface CacheKey {
  key: string
  path: string
}

async function makeCacheKey(text: string, lang: Lang): Promise<CacheKey> {
  const composite = 'v' + VOICE_VERSION + ':' + lang + ':' + text
  const hash = (await sha1Hex(composite)).slice(0, 16)
  return {
    key: composite,
    path: FOLDER + '/' + lang + '/' + hash + '.mp3',
  }
}

function publicUrlFor(path: string): string | null {
  if (!supabase) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl ?? null
}

/**
 * Supabase 스토리지에 미리 저장된 TTS mp3 의 공개 URL 을 반환한다.
 * HEAD 체크 없이 URL 을 바로 반환한다 (Electron/커서 브라우저 호환).
 * 실제 재생 시 오류가 나면 호출자의 catch 에서 web speech 로 폴백한다.
 * 절대 Azure API 를 호출하지 않는다 → 비용 0 원 보장.
 */
export async function getCachedTtsUrl(text: string, lang: Lang): Promise<string | null> {
  const trimmed = text?.trim()
  if (!trimmed) return null
  if (!supabase) return null

  const { key, path } = await makeCacheKey(trimmed, lang)

  const cached = memUrlCache.get(key)
  if (cached) return cached

  const persisted = loadPersisted(key)
  if (persisted) {
    memUrlCache.set(key, persisted)
    return persisted
  }

  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async (): Promise<string | null> => {
    const remoteUrl = publicUrlFor(path)
    if (remoteUrl) {
      memUrlCache.set(key, remoteUrl)
      savePersisted(key, remoteUrl)
      return remoteUrl
    }
    return null
  })()

  inflight.set(key, promise)
  promise.finally(() => inflight.delete(key))
  return promise
}

/** 한글/스와힐리/영어 → web speech locale */
function langToSpeechLocale(lang: Lang): string {
  if (lang === 'ko') return 'ko-KR'
  if (lang === 'en') return 'en-US'
  return 'sw-KE'
}

/**
 * 브라우저 내장 SpeechSynthesis 로 무료 재생.
 * Azure API 호출이 전혀 없으므로 비용은 발생하지 않는다.
 * 디바이스에 해당 언어 음성이 없을 수 있어 품질은 기기마다 다를 수 있다.
 */
export function speakWebFallback(text: string, lang: Lang): boolean {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = langToSpeechLocale(lang)
    u.rate = 0.85
    u.pitch = 1.0
    window.speechSynthesis.speak(u)
    return true
  } catch {
    return false
  }
}

/**
 * 재생 함수 (모든 화면 공통).
 * Supabase 사전 캐시 mp3 → Web Speech 폴백. Azure 런타임 호출 없음 = 비용 0원.
 */
export async function speakWithFreeFallback(text: string, lang: Lang): Promise<void> {
  const trimmed = text?.trim()
  if (!trimmed) return

  try {
    const url = await getCachedTtsUrl(trimmed, lang)
    if (url) {
      try {
        const audio = new Audio(url)
        await audio.play()
        return
      } catch { /* fall through to web speech */ }
    }
  } catch { /* fall through to web speech */ }

  speakWebFallback(trimmed, lang)
}

/**
 * TTS 재생 가능 여부.
 * 런타임 Azure 합성 경로를 제거한 뒤로는 캐시 hit 시 Supabase mp3, miss 시 web speech 로
 * 항상 재생을 시도하므로 사실상 true 다. (브라우저가 web speech 미지원이면 false)
 */
export function hasCachedTts(): boolean {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) return true
  return !!supabase
}
