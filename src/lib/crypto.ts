/**
 * K-Kiswahili-Words Encryption Utility
 * AES-GCM 기반 로컬 데이터 암호화
 */

// 앱 고유 키 (기기별로 생성됨)
const KEY_STORAGE = 'kenya-vocab.key'
const SALT = 'KKiswahiliWords2026'

/**
 * 암호화 키 생성 또는 가져오기
 */
async function getOrCreateKey(): Promise<CryptoKey> {
  try {
    // 저장된 키가 있으면 복원
    const storedKey = localStorage.getItem(KEY_STORAGE)
    if (storedKey) {
      const keyData = Uint8Array.from(atob(storedKey), c => c.charCodeAt(0))
      return await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      )
    }
  } catch {
    // 키 복원 실패 시 새로 생성
  }

  // 새 키 생성
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  // 키 저장
  try {
    const exported = await crypto.subtle.exportKey('raw', key)
    const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)))
    localStorage.setItem(KEY_STORAGE, keyBase64)
  } catch {
    // 저장 실패해도 현재 세션에서는 사용 가능
  }

  return key
}

/**
 * PBKDF2 기반 키 파생 (추가 보안층)
 * 향후 패스워드 기반 암호화에 사용 가능
 */
export async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password + SALT),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// 캐시된 키
let cachedKey: CryptoKey | null = null

/**
 * 데이터 암호화
 */
export async function encrypt(data: string): Promise<string> {
  try {
    if (!cachedKey) {
      cachedKey = await getOrCreateKey()
    }

    const encoder = new TextEncoder()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cachedKey,
      encoder.encode(data)
    )

    // IV + 암호화된 데이터를 Base64로 인코딩
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    return btoa(String.fromCharCode(...combined))
  } catch {
    // 암호화 실패 시 난독화 폴백
    return obfuscate(data)
  }
}

/**
 * 데이터 복호화
 */
export async function decrypt(encryptedData: string): Promise<string> {
  try {
    // 난독화된 데이터인지 확인
    if (encryptedData.startsWith('OBF:')) {
      return deobfuscate(encryptedData)
    }

    if (!cachedKey) {
      cachedKey = await getOrCreateKey()
    }

    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cachedKey,
      data
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    // 복호화 실패 시 원본 데이터 시도
    try {
      // 암호화되지 않은 JSON인지 확인
      JSON.parse(encryptedData)
      return encryptedData
    } catch {
      throw new Error('복호화 실패')
    }
  }
}

/**
 * 간단한 난독화 (암호화 불가 환경용 폴백)
 */
function obfuscate(data: string): string {
  const encoded = btoa(encodeURIComponent(data))
  // 문자 위치 변경
  const shuffled = encoded.split('').map((char, i) => 
    String.fromCharCode(char.charCodeAt(0) ^ (i % 256))
  ).join('')
  return 'OBF:' + btoa(shuffled)
}

/**
 * 난독화 해제
 */
function deobfuscate(data: string): string {
  const encoded = atob(data.slice(4))
  const unshuffled = encoded.split('').map((char, i) =>
    String.fromCharCode(char.charCodeAt(0) ^ (i % 256))
  ).join('')
  return decodeURIComponent(atob(unshuffled))
}

/**
 * 암호화 지원 여부 확인
 */
export function isEncryptionSupported(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.subtle.encrypt === 'function'
}

/**
 * 데이터 무결성 해시 생성
 */
export async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
}

/**
 * 데이터 무결성 검증
 */
export async function verifyHash(data: string, hash: string): Promise<boolean> {
  const computed = await generateHash(data)
  return computed === hash
}
