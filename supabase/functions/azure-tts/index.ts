// Edge Function: azure-tts
//   - Microsoft Azure TTS 프록시 (text → mp3)
//   - "공유 캐시" 구조:
//       1) 요청을 SHA1 해시로 캐시 키화 (vocabaudio/tts-cache/<lang>/<hash>.mp3)
//       2) Supabase Storage 에 이미 객체가 있으면 그 publicUrl 만 반환 (Azure 미호출 → 비용 0)
//       3) 없을 때만 Azure TTS 호출 → mp3 받음 → Storage 에 업로드 → publicUrl 반환
//     => 한 사용자가 합성한 단어/문장은 모든 사용자가 무료로 재생.
//
//   - 응답: JSON { url: string, cached: boolean, hash: string }
//
// 환경 변수 (Supabase secrets):
//   AZURE_TTS_KEY                 - 필수
//   AZURE_TTS_REGION              - 필수 (예: koreacentral, southeastasia, ...)
//   SUPABASE_URL                  - 자동 주입
//   SUPABASE_SERVICE_ROLE_KEY     - 자동 주입 (Storage 업로드용)
//   SUPABASE_ANON_KEY             - 필수 (verifyAppRequest 용)
//   APP_SHARED_SECRET             - 선택
//   ALLOWED_ORIGINS               - 선택

import { preflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { verifyAppRequest, safeFetch } from '../_shared/security.ts'
import { rateLimit, getClientId } from '../_shared/rateLimit.ts'
import {
  ValidationError,
  assertString,
  assertOneOf,
  assertOptionalString,
} from '../_shared/validation.ts'

const AZURE_TTS_KEY = Deno.env.get('AZURE_TTS_KEY') ?? ''
const AZURE_TTS_REGION = Deno.env.get('AZURE_TTS_REGION') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const BUCKET = 'vocabaudio'
const FOLDER = 'tts-cache'
const VOICE_VERSION = 1 // 클라이언트 ttsCache.ts 의 VOICE_VERSION 과 동일 유지!

const VOICE_DEFAULTS = {
  ko: 'ko-KR-SunHiNeural',
  sw: 'sw-KE-ZuriNeural',
  en: 'en-US-JennyNeural',
} as const

type Lang = 'ko' | 'sw' | 'en'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSsml(opts: {
  text: string
  language: Lang
  voice?: string
  rate?: string
  ssmlContentOverride?: string
}): string {
  const voice = opts.voice ?? VOICE_DEFAULTS[opts.language]
  const rate = opts.rate ?? '0.9'
  const langCode =
    opts.language === 'ko' ? 'ko-KR' : opts.language === 'sw' ? 'sw-KE' : 'en-US'

  const inner =
    opts.ssmlContentOverride ?? `<prosody rate="${escapeXml(rate)}">${escapeXml(opts.text)}</prosody>`

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langCode}">
  <voice name="${escapeXml(voice)}">
    ${inner}
  </voice>
</speak>`
}

async function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-1', data)
  const bytes = Array.from(new Uint8Array(buf))
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function makeCachePath(text: string, lang: Lang): Promise<{ key: string; path: string; hash: string }> {
  // 클라이언트 src/lib/ttsCache.ts 의 makeCacheKey 와 정확히 같은 규칙이어야 한다
  const composite = 'v' + VOICE_VERSION + ':' + lang + ':' + text
  const hash = (await sha1Hex(composite)).slice(0, 16)
  return {
    key: composite,
    path: `${FOLDER}/${lang}/${hash}.mp3`,
    hash,
  }
}

function publicUrlFor(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

async function objectExists(path: string): Promise<boolean> {
  // public URL HEAD 가 가장 가벼움 (anon 권한 불필요, CDN edge 캐시도 활용)
  try {
    const res = await safeFetch(publicUrlFor(path), { method: 'HEAD' }, 5_000)
    return res.ok
  } catch {
    return false
  }
}

async function uploadMp3(path: string, mp3: ArrayBuffer): Promise<boolean> {
  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) return false
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`
  try {
    const res = await safeFetch(
      url,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          'content-type': 'audio/mpeg',
          'cache-control': 'public, max-age=31536000, immutable',
          'x-upsert': 'true', // 동시에 같은 객체 올라오면 덮어써도 무해 (동일 콘텐츠)
        },
        body: mp3,
      },
      20_000,
    )
    return res.ok
  } catch {
    return false
  }
}

