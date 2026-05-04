/**
 * Supabase Edge Functions 호출 헬퍼
 *  - 클라이언트는 외부 API 키를 갖지 않습니다.
 *  - Supabase anon key 와 (선택) APP_SECRET 만 헤더로 보냄.
 *  - URL 은 VITE_SUPABASE_URL/functions/v1/<name>
 */

import { env } from './env'

const APP_SECRET = (import.meta.env.VITE_APP_SECRET as string | undefined) ?? ''

function buildUrl(name: string): string {
  if (!env.supabaseUrl) throw new Error('Supabase URL not configured')
  // supabaseUrl 형식: https://xxxx.supabase.co
  const base = env.supabaseUrl.replace(/\/$/, '')
  return `${base}/functions/v1/${name}`
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!env.supabaseAnonKey) throw new Error('Supabase anon key not configured')
  const headers: Record<string, string> = {
    apikey: env.supabaseAnonKey,
    authorization: `Bearer ${env.supabaseAnonKey}`,
    'content-type': 'application/json',
    ...extra,
  }
  if (APP_SECRET) headers['x-app-secret'] = APP_SECRET
  return headers
}

export class EdgeFunctionError extends Error {
  status: number
  retryAfterSec?: number
  constructor(message: string, status: number, retryAfterSec?: number) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.status = status
    this.retryAfterSec = retryAfterSec
  }
}

async function handleError(res: Response): Promise<never> {
  let message = `HTTP ${res.status}`
  let retryAfterSec: number | undefined
  try {
    const body = (await res.json()) as { error?: string; retryAfterSec?: number }
    if (body?.error) message = body.error
    if (typeof body?.retryAfterSec === 'number') retryAfterSec = body.retryAfterSec
  } catch {
    /* ignore */
  }
  throw new EdgeFunctionError(message, res.status, retryAfterSec)
}

/**
 * JSON 응답을 받는 Edge Function 호출
 */
export async function callEdgeFunction<TReq, TRes>(
  name: string,
  body: TReq,
  options: { timeoutMs?: number } = {}
): Promise<TRes> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)

  try {
    const res = await fetch(buildUrl(name), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) await handleError(res)
    return (await res.json()) as TRes
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 바이너리(ArrayBuffer) 응답을 받는 Edge Function 호출
 */
export async function callEdgeFunctionBinary<TReq>(
  name: string,
  body: TReq,
  options: { timeoutMs?: number } = {}
): Promise<ArrayBuffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000)

  try {
    const res = await fetch(buildUrl(name), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) await handleError(res)
    return await res.arrayBuffer()
  } finally {
    clearTimeout(timer)
  }
}

export function isEdgeFunctionsConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey)
}
