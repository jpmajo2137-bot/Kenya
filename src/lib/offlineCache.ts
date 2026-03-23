/**
 * 오프라인 캐시 모듈 - IndexedDB를 사용하여 단어 데이터를 로컬에서 읽기
 * 캐시된 데이터 읽기 전용 (다운로드 기능 제거됨)
 */

const DB_NAME = 'k-kiswahili-offline'
const DB_VERSION = 3
const STORE_NAME = 'vocab'
const META_STORE = 'meta'
const MEDIA_STORE = 'media'

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

let dbPromise: Promise<IDBDatabase> | null = null

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

      // 미디어 저장소
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const mediaStore = db.createObjectStore(MEDIA_STORE, { keyPath: 'url' })
        mediaStore.createIndex('type', 'type', { unique: false })
      }
    }
  })

  return dbPromise
}

/**
 * 캐시된 단어 데이터 가져오기
 */
export async function getVocabFromCache(
  mode: Mode,
  category?: string | null,
  dayNumber?: number,
  wordsPerDay: number = 40,
  posFilter?: string | null,
): Promise<CachedVocab[]> {
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    let request: IDBRequest

    if (category && !posFilter) {
      const index = store.index('mode_category')
      request = index.getAll(IDBKeyRange.only([mode, category]))
    } else {
      const index = store.index('mode')
      request = index.getAll(IDBKeyRange.only(mode))
    }

    request.onsuccess = () => {
      let data = request.result as CachedVocab[]

      if (posFilter) {
        data = data.filter((r) => (r as unknown as Record<string, unknown>).pos === posFilter)
      }
      
      data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

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
 * ID 목록으로 캐시된 단어 가져오기
 */
export async function getVocabByIds(ids: string[]): Promise<CachedVocab[]> {
  if (ids.length === 0) return []
  const db = await getDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  return new Promise((resolve, reject) => {
    const results: CachedVocab[] = []
    let pending = ids.length
    let done = false

    const finish = (value: CachedVocab[]) => {
      if (!done) {
        done = true
        resolve(value)
      }
    }

    const fail = (error: unknown) => {
      if (!done) {
        done = true
        reject(error)
      }
    }

    tx.onerror = () => fail(tx.error)

    ids.forEach((id) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const result = request.result as CachedVocab | undefined
        if (result) results.push(result)
        pending -= 1
        if (pending === 0) finish(results)
      }
      request.onerror = () => {
        pending -= 1
        if (pending === 0) finish(results)
      }
    })
  })
}

/**
 * 캐시된 단어 개수 가져오기
 */
export async function getCacheCount(
  mode: Mode,
  category?: string | null,
  posFilter?: string | null,
): Promise<number> {
  if (posFilter) {
    const data = await getVocabFromCache(mode, undefined, undefined, 40, posFilter)
    return data.length
  }

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
 * 캐시된 미디어 파일 가져오기
 */
export async function getMediaFromCache(url: string): Promise<Blob | null> {
  const db = await getDB()
  const tx = db.transaction(MEDIA_STORE, 'readonly')
  const store = tx.objectStore(MEDIA_STORE)

  return new Promise((resolve, reject) => {
    const request = store.get(url)
    request.onsuccess = () => {
      const result = request.result as { data: Blob } | undefined
      resolve(result?.data ?? null)
    }
    request.onerror = () => reject(request.error)
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
