/**
 * Azure TTS 클라이언트 래퍼.
 *
 * 동작:
 *  - Edge Function `azure-tts` 를 호출하면 서버가
 *      1) Supabase Storage 캐시 확인 (있으면 즉시 URL 반환, Azure 미호출 = 비용 0)
 *      2) 없으면 Azure TTS 호출 → mp3 → Storage 업로드 → public URL
 *    를 처리한다. 같은 텍스트/언어 조합은 전 세계 사용자가 무료로 공유 재생.
 *  - 클라이언트는 추가로 (text, lang) → URL 매핑을 localStorage 에 영구 캐시한다.
 *    => 같은 사용자의 두 번째 재생부터는 Edge Function 호출도 생략.
 *  - 외부에는 단 하나의 함수 `azureTtsUrl(text, lang)` 만 노출.
 */

import { callEdgeFunction, isEdgeFunctionsConfigured } from './edgeFunctions'

export type AzureTtsLang = 'sw' | 'ko' | 'en'

export interface AzureTtsResponse {
  url: string
  cached: boolean
  hash: string
  uploadFailed?: boolean
}

const LS_PREFIX = 'azure-tts-url:'
const VOICE_VERSION = 1 // Edge Function 의 VOICE_VERSION 과 동일해야 한다

function lsKey(text: string, lang: AzureTtsLang): string {
  return `${LS_PREFIX}v${VOICE_VERSION}:${lang}:${text}`
}

function loadLocalUrl(text: string, lang: AzureTtsLang): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(lsKey(text, lang))
  } catch {
    return null
  }
}

function saveLocalUrl(text: string, lang: AzureTtsLang, url: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    // data: URL (Storage 업로드 실패시 폴백) 은 너무 커서 영구 캐시하지 않는다
    if (url.startsWith('data:')) return
    localStorage.setItem(lsKey(text, lang), url)
  } catch {
    /* localStorage quota or disabled */
  }
}

const memCache = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

/**
 * 텍스트→Azure TTS mp3 의 재생 가능한 URL 을 반환한다.
 *  - 메모리 캐시 → localStorage → Edge Function 순으로 시도
 *  - 동일 (text,lang) 동시 호출은 dedup 됨
 *  - 실패 시 null
 */
export async function azureTtsUrl(text: string, lang: AzureTtsLang): Promise<string | null> {
  const trimmed = text?.trim()
  if (!trimmed) return null
  if (!isEdgeFunctionsConfigured()) return null

  const cacheKey = `${lang}:${trimmed}`

  const mem = memCache.get(cacheKey)
  if (mem) return mem

  const persisted = loadLocalUrl(trimmed, lang)
  if (persisted) {
    memCache.set(cacheKey, persisted)
    return persisted
  }

  const existing = inflight.get(cacheKey)
  if (existing) return existing

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await callEdgeFunction<
        { text: string; language: AzureTtsLang },
        AzureTtsResponse
      >('azure-tts', { text: trimmed, language: lang }, { timeoutMs: 30_000 })
      if (!res?.url) return null
      memCache.set(cacheKey, res.url)
      saveLocalUrl(trimmed, lang, res.url)
      return res.url
    } catch {
      return null
    }
  })()

  inflight.set(cacheKey, promise)
  promise.finally(() => inflight.delete(cacheKey))
  return promise
}

/** Azure TTS 사용 가능 여부 (Edge Function 설정 시 true) */
export function hasAzureTts(): boolean {
  return isEdgeFunctionsConfigured()
}
