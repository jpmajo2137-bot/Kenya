// IP/세션 기반 인메모리 rate limiter
// 주의: Edge Function 인스턴스마다 독립적이라 완벽하지 않음.
// 강력한 rate limit 이 필요하면 Upstash Redis 또는 Supabase Database 의 Counter 테이블 사용 권장.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// 주기적 정리 (메모리 누수 방지)
let lastCleanup = Date.now()
function cleanupIfNeeded() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key)
  }
}

export interface RateLimitOptions {
  windowMs: number
  max: number
  keyPrefix?: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSec: number
}

export function rateLimit(
  identifier: string,
  opts: RateLimitOptions
): RateLimitResult {
  cleanupIfNeeded()
  const key = `${opts.keyPrefix ?? ''}:${identifier}`
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    const next: Bucket = { count: 1, resetAt: now + opts.windowMs }
    buckets.set(key, next)
    return {
      allowed: true,
      remaining: opts.max - 1,
      resetAt: next.resetAt,
      retryAfterSec: 0,
    }
  }

  if (bucket.count >= opts.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }

  bucket.count += 1
  return {
    allowed: true,
    remaining: opts.max - bucket.count,
    resetAt: bucket.resetAt,
    retryAfterSec: 0,
  }
}

export function getClientId(req: Request): string {
  // Supabase Edge 는 cf 헤더 / x-forwarded-for 를 채워줌
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const ip = fwd.split(',')[0].trim() || 'unknown'
  // 사용자별 추가 식별자가 필요하면 Authorization 헤더에서 user id 파싱
  return ip
}
