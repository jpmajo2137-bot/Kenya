// Shared request security helpers for Supabase Edge Functions.
// Supports both legacy anon JWT keys and new sb_publishable_* keys.

const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_PUBLISHABLE_KEYS = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? ''
const APP_SHARED_SECRET = Deno.env.get('APP_SHARED_SECRET') ?? ''

function extractBearer(authHeader: string): string {
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
}

function publishableKeyMatches(token: string): boolean {
  if (!token.startsWith('sb_publishable_')) return false

  if (SUPABASE_PUBLISHABLE_KEYS) {
    try {
      const parsed = JSON.parse(SUPABASE_PUBLISHABLE_KEYS) as unknown
      if (Array.isArray(parsed)) {
        return parsed.some((v) => v === token)
      }
      if (parsed && typeof parsed === 'object') {
        return Object.values(parsed as Record<string, unknown>).some((v) => {
          if (typeof v === 'string') return v === token
          if (v && typeof v === 'object') {
            return Object.values(v as Record<string, unknown>).includes(token)
          }
          return false
        })
      }
    } catch {
      if (SUPABASE_PUBLISHABLE_KEYS.includes(token)) return true
    }
  }

  // If the runtime does not expose raw publishable keys, still allow the
  // gateway-accepted publishable key, but require the app shared secret below.
  return Boolean(APP_SHARED_SECRET)
}

function apiKeyMatches(token: string): boolean {
  if (!token) return false
  if (SUPABASE_ANON_KEY && token === SUPABASE_ANON_KEY) return true
  return publishableKeyMatches(token)
}

export function verifyAppRequest(req: Request): {
  ok: boolean
  reason?: string
} {
  const apikey = req.headers.get('apikey')?.trim() ?? ''
  const bearerToken = extractBearer(req.headers.get('authorization') ?? '')

  if (!apiKeyMatches(apikey) && !apiKeyMatches(bearerToken)) {
    return { ok: false, reason: 'invalid apikey' }
  }

  if (APP_SHARED_SECRET) {
    const sent = req.headers.get('x-app-secret')?.trim() ?? ''
    if (sent !== APP_SHARED_SECRET) {
      return { ok: false, reason: 'invalid app secret' }
    }
  }

  return { ok: true }
}

export async function safeFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}