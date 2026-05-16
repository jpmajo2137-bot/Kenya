import { supabase } from './supabase'
import { azureTtsUrl, hasAzureTts } from './azureTts'

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
 * 외부 TTS API 호출은 일절 없으므로 비용은 0원이다.
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
 * 외부 TTS API 호출이 전혀 없으므로 비용은 발생하지 않는다.
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

/** 캐시 mp3 가 실제 존재하는지 확인 (HEAD). 결과는 메모리·localStorage 에 영구 캐시. */
const urlExistsCache = new Map<string, boolean>()
const URL_EXISTS_LS_PREFIX = 'tts-cache-exists:'

function loadUrlExists(url: string): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const v = localStorage.getItem(URL_EXISTS_LS_PREFIX + url)
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch {
    return null
  }
}
function saveUrlExists(url: string, ok: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(URL_EXISTS_LS_PREFIX + url, ok ? '1' : '0')
  } catch {
    /* ignore */
  }
}

async function ttsUrlExists(url: string): Promise<boolean> {
  const mem = urlExistsCache.get(url)
  if (mem !== undefined) return mem
  const persisted = loadUrlExists(url)
  if (persisted !== null) {
    urlExistsCache.set(url, persisted)
    return persisted
  }
  let ok = false
  try {
    const res = await fetch(url, { method: 'HEAD' })
    ok = res.ok
  } catch {
    ok = false
  }
  urlExistsCache.set(url, ok)
  saveUrlExists(url, ok)
  return ok
}

// ─────────────────────────────────────────────────────────────────────────────
// 자동재생 정책(autoplay policy) 우회용 audio unlock
//
// 모바일/모던 브라우저는 사용자 제스처(click 등) 후 짧은 시간 안에 audio.play()
// 가 호출되어야 허용한다. 우리 흐름은 클릭 → fetch(HEAD) → fetch(azure-tts) →
// audio.play() 라서 도중에 user activation 이 만료되면 play() 가 NotAllowedError
// 로 거부된다 (= 사전 음성 안 나옴).
//
// 해결: 첫 사용자 인터랙션에서 한 번 silent audio 를 재생해 두면 같은
//       AudioContext/document 안의 모든 후속 play() 가 자동으로 허용된다.
//       또한 재생용 <audio> 엘리먼트도 한 개만 만들어 재사용하면 모바일에서
//       더 안정적이다.
// ─────────────────────────────────────────────────────────────────────────────

let sharedAudio: HTMLAudioElement | null = null
let unlocked = false

function getSharedAudio(): HTMLAudioElement {
  if (sharedAudio) return sharedAudio
  if (typeof document === 'undefined') {
    // SSR 안전 (실사용 X)
    sharedAudio = new Audio()
    return sharedAudio
  }
  const a = document.createElement('audio')
  a.preload = 'auto'
  a.crossOrigin = 'anonymous'
  // DOM 에 부착해야 모바일 Safari/Capacitor WebView 에서 재생이 안정적
  a.style.display = 'none'
  document.body.appendChild(a)
  sharedAudio = a
  return a
}

const SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzAwAAAAAAJlRYWFgAAAASAAADbWFqb3JfYnJhbmQAbXA0MgBUWFhYAAAAEQAAA21pbm9yX3ZlcnNpb24AMABUWFhYAAAAHAAAA2NvbXBhdGlibGVfYnJhbmRzAGlzb21tcDQyAP/7kGQAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAegAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAJAAAAAAAAAAegoiTC1AAAAAAD/+xDEAAPAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU='

function tryUnlockOnce(): void {
  if (unlocked) return
  unlocked = true
  try {
    const a = getSharedAudio()
    a.src = SILENT_MP3
    a.muted = true
    const p = a.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        a.muted = false
      }).catch(() => {
        // 다음 클릭에서 다시 시도할 수 있도록 unlock 플래그 해제
        unlocked = false
      })
    }
  } catch {
    unlocked = false
  }
}

