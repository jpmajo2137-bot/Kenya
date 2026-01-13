import { newId } from './id'
import { createInitialSrs } from './srs'
import type { AppStateV1, AppStateV2, Deck, VocabItem, WrongNoteItem } from './types'
import { encrypt, decrypt, isEncryptionSupported, generateHash, verifyHash } from './crypto'

const KEY = 'kenya-vocab.state'
const HASH_KEY = 'kenya-vocab.hash'
const ENCRYPTED_FLAG = 'kenya-vocab.encrypted'

function migrateV1ToV2(v1: AppStateV1): AppStateV2 {
  const now = Date.now()

  const defaultDeck: Deck = {
    id: newId(),
    name: '모든 단어',
    createdAt: now,
    updatedAt: now,
  }

  const items: VocabItem[] = v1.items.map((x) => ({
    ...x,
    deckId: defaultDeck.id,
    srs: x.srs ?? createInitialSrs(now),
  }))

  const wrong: WrongNoteItem[] = []

  const bottomTab =
    v1.settings.lastTab === 'wordbook'
      ? 'wordbook'
      : v1.settings.lastTab === 'study'
        ? 'quiz'
        : 'wordbook'

  const topTab: 'home' | 'settings' =
    v1.settings.lastTab === 'settings' ? 'settings' : 'home'

  return {
    version: 2,
    now,
    decks: [defaultDeck],
    items,
    wrong,
    reviewLog: v1.reviewLog ?? [],
    settings: {
      dueOnly: v1.settings.dueOnly ?? true,
      showEnglish: v1.settings.showEnglish ?? true,
      meaningLang: 'ko',
      topTab,
      bottomTab,
      quizCount: 10,
      quizSource: 'all',
    },
  }
}

// 기본 단어장 목록 (새 사용자 + 기존 사용자 마이그레이션용)
const DEFAULT_DECK_NAMES = [
  '모든 단어',
  '입문',
  '초급',
  '중급',
  '고급',
  '여행',
  '비즈니스',
  '쇼핑',
  '위기탈출',
]

function ensureDefaultDecks(state: AppStateV2): AppStateV2 {
  const now = Date.now()
  const existingNames = new Set(state.decks.map((d) => d.name))
  const missingDecks: Deck[] = []

  for (const name of DEFAULT_DECK_NAMES) {
    if (!existingNames.has(name)) {
      missingDecks.push({
        id: newId(),
        name,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  if (missingDecks.length === 0) return state

  return {
    ...state,
    decks: [...state.decks, ...missingDecks],
  }
}

/**
 * 데이터 유효성 검사
 */
function validateState(state: unknown): state is AppStateV2 {
  if (!state || typeof state !== 'object') return false
  const s = state as Record<string, unknown>
  
  // 필수 필드 검사
  if (s.version !== 2) return false
  if (!Array.isArray(s.decks)) return false
  if (!Array.isArray(s.items)) return false
  if (typeof s.settings !== 'object') return false
  
  // 데이터 타입 검사
  for (const deck of s.decks as unknown[]) {
    if (!deck || typeof deck !== 'object') return false
    const d = deck as Record<string, unknown>
    if (typeof d.id !== 'string') return false
    if (typeof d.name !== 'string') return false
  }
  
  return true
}

/**
 * 상태 로드 (암호화된 데이터 지원)
 */
export async function loadStateAsync(): Promise<AppStateV2 | null> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null

    let jsonStr: string
    const isEncrypted = localStorage.getItem(ENCRYPTED_FLAG) === 'true'

    if (isEncrypted && isEncryptionSupported()) {
      // 암호화된 데이터 복호화
      jsonStr = await decrypt(raw)
      
      // 무결성 검증
      const storedHash = localStorage.getItem(HASH_KEY)
      if (storedHash) {
        const isValid = await verifyHash(jsonStr, storedHash)
        if (!isValid) {
          console.warn('데이터 무결성 검증 실패 - 데이터가 손상되었을 수 있습니다.')
        }
      }
    } else {
      jsonStr = raw
    }

    const parsed = JSON.parse(jsonStr) as unknown
    
    // 데이터 유효성 검사
    if (!parsed || typeof parsed !== 'object') return null
    
    const v = (parsed as { version?: unknown }).version
    let state: AppStateV2 | null = null
    
    if (v === 2 && validateState(parsed)) {
      state = parsed
    } else if (v === 1) {
      state = migrateV1ToV2(parsed as AppStateV1)
    }
    
    // 기본 단어장이 없으면 추가
    if (state) state = ensureDefaultDecks(state)
    
    return state
  } catch (error) {
    console.error('상태 로드 실패:', error)
    return null
  }
}

/**
 * 동기 로드 (기존 호환성 유지)
 */
export function loadState(): AppStateV2 | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    
    const isEncrypted = localStorage.getItem(ENCRYPTED_FLAG) === 'true'
    
    let jsonStr: string
    if (isEncrypted) {
      // 암호화된 데이터는 비동기 로드 필요
      // 여기서는 암호화되지 않은 것으로 시도
      try {
        JSON.parse(raw)
        jsonStr = raw
      } catch {
        // 암호화된 데이터 - loadStateAsync 사용 필요
        return null
      }
    } else {
      jsonStr = raw
    }

    const parsed = JSON.parse(jsonStr) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    
    const v = (parsed as { version?: unknown }).version
    let state: AppStateV2 | null = null
    
    if (v === 2) state = parsed as AppStateV2
    else if (v === 1) state = migrateV1ToV2(parsed as AppStateV1)
    
    if (state) state = ensureDefaultDecks(state)
    
    return state
  } catch {
    return null
  }
}

/**
 * 상태 저장 (암호화 적용)
 */
export async function saveStateAsync(state: AppStateV2): Promise<void> {
  try {
    const jsonStr = JSON.stringify(state)
    
    if (isEncryptionSupported()) {
      // 암호화하여 저장
      const encrypted = await encrypt(jsonStr)
      const hash = await generateHash(jsonStr)
      
      localStorage.setItem(KEY, encrypted)
      localStorage.setItem(HASH_KEY, hash)
      localStorage.setItem(ENCRYPTED_FLAG, 'true')
    } else {
      // 암호화 불가 시 일반 저장
      localStorage.setItem(KEY, jsonStr)
      localStorage.setItem(ENCRYPTED_FLAG, 'false')
    }
  } catch (error) {
    console.error('상태 저장 실패:', error)
  }
}

/**
 * 동기 저장 (기존 호환성 유지 - 암호화 없음)
 */
export function saveState(state: AppStateV2) {
  try {
    // 비동기 암호화 저장 시작 (백그라운드)
    void saveStateAsync(state)
  } catch {
    // ignore
  }
}

/**
 * 저장된 데이터 완전 삭제
 */
export function clearStoredData(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(HASH_KEY)
    localStorage.removeItem(ENCRYPTED_FLAG)
    localStorage.removeItem('kenya-vocab.key')
  } catch {
    // ignore
  }
}
