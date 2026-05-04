// Edge Function: openai-vocab
//   - OpenAI Chat Completions 프록시 (단어 생성)
//   - 클라이언트는 OpenAI API 키를 갖지 않습니다.
//
// 환경 변수 (Supabase Project > Edge Functions > Secrets):
//   OPENAI_API_KEY               - 필수
//   OPENAI_MODEL                 - 선택 (기본 gpt-4o-mini)
//   SUPABASE_ANON_KEY            - 필수 (요청 검증용)
//   APP_SHARED_SECRET            - 선택 (추가 검증)
//   ALLOWED_ORIGINS              - 선택 (쉼표 구분)

import { preflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { verifyAppRequest, safeFetch } from '../_shared/security.ts'
import { rateLimit, getClientId } from '../_shared/rateLimit.ts'
import {
  ValidationError,
  assertString,
  assertOneOf,
  assertInt,
  assertOptionalString,
} from '../_shared/validation.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  if (req.method !== 'POST') {
    return errorResponse(req, 'Method not allowed', 405)
  }

  if (!OPENAI_API_KEY) {
    return errorResponse(req, 'OPENAI_API_KEY not configured', 500)
  }

  const auth = verifyAppRequest(req)
  if (!auth.ok) return errorResponse(req, 'Unauthorized', 401)

  // Rate limit: IP 당 분당 20회, 시간당 200회
  const ip = getClientId(req)
  const r1 = rateLimit(ip, { windowMs: 60_000, max: 20, keyPrefix: 'vocab:1m' })
  if (!r1.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retryAfterSec: r1.retryAfterSec }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(r1.retryAfterSec),
        },
      }
    )
  }
  const r2 = rateLimit(ip, { windowMs: 3_600_000, max: 200, keyPrefix: 'vocab:1h' })
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
    const systemPrompt = assertString(b.systemPrompt, 'systemPrompt', { max: 8000 })
    const userPrompt = assertString(b.userPrompt, 'userPrompt', { max: 8000 })
    const temperature = b.temperature !== undefined
      ? Number(assertInt(b.temperature as number, 'temperature', { min: 0, max: 100 })) / 100
      : 0.7
    const responseFormat = assertOneOf(
      b.responseFormat ?? 'json_object',
      'responseFormat',
      ['text', 'json_object'] as const
    )
    const model = assertOptionalString(b.model, 'model', { max: 100 }) ?? OPENAI_MODEL

    const upstream = await safeFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          response_format: { type: responseFormat },
        }),
      },
      90_000
    )

    if (!upstream.ok) {
      const text = await upstream.text()
      return errorResponse(req, `OpenAI error: ${upstream.status}`, 502)
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