if (typeof window !== 'undefined') {
  const onFirstGesture = () => {
    tryUnlockOnce()
  }
  // capture: 다른 핸들러가 stopPropagation 해도 잡히도록
  window.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true })
  window.addEventListener('touchstart', onFirstGesture, { once: true, capture: true })
  window.addEventListener('keydown', onFirstGesture, { once: true, capture: true })
}

/** mp3 재생. 실패 시 false. 공통 <audio> 엘리먼트를 재사용해 모바일 자동재생 정책에 강건. */
async function playCachedUrl(url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const audio = getSharedAudio()
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(ok)
    }
    const onError = () => {
      if (import.meta.env?.DEV) console.warn('[tts] audio error', audio.error?.code, url)
      done(false)
    }
    const onPlaying = () => done(true)
    const onEnded = () => done(true)
    const cleanup = () => {
      audio.removeEventListener('error', onError)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('ended', onEnded)
    }

    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      /* ignore */
    }

    audio.addEventListener('error', onError)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('ended', onEnded)
    audio.src = url
    audio.muted = false
    audio.volume = 1.0
    audio.load()

    audio
      .play()
      .then(() => {
        // 'playing' 이벤트가 곧 발생할 것
      })
      .catch((err) => {
        if (import.meta.env?.DEV) {
          console.warn('[tts] play() rejected:', err?.name, err?.message)
        }
        done(false)
      })

    // 안전장치: 8초 안에 어떤 이벤트도 못 받으면 false
    setTimeout(() => done(false), 8000)
  })
}

/**
 * 재생 함수 (모든 화면 공통).
 *
 * 우선순위:
 *  1. Supabase Storage 사전 캐시 mp3 (`tts-cache/<lang>/<hash>.mp3`)
 *     → 있으면 재생. 비용 0원, 가장 빠름.
 *  2. Azure TTS (Edge Function `azure-tts`)
 *     → 서버가 캐시 확인 후 없으면 합성하고 Storage 에 업로드.
 *       다음부턴 1번 경로로 무료 재생됨. 한 명이 처음 들으면 모두에게 캐싱됨.
 *  3. 브라우저 Web Speech (디바이스 음성)
 *     → 외부 호출 모두 실패 시 폴백. 모바일/스와힐리어에선 동작 안 할 수 있음.
 */
export async function speakWithFreeFallback(text: string, lang: Lang): Promise<void> {
  const trimmed = text?.trim()
  if (!trimmed) return

  // 1) Storage 사전 캐시 (HEAD 결과는 영구 캐시되어 거의 즉시)
  try {
    const url = await getCachedTtsUrl(trimmed, lang)
    if (url) {
      const exists = await ttsUrlExists(url)
      if (exists) {
        const played = await playCachedUrl(url)
        if (played) return
      }
    }
  } catch {
    /* fall through */
  }

  // 2) Azure TTS (서버가 캐시 채움 → 다음부턴 1번 경로로)
  if (hasAzureTts()) {
    try {
      const azUrl = await azureTtsUrl(trimmed, lang)
      if (azUrl) {
        const played = await playCachedUrl(azUrl)
        if (played) {
          // Azure 가 새로 만든 mp3 의 존재를 우리 측 HEAD 캐시에도 미리 등록 (다음 호출이
          // ttsUrlExists 에서 한 번 더 HEAD 를 치지 않도록).
          saveUrlExists(azUrl, true)
          urlExistsCache.set(azUrl, true)
          return
        }
      }
    } catch {
      /* fall through */
    }
  }

  // 3) Web Speech 폴백
  speakWebFallback(trimmed, lang)
}

/**
 * TTS 재생 가능 여부.
 * Storage 캐시 / Azure TTS / Web Speech 중 하나라도 가능하면 true.
 */
export function hasCachedTts(): boolean {
  if (hasAzureTts()) return true
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) return true
  return !!supabase
}
