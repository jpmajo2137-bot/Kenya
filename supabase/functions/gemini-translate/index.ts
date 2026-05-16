// Edge Function: gemini-translate
//   - Google Gemini API 프록시 (번역)
//
// 환경 변수:
//   GEMINI_API_KEY               - 필수
//   SUPABASE_ANON_KEY            - 필수
//   APP_SHARED_SECRET            - 선택
//   ALLOWED_ORIGINS              - 선택

import { preflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { verifyAppRequest, safeFetch } from '../_shared/security.ts'
import { rateLimit, getClientId } from '../_shared/rateLimit.ts'
import {
  ValidationError,
  assertString,
  assertOptionalString,
} from '../_shared/validation.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)
  if (!GEMINI_API_KEY) return errorResponse(req, 'GEMINI_API_KEY not configured', 500)

  const auth = verifyAppRequest(req)
  if (!auth.ok) return errorResponse(req, 'Unauthorized', 401)

  // Translate: 분당 30회, 시간당 500회
  const ip = getClientId(req)
  const r1 = rateLimit(ip, { windowMs: 60_000, max: 30, keyPrefix: 'tr:1m' })
  if (!r1.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retryAfterSec: r1.retryAfterSec }),
      { status: 429, headers: { 'content-type': 'application/json' } }
    )
  }
  const r2 = rateLimit(ip, { windowMs: 3_600_000, max: 500, keyPrefix: 'tr:1h' })
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

    // Warmup ping: Gemini API 호출 없이 컨테이너만 깨워서 즉시 응답.
    // 클라이언트가 사전 화면 진입 시 fire-and-forget 으로 호출.
    if (b.ping === true) {
      return jsonResponse(req, { ok: true, warm: true })
    }

    const prompt = assertString(b.prompt, 'prompt', { max: 4000 })
    const model = assertOptionalString(b.model, 'model', { max: 100 }) ?? 'gemini-2.5-flash'

    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`

    // Gemini 2.5 Flash 의 "thinking" 은 단순 사전 번역에는 불필요한 지연(수 초)을 만든다.
    // thinkingBudget: 0 으로 비활성화하면 응답 속도가 5~10배 빨라진다.
    const upstream = await safeFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
      30_000
    )

    if (!upstream.ok) {
      return errorResponse(req, `Gemini error: ${upstream.status}`, 502)
    }

    const data = await upstream.json()
    return jsonResponse(req, data)
  } catch (err) {
    if (err instanceof ValidationError) {
      return errorResponse(req, err.message, 400)
    }
    return errorResponse(req, 'Internal error', 500)
  }
})
