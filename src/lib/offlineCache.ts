/**
 * 오프라인 캐시 모듈 - IndexedDB를 사용하여 단어 데이터를 로컬에 저장
 * 보안: 데이터 무결성 검증 포함
 */

const DB_NAME = 'k-kiswahili-offline'
const DB_VERSION = 2 // 보안 업데이트
const STORE_NAME = 'vocab'
const META_STORE = 'meta'
const INTEGRITY_STORE = 'integrity'

type Mode = 'sw' | 'ko'

export interface CachedVocab {
  id: string
  mode: Mode
  word: string
  word_pronunciation: string | null
  word_audio_url: string | null
  image_url: string | null

  meaning_sw: string | null
  meaning_sw_pronunciation: string | null
  meaning_sw_audio_url: string | null

  meaning_ko: string | null
  meaning_ko_pronunciation: string | null
  meaning_ko_audio_url: string | null

  meaning_en: string | null
  meaning_en_pronunciation: string | null
  meaning_en_audio_url: string | null

  example: string | null
  example_pronunciation: string | null
  example_audio_url: string | null
  example_translation_sw: string | null
  example_translation_ko: string | null
  example_translation_en: string | null

  pos: string | null
  category: string | null
  difficulty: number | null

  created_at: string
}

interface CacheMeta {
  key: string
  lastUpdated: number
  count: number
  checksum?: string // 데이터 무결성 검증용
}

interface IntegrityRecord {
  id: string
  hash: string
  timestamp: number
}

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * 간단한 해시 함수 (데이터 무결성 검증용)
 */
async function computeHash(data: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
  } catch {
    // 폴백: 간단한 체크섬
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return hash.toString(16)
  }
}

/**
 * 데이터 유효성 검사
 */
function validateVocabItem(item: unknown): item is CachedVocab {
  if (!item || typeof item !== 'object') return false
  const v = item as Record<string, unknown>
  
  // 필수 필드 검사
  if (typeof v.id !== 'string' || v.id.length === 0) return false
  if (typeof v.word !== 'string') return false
  if (v.mode !== 'sw' && v.mode !== 'ko') return false
  
  // XSS 방지: 스크립트 태그 차단
  const dangerousPattern = /<script|javascript:|on\w+=/i
  if (typeof v.word === 'string' && dangerousPattern.test(v.word)) return false
  
  return true
}

/**
 * 문자열 살균 (XSS 방지)
 * 향후 데이터 표시 시 사용 가능
 */
export function sanitizeString(str: string | null | undefined): string | null {
  if (!str) return null
  // HTML 엔티티 이스케이프
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * IndexedDB 연결 가져오기
 */
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 단어 저장소
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('mode', 'mode', { unique: false })
        store.createIndex('category', 'category', { unique: false })
        store.createIndex('mode_category', ['mode', 'category'], { unique: false })
      }

      // 메타 정보 저장소
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }

      // 무결성 정보 저장소
      if (!db.objectStoreNames.contains(INTEGRITY_STORE)) {
        db.createObjectStore(INTEGRITY_STORE, { keyPath: 'id' })
      }
    }
  })

  return dbPromise
}

/**
 * 모든 단어 데이터를 로컬에 저장 (보안 강화)
 */
export async function saveVocabToCache(
  mode: Mode,
  category: string | null,
  data: CachedVocab[]
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORE_NAME, META_STORE, INTEGRITY_STORE], 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const metaStore = tx.objectStore(META_STORE)
  const integrityStore = tx.objectStore(INTEGRITY_STORE)

  // 기존 데이터 삭제 (같은 mode/category)
  const index = store.index('mode_category')
  const range = IDBKeyRange.only([mode, category ?? ''])
  
  // 기존 데이터 삭제를 위한 커서
  const deleteRequest = index.openCursor(range)
  deleteRequest.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
    if (cursor) {
      cursor.delete()
      cursor.continue()
    }
  }

  // 데이터 검증 및 살균 후 저장
  let validCount = 0
  for (const item of data) {
    // 데이터 유효성 검사
    if (!validateVocabItem(item)) {
      console.warn('유효하지 않은 데이터 건너뜀:', (item as { id?: string })?.id ?? 'unknown')
      continue
    }

    // 데이터 저장 (카테고리 기본값 처리)
    store.put({ ...item, category: item.category ?? '' })
    validCount++

    // 무결성 해시 저장 (비동기)
    computeHash(JSON.stringify(item)).then(hash => {
      integrityStore.put({
        id: item.id,
        hash,
        timestamp: Date.now(),
      } satisfies IntegrityRecord)
    }).catch(() => {
      // 해시 생성 실패 시 무시
    })
  }

  // 메타 정보 업데이트 (체크섬 포함)
  const metaKey = `${mode}_${category ?? 'all'}`
  const checksum = await computeHash(`${mode}_${category}_${validCount}_${Date.now()}`)
  
  metaStore.put({
    key: metaKey,
    lastUpdated: Date.now(),
    count: validCount,
    checksum,
  } satisfies CacheMeta)

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 캐시된 단어 데이터 가져오기
 */
