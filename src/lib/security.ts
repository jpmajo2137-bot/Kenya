/**
 * K-Kiswahili-Words Security Utilities
 * XSS 방지, 입력값 검증, 콘솔 잠금, 민감정보 마스킹
 */

const isProd = import.meta.env.PROD

/**
 * HTML 특수문자 이스케이프 (XSS 방지)
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  }
  return str.replace(/[&<>"'`=/]/g, char => htmlEscapes[char] || char)
}

/**
 * HTML 태그 제거
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '')
}

/**
 * 위험한 문자열 패턴 감지
 */
export function containsDangerousPattern(str: string): boolean {
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:/i,
    /vbscript:/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<form/i,
    /expression\s*\(/i,
    /url\s*\(/i,
  ]

  return dangerousPatterns.some(pattern => pattern.test(str))
}

/**
 * 입력값 살균 (sanitize)
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (!input) return ''

  let sanitized = stripHtml(input)

  sanitized = sanitized
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')

  sanitized = sanitized.trim().replace(/\s+/g, ' ')

  return sanitized
}

/**
 * URL 유효성 검사
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['https:', 'http:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * 안전한 URL인지 확인 (화이트리스트)
 */
export function isSafeUrl(url: string): boolean {
  if (!isValidUrl(url)) return false

  const parsed = new URL(url)
  // 보안: HTTPS 만 허용
  if (parsed.protocol !== 'https:') return false

  const allowedDomains = [
    'supabase.co',
    'supabase.com',
    'googleapis.com',
    'google.com',
    'gstatic.com',
    'openai.com',
    'firebaseio.com',
    'firebase.google.com',
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'ip-api.com',
    'ipapi.co',
  ]

  return allowedDomains.some(
    domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
  )
}

/**
 * 이메일 유효성 검사
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 문자열 길이 제한
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * 안전한 JSON 파싱
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    const parsed = JSON.parse(json)

    if (typeof defaultValue === 'object' && defaultValue !== null) {
      if (typeof parsed !== 'object' || parsed === null) {
        return defaultValue
      }
    }

    return parsed as T
  } catch {
    return defaultValue
  }
}

/**
 * 숫자 범위 제한
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Rate Limiting 헬퍼
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(key)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= maxRequests) {
    return false
  }

  record.count++
  return true
}

/**
 * 디바운스 함수
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * 쓰로틀 함수
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

// ===========================================
// 강화된 보안 헬퍼 (v2)
// ===========================================

function truncateValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > 500) {
    return value.slice(0, 500) + '…(잘림)'
  }
  return value
}

/**
 * 콘솔 보안 (프로덕션에서 로그 제거 + 외부 SDK 도 차단)
 */
export function secureConsole(): void {
  if (!isProd) return
  if (typeof console === 'undefined') return
  const noop = () => {}
  const methods: string[] = [
    'log',
    'info',
    'debug',
    'trace',
    'table',
    'dir',
    'dirxml',
    'group',
    'groupCollapsed',
    'groupEnd',
    'time',
    'timeEnd',
    'timeLog',
    'count',
    'countReset',
    'profile',
    'profileEnd',
  ]
  for (const m of methods) {
    try {
      ;(console as unknown as Record<string, unknown>)[m] = noop
    } catch {
      /* ignore */
    }
  }
  // warn / error 는 크래시 분석을 위해 유지하되 길이 제한 + 마스킹
  const safeWarn = console.warn?.bind(console)
  const safeError = console.error?.bind(console)
  if (safeWarn) {
    console.warn = (...args: unknown[]) =>
      safeWarn(
        ...args.map(a =>
          typeof a === 'string' ? maskSensitivePatterns(a) : truncateValue(a)
        )
      )
  }
  if (safeError) {
    console.error = (...args: unknown[]) =>
      safeError(
        ...args.map(a =>
          typeof a === 'string' ? maskSensitivePatterns(a) : truncateValue(a)
        )
      )
  }
}

/**
 * 민감 문자열 마스킹 (API 키, 토큰 등)
 */
export function maskSensitive(value: string | undefined | null): string {
  if (!value) return ''
  const s = String(value)
  if (s.length < 8) return '*'.repeat(s.length)
  return s.slice(0, 2) + '*'.repeat(Math.max(4, s.length - 4)) + s.slice(-2)
}

/**
 * 정규식 기반 민감 패턴 마스킹 (로그/오류 보고용)
 */
export function maskSensitivePatterns(text: string): string {
  if (!text) return text
  return text
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<JWT-MASKED>')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '<OPENAI-KEY-MASKED>')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '<GOOGLE-KEY-MASKED>')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{20,}/gi, 'Bearer <MASKED>')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<EMAIL-MASKED>')
}

/**
 * 안전한 localStorage 래퍼 (예외 처리 + 용량 보호)
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/**
 * 브라우저 개발자 도구 감지 (휴리스틱)
 *  - 일부 자동화 도구 / 화이트박스 분석 차단에 도움
 */
export function detectDevTools(): boolean {
  if (typeof window === 'undefined') return false
  const threshold = 160
  const widthThreshold = window.outerWidth - window.innerWidth > threshold
  const heightThreshold = window.outerHeight - window.innerHeight > threshold

  return widthThreshold || heightThreshold
}

/**
 * 자동화/봇/Webdriver 감지
 */
export function isLikelyAutomated(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return true
    if (typeof window === 'undefined') return false
    const w = window as unknown as Record<string, unknown>
    return Boolean(
      w.__SELENIUM__ ||
        w.__webdriver_evaluate ||
        w.callPhantom ||
        w._phantom ||
        w.Cypress ||
        w.__nightmare
    )
  } catch {
    return false
  }
}

/**
 * 앱 시작 시 호출되는 통합 보안 부트스트랩
 */
export function initSecurity(): void {
  // 1) 프로덕션 console 잠금 + 민감 패턴 마스킹
  secureConsole()

  if (!isProd) return
  if (typeof window === 'undefined') return

  // 2) 키보드 단축키로 개발자 도구 열기 차단 (PWA 경로)
  window.addEventListener(
    'keydown',
    e => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey &&
          e.shiftKey &&
          (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && e.key === 'U') // 소스 보기
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    { capture: true }
  )

  // 3) 페이지 종료 시 lockdown 이벤트 (다른 모듈이 키 캐시 비우는 데 사용)
  window.addEventListener('pagehide', () => {
    try {
      window.dispatchEvent(new CustomEvent('app:lockdown'))
    } catch {
      /* ignore */
    }
  })
}
