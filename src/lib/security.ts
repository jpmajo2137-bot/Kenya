/**
 * K-Kiswahili-Words Security Utilities
 * XSS 방지 및 입력값 검증
 */

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
    /on\w+\s*=/i,  // onclick=, onerror= 등
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
  
  // HTML 태그 제거
  let sanitized = stripHtml(input)
  
  // 위험한 패턴 제거
  sanitized = sanitized
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
  
  // 공백 정규화
  sanitized = sanitized.trim().replace(/\s+/g, ' ')
  
  return sanitized
}

/**
 * URL 유효성 검사
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // HTTPS 또는 HTTP만 허용
    return ['https:', 'http:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * 안전한 URL인지 확인
 */
export function isSafeUrl(url: string): boolean {
  if (!isValidUrl(url)) return false
  
  const parsed = new URL(url)
  
  // 허용된 도메인 목록
  const allowedDomains = [
    'supabase.co',
    'supabase.com',
    'googleapis.com',
    'google.com',
    'gstatic.com',
    'openai.com',
    'firebaseio.com',
    'firebase.google.com',
  ]
  
  return allowedDomains.some(domain => 
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
    
    // 타입 검사
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

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
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
      setTimeout(() => { inThrottle = false }, limit)
    }
  }
}

/**
 * 콘솔 보안 (프로덕션에서 로그 제거)
 */
export function secureConsole(): void {
  if (import.meta.env.PROD) {
    // 프로덕션에서 콘솔 비활성화
    const noop = () => {}
    console.log = noop
    console.debug = noop
    console.info = noop
    // console.warn과 console.error는 유지 (중요 오류 추적용)
  }
}

/**
 * 브라우저 개발자 도구 감지 (디버깅 방지)
 */
export function detectDevTools(): boolean {
  const threshold = 160
  const widthThreshold = window.outerWidth - window.innerWidth > threshold
  const heightThreshold = window.outerHeight - window.innerHeight > threshold
  
  return widthThreshold || heightThreshold
}