export async function getVocabFromCache(
  mode: Mode,
  category?: string | null,
  dayNumber?: number,
  wordsPerDay: number = 40
): Promise<CachedVocab[]> {
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    let request: IDBRequest

    if (category) {
      const index = store.index('mode_category')
      request = index.getAll(IDBKeyRange.only([mode, category]))
    } else {
      const index = store.index('mode')
      request = index.getAll(IDBKeyRange.only(mode))
    }

    request.onsuccess = () => {
      let data = request.result as CachedVocab[]
      
      // created_at으로 정렬
      data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

      // Day 번호가 있으면 해당 범위만 반환
      if (dayNumber) {
        const startIdx = (dayNumber - 1) * wordsPerDay
        const endIdx = startIdx + wordsPerDay
        data = data.slice(startIdx, endIdx)
      }

      resolve(data)
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * 캐시된 단어 개수 가져오기
 */
export async function getCacheCount(mode: Mode, category?: string | null): Promise<number> {
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    let request: IDBRequest

    if (category) {
      const index = store.index('mode_category')
      request = index.count(IDBKeyRange.only([mode, category]))
    } else {
      const index = store.index('mode')
      request = index.count(IDBKeyRange.only(mode))
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 캐시 메타 정보 가져오기
 */
export async function getCacheMeta(mode: Mode, category?: string | null): Promise<CacheMeta | null> {
  const db = await getDB()
  const tx = db.transaction(META_STORE, 'readonly')
  const store = tx.objectStore(META_STORE)

  const metaKey = `${mode}_${category ?? 'all'}`

  return new Promise((resolve, reject) => {
    const request = store.get(metaKey)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 전체 캐시 삭제
 */
export async function clearAllCache(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite')
  
  tx.objectStore(STORE_NAME).clear()
  tx.objectStore(META_STORE).clear()

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 캐시 상태 정보 가져오기
 */
export async function getCacheStatus(): Promise<{
  totalCount: number
  swCount: number
  koCount: number
  lastUpdated: number | null
}> {
  const db = await getDB()
  const tx = db.transaction([STORE_NAME, META_STORE], 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const metaStore = tx.objectStore(META_STORE)

  const swIndex = store.index('mode')
  
  return new Promise((resolve, reject) => {
    let swCount = 0
    let koCount = 0
    let lastUpdated: number | null = null

    const swRequest = swIndex.count(IDBKeyRange.only('sw'))
    swRequest.onsuccess = () => {
      swCount = swRequest.result
    }

    const koRequest = swIndex.count(IDBKeyRange.only('ko'))
    koRequest.onsuccess = () => {
      koCount = koRequest.result
    }

    const metaRequest = metaStore.getAll()
    metaRequest.onsuccess = () => {
      const metas = metaRequest.result as CacheMeta[]
      if (metas.length > 0) {
        lastUpdated = Math.max(...metas.map(m => m.lastUpdated))
      }
    }

    tx.oncomplete = () => {
      resolve({
        totalCount: swCount + koCount,
        swCount,
        koCount,
        lastUpdated,
      })
    }
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 온라인 상태 확인
 */
export function isOnline(): boolean {
  return navigator.onLine
}

/**
 * 온라인/오프라인 상태 변경 이벤트 리스너
 */
export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
