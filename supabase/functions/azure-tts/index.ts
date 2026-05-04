// Edge Function: azure-tts
//   - Microsoft Azure TTS 프록시 (SSML → MP3)
//   - 응답은 audio/mpeg 바이너리
//
// 환경 변수:
//   AZURE_TTS_KEY                - 필수
//   AZURE_TTS_REGION             - 필수 (예: koreacentral)
//   SUPABASE_ANON_KEY            - 필수
//   APP_SHARED_SECRET            - 선택
//   ALLOWED_ORIGINS              - 선택

import { preflight, errorResponse, binaryResponse } from '../_shared/cors.ts'
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

const VOICE_DEFAULTS = {
  ko: 'ko-KR-SunHiNeural',
  sw: 'sw-KE-RafikiNeural',
  en: 'en-US-JennyNeural',
} as const

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
  language: 'ko' | 'sw' | 'en'
  voice?: string
  rate?: string
}): string {
  const voice = opts.voice ?? VOICE_DEFAULTS[opts.language]
  const rate = opts.rate ?? '0.9'
  const langCode =
    opts.language === 'ko'
      ? 'ko-KR'
      : opts.language === 'sw'
        ? 'sw-KE'
        : 'en-US'

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langCode}">
  <voice name="${escapeXml(voice)}">
    <prosody rate="${escapeXml(rate)}">${escapeXml(opts.text)}</prosody>
  </voice>
</speak>`
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)
  if (!AZURE_TTS_KEY || !AZURE_TTS_REGION) {
    return errorResponse(req, 'AZURE_TTS not configured', 500)
  }

  const auth = verifyAppRequest(req)
  if (!auth.ok) return errorResponse(req, 'Unauthorized', 401)

  // TTS 는 횟수 많을 수 있음: 분당 60회, 시간당 1000회
  const ip = getClientId(req)
  const r1 = rateLimit(ip, { windowMs: 60_000, max: 60, keyPrefix: 'tts:1m' })
  if (!r1.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retryAfterSec: r1.retryAfterSec }),
      { status: 429, headers: { 'content-type': 'application/json' } }
    )
  }
  const r2 = rateLimit(ip, { windowMs: 3_600_000, max: 1000, keyPrefix: 'tts:1h' })
  if (!r2.allowed) {
    return new Response(
      JSON.stringify({ error: 'Hourly quota exceeded', retryAfterSec: r2.retryAfterSec }),
      { status: 429, headers: { 'content-type': 'application/json' } }
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
    const text = assertString(b.text, 'text', { max: 5000 })
    const language = assertOneOf(b.language, 'language', ['ko', 'sw', 'en'] as const)
    const voice = assertOptionalString(b.voice, 'voice', { max: 100 })
    const rate = assertOptionalString(b.rate, 'rate', { max: 20 })
    const ssmlOverride = assertOptionalString(b.ssml, 'ssml', { max: 8000 })

    const ssml = ssmlOverride ?? buildSsml({ text, language, voice, rate })

    const endpoint = `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
    const upstream = await safeFetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'kenya-vocab-edge',
        },
        body: ssml,
      },
      60_000
    )

    if (!upstream.ok) {
      return errorResponse(req, `Azure TTS error: ${upstream.status}`, 502)
    }

    const audio = await upstream.arrayBuffer()
    return binaryResponse(req, audio, 'audio/mpeg')
  } catch (err) {
    if (err instanceof ValidationError) {
      return errorResponse(req, err.message, 400)
    }
    return errorResponse(req, 'Internal error', 500)
  }
})