async function callAzureTts(ssml: string): Promise<{ ok: true; mp3: ArrayBuffer } | { ok: false; status: number; message: string }> {
  const endpoint = `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  try {
    const res = await safeFetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'kenya-vocab-app',
        },
        body: ssml,
      },
      30_000,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, message: text.slice(0, 300) || `HTTP ${res.status}` }
    }
    const mp3 = await res.arrayBuffer()
    return { ok: true, mp3 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, message: msg.slice(0, 300) }
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)

  if (!AZURE_TTS_KEY || !AZURE_TTS_REGION) {
    return errorResponse(req, 'AZURE_TTS not configured', 500)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse(req, 'Supabase storage not configured', 500)
  }

  const auth = verifyAppRequest(req)
  if (!auth.ok) return errorResponse(req, 'Unauthorized', 401)

  // TTS rate limit: 분당 60회 / 시간당 1000회
  const ip = getClientId(req)
  const r1 = rateLimit(ip, { windowMs: 60_000, max: 60, keyPrefix: 'tts:1m' })
  if (!r1.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retryAfterSec: r1.retryAfterSec }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    )
  }
  const r2 = rateLimit(ip, { windowMs: 3_600_000, max: 1000, keyPrefix: 'tts:1h' })
  if (!r2.allowed) {
    return new Response(
      JSON.stringify({ error: 'Hourly quota exceeded', retryAfterSec: r2.retryAfterSec }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(req, 'Invalid JSON body', 400)
  }

  try {
    const b = body as Record<string, unknown>
    const text = assertString(b.text, 'text', { max: 5000 }).trim()
    if (!text) return errorResponse(req, 'text is empty', 400)
    const language = assertOneOf(b.language, 'language', ['ko', 'sw', 'en'] as const) as Lang
    const voiceOverride = assertOptionalString(b.voice, 'voice', { max: 100 })
    const rateOverride = assertOptionalString(b.rate, 'rate', { max: 16 })
    const ssmlContentOverride = assertOptionalString(b.ssml, 'ssml', { max: 8000 })

    const { path, hash } = await makeCachePath(text, language)
    const url = publicUrlFor(path)

    // 1. 캐시 hit?
    if (await objectExists(path)) {
      return jsonResponse(req, { url, cached: true, hash })
    }

    // 2. miss → Azure TTS 호출
    const ssml = buildSsml({
      text,
      language,
      voice: voiceOverride,
      rate: rateOverride,
      ssmlContentOverride,
    })
    const azure = await callAzureTts(ssml)
    if (!azure.ok) {
      return errorResponse(
        req,
        `Azure TTS failed (${azure.status}): ${azure.message}`,
        azure.status >= 400 && azure.status < 500 ? 502 : 502,
      )
    }

    // 3. Storage 업로드 (실패해도 음성은 반환할 수 있게 base64 폴백)
    const uploaded = await uploadMp3(path, azure.mp3)
    if (uploaded) {
      return jsonResponse(req, { url, cached: false, hash })
    }

    // Storage 업로드 실패 시 mp3 자체를 base64 로 한 번만 보내서 재생은 보장
    const base64 = btoa(String.fromCharCode(...new Uint8Array(azure.mp3)))
    return jsonResponse(req, {
      url: `data:audio/mpeg;base64,${base64}`,
      cached: false,
      hash,
      uploadFailed: true,
    })
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(req, err.message, 400)
    return errorResponse(req, 'Internal error', 500)
  }
})
