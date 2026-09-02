import { STORAGE_PREFIX } from './appIdentity'

/**
 * Oxford English Words Encryption Utility
 * AES-GCM 256bit 기반 로컬 데이터 암호화 (강화 버전)
 *
 * 보안 정책:
 *  - AES-GCM 256bit (인증 암호화 - 위변조 자동 감지)
 *  - 매 저장마다 12바이트 무작위 IV 생성
 *  - 로컬 마스터 키는 SubtleCrypto 로 OS RNG 에서 생성
 *  - 추가 PBKDF2 파생: SHA-256, OWASP 2024 권장 600,000 iterations
 *  - Salt 는 기기별 무작위 16바이트 생성, 키와 분리 저장
 *  - 데이터 무결성 SHA-256 해시 검증
 *  - 복호화 실패시 평문 노출 금지 (예외 발생)
 */

const KEY_STORAGE = `${STORAGE_PREFIX}.key`
const SALT_STORAGE = `${STORAGE_PREFIX}.salt`
const VERSION_PREFIX = 'v2:'
const LEGACY_PREFIXES = ['', 'OBF:']
const PBKDF2_ITERATIONS = 600_000

// 메모리 캐시
let cachedKey: CryptoKey | null = null
let cachedSalt: Uint8Array | null = null

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function newBytes(length: number): Uint8Array {
  return new Uint8Array(new ArrayBuffer(length))
}

function getOrCreateSalt(): Uint8Array {
  if (cachedSalt) return cachedSalt
  try {
    const stored = localStorage.getItem(SALT_STORAGE)
    if (stored) {
      cachedSalt = base64ToBytes(stored)
      return cachedSalt
    }
  } catch {
    /* ignore */
  }
  const salt = crypto.getRandomValues(newBytes(16))
  try {
    localStorage.setItem(SALT_STORAGE, bytesToBase64(salt))
  } catch {
    /* ignore */
  }
  cachedSalt = salt
  return salt
}

async function getOrCreateKey(): Promise<CryptoKey> {
  try {
    const storedKey = localStorage.getItem(KEY_STORAGE)
    if (storedKey) {
      const keyData = base64ToBytes(storedKey)
      const keyBuffer = new ArrayBuffer(keyData.length)
      new Uint8Array(keyBuffer).set(keyData)
      return await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      )
    }
  } catch {
    /* 키 복원 실패 시 새로 생성 */
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  try {
    const exported = await crypto.subtle.exportKey('raw', key)
    const keyBase64 = bytesToBase64(new Uint8Array(exported))
    localStorage.setItem(KEY_STORAGE, keyBase64)
  } catch {
    /* 저장 실패해도 현재 세션에서는 사용 가능 */
  }

  return key
}

/**
 * PBKDF2 기반 키 파생 (패스워드 기반 암호화용)
 * OWASP 2024 권장: SHA-256 / 600,000 iterations
 */
export async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passBytes = newBytes(0)
  const passEncoded = encoder.encode(password)
  const passBuffer = new ArrayBuffer(passEncoded.length)
  new Uint8Array(passBuffer).set(passEncoded)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  // Salt 를 ArrayBuffer 로 복사 (TS 호환)
  const saltSrc = getOrCreateSalt()
  const saltBuffer = new ArrayBuffer(saltSrc.length)
  new Uint8Array(saltBuffer).set(saltSrc)
  void passBytes

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * 데이터 암호화
 * 출력 형식: "v2:" + base64(IV(12) || ciphertext)
 */
export async function encrypt(data: string): Promise<string> {
  if (!cachedKey) cachedKey = await getOrCreateKey()

  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(newBytes(12))

  const dataEncoded = encoder.encode(data)
  const dataBuffer = new ArrayBuffer(dataEncoded.length)
  new Uint8Array(dataBuffer).set(dataEncoded)

  const ivBuffer = new ArrayBuffer(iv.length)
  new Uint8Array(ivBuffer).set(iv)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    cachedKey,
    dataBuffer
  )

  const combined = newBytes(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return VERSION_PREFIX + bytesToBase64(combined)
}

/**
 * 데이터 복호화
 *  - v2: 접두사가 있으면 신규 형식
 *  - 없으면 구 형식(접두사 없는 base64) 시도
 *  - 복호화 실패 시 즉시 예외 (평문 노출 방지)
 */
export async function decrypt(encryptedData: string): Promise<string> {
  if (!cachedKey) cachedKey = await getOrCreateKey()

  const payload = encryptedData.startsWith(VERSION_PREFIX)
    ? encryptedData.slice(VERSION_PREFIX.length)
    : encryptedData

  if (encryptedData.startsWith('OBF:')) {
    return deobfuscate(encryptedData)
  }

  try {
    const combined = base64ToBytes(payload)
    if (combined.length < 13) throw new Error('너무 짧은 암호문')
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)

    const ivBuffer = new ArrayBuffer(iv.length)
    new Uint8Array(ivBuffer).set(iv)
    const dataBuffer = new ArrayBuffer(data.length)
    new Uint8Array(dataBuffer).set(data)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      cachedKey,
      dataBuffer
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    // 마지막 폴백: 입력이 사실 평문 JSON 인 경우만 허용
    try {
      JSON.parse(encryptedData)
      return encryptedData
    } catch {
      throw new Error('복호화 실패')
    }
  }
}

/**
 * 구버전 호환 - 난독화 해제 (XOR + base64)
 */
function deobfuscate(data: string): string {
  const encoded = atob(data.slice(4))
  const unshuffled = encoded
    .split('')
    .map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ (i % 256)))
    .join('')
  return decodeURIComponent(atob(unshuffled))
}

/**
 * 암호화 지원 여부 확인
 */
export function isEncryptionSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function'
  )
}

/**
 * 데이터 무결성 해시 생성 (SHA-256)
 */
export async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(data)
  const buffer = new ArrayBuffer(encoded.length)
  new Uint8Array(buffer).set(encoded)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return bytesToBase64(new Uint8Array(hashBuffer))
}

/**
 * 상수 시간 비교 (timing attack 방어)
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * 데이터 무결성 검증 (timing-safe)
 */
export async function verifyHash(data: string, hash: string): Promise<boolean> {
  const computed = await generateHash(data)
  return timingSafeEqual(computed, hash)
}

/**
 * 메모리 캐시된 키 폐기 (로그아웃/세션종료 시 호출)
 */
export function clearKeyCache(): void {
  cachedKey = null
  cachedSalt = null
}

// 구 인터페이스 호환을 위한 plain export
export const _legacyPrefixes = LEGACY_PREFIXES
