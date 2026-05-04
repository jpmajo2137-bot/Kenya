// Edge Function: openai-image
//   - OpenAI Images API 프록시 (단어 이미지 생성)
//
// 환경 변수:
//   OPENAI_API_KEY               - 필수
//   OPENAI_IMAGE_MODEL           - 선택 (기본 gpt-image-1)
//   SUPABASE_ANON_KEY            - 필수
//   APP_SHARED_SECRET            - 선택
//   ALLOWED_ORIGINS              - 선택

import { preflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { verifyAppRequest, safeFetch } from '../_shared/security.ts'
import { rateLimit, getClientId } from '../_shared/rateLimit.ts'
import {
  ValidationError,
  assertString,
  assertOneOf,
} from '../_shared/validation.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)
  if (!OPENAI_API_KEY) return errorResponse(req, 'OPENAI_API_KEY not configured', 500)

  const auth = verifyAppRequest(req)
  if (!auth.ok) return errorResponse(req, 'Unauthorized', 401)

  // Image API 는 비싸므로 더 엄격하게: 분당 5회, 시간당 30회
  const ip = getClientId(req)
  const r1 = rateLimit(ip, { windowMs: 60_000, max: 5, keyPrefix: 'img:1m' })
  if (!r1.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retryAfterSec: r1.retryAfterSec }),
      { status: 429, headers: { 'content-type': 'application/json' } }
    )
  }
  const r2 = rateLimit(ip, { windowMs: 3_600_000, max: 30, keyPrefix: 'img:1h' })
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
    const prompt = assertString(b.prompt, 'prompt', { max: 4000 })
    const size = assertOneOf(
      b.size ?? '1024x1024',
      'size',
      ['1024x1024', '1024x1792', '1792x1024'] as const
    )

    const upstream = await safeFetch(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt,
          n: 1,
          size,
        }),
      },
      120_000
    )

    if (!upstream.ok) {
      return errorResponse(req, `OpenAI error: ${upstream.status}`, 502)
    }

    const data = await upstream.json()
    // 응답 형식 정규화: 첫 이미지의 url 또는 b64_json
    const first = (data?.data ?? [])[0] ?? {}
    return jsonResponse(req, {
      url: first.url ?? null,
      b64_json: first.b64_json ?? null,
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return errorResponse(req, err.message, 400)
    }
    return errorResponse(req, 'Internal error', 500)
  }
})
