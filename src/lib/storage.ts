import { newId } from './id'
import { createInitialSrs } from './srs'
import type {
  AppStateV1,
  AppStateV2,
  AppStateV3,
  Deck,
  PerVersionState,
  VersionKey,
  VocabItem,
  WrongNoteItem,
} from './types'
import { ALL_VERSION_KEYS } from './types'
import { encrypt, decrypt, isEncryptionSupported, generateHash, verifyHash } from './crypto'

const KEY = 'kenya-vocab.state'
const HASH_KEY = 'kenya-vocab.hash'
const ENCRYPTED_FLAG = 'kenya-vocab.encrypted'
const V2_BACKUP_KEY = 'kenya-vocab.state.v2.bak'

// 버전별 기본 단어장 이름 (state.ts와 동기 — 순환 의존을 피하려 여기 복사)
function defaultDeckNamesForVersion(key: VersionKey): string[] {
  switch (key) {
    case 'sw-ko':
    case 'ko-sw':
    case 'en-ko':
    case 'ko-en':
      return [
        '모든 단어',
        '입문',
        '초급',
        '중급',
        '고급',
        '여행',
        '비즈니스',
        '쇼핑',
        '위기탈출',
        '사전',
      ]
  }
}

function makeSeedSlice(key: VersionKey, now: number): PerVersionState {
  const decks: Deck[] = defaultDeckNamesForVersion(key).map((name, i) => ({
    id: newId(),
    name,
    createdAt: now - i,
    updatedAt: now - i,
  }))
  return { decks, items: [], wrong: [], reviewLog: [] }
}

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
      nativeLang: 'ko',
      targetLang: 'sw',
      topTab,
      bottomTab,
      quizCount: 10,
      quizSource: 'all',
    },
  }
}

/**
 * V2 → V3 마이그레이션
 * - 기존 단일 슬라이스를 settings.meaningLang에 맞는 versionKey로 옮김
 *   (sw → 'sw-ko', ko → 'ko-sw')
 * - 나머지 3개 버전은 기본 단어장만 채워서 시드
 * - V2 백업을 별도 키로 한 번만 보존
 */
function migrateV2ToV3(v2: AppStateV2): AppStateV3 {
  const now = Date.now()

  // V2 백업 (한 번만)
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(V2_BACKUP_KEY)) {
      localStorage.setItem(V2_BACKUP_KEY, JSON.stringify(v2))
    }
  } catch {
    // ignore
  }

  const meaningLang = v2.settings.meaningLang ?? 'sw'
  const nativeLang: 'sw' | 'ko' = meaningLang
  const targetLang: 'sw' | 'ko' = meaningLang === 'sw' ? 'ko' : 'sw'
  const sourceKey: VersionKey = `${nativeLang}-${targetLang}` as VersionKey

  const versions = Object.fromEntries(
    ALL_VERSION_KEYS.map((k) => [k, makeSeedSlice(k, now)]),
  ) as Record<VersionKey, PerVersionState>

  // 기존 데이터를 source 버전 슬라이스로 이동 (단어장은 기존 것 그대로)
  versions[sourceKey] = {
    decks: v2.decks ?? versions[sourceKey].decks,
    items: v2.items ?? [],
    wrong: v2.wrong ?? [],
    reviewLog: v2.reviewLog ?? [],
  }

  return {
    version: 3,
    now: v2.now ?? now,
    versions,
    settings: {
      ...v2.settings,
      nativeLang,
      targetLang,
    },
  }
}

/**
 * 각 버전 슬라이스에 기본 단어장이 누락되어 있으면 채워 줌
 */
function ensureDefaultDecksForAllVersions(state: AppStateV3): AppStateV3 {
  const now = Date.now()
  let mutated = false
  const versions = { ...state.versions }
  for (const key of ALL_VERSION_KEYS) {
    const slice = versions[key] ?? makeSeedSlice(key, now)
    const existingNames = new Set(slice.decks.map((d) => d.name))
    const missing: Deck[] = []
    for (const name of defaultDeckNamesForVersion(key)) {
      if (!existingNames.has(name)) {
        missing.push({ id: newId(), name, createdAt: now, updatedAt: now })
      }
    }
    if (missing.length > 0 || !versions[key]) {
      versions[key] = { ...slice, decks: [...slice.decks, ...missing] }
      mutated = true
    }
  }
  return mutated ? { ...state, versions } : state
}

function validateStateV3(state: unknown): state is AppStateV3 {
  if (!state || typeof state !== 'object') return false
  const s = state as Record<string, unknown>
  if (s.version !== 3) return false
  if (!s.versions || typeof s.versions !== 'object') return false
  if (!s.settings || typeof s.settings !== 'object') return false
  return true
}

function normalizeLoadedState(parsed: unknown): AppStateV3 | null {
  if (!parsed || typeof parsed !== 'object') return null
  const v = (parsed as { version?: unknown }).version
  let state: AppStateV3 | null = null
  if (v === 3 && validateStateV3(parsed)) {
    state = parsed as AppStateV3
  } else if (v === 2) {
    state = migrateV2ToV3(parsed as AppStateV2)
  } else if (v === 1) {
    state = migrateV2ToV3(migrateV1ToV2(parsed as AppStateV1))
  }
  if (state) state = ensureDefaultDecksForAllVersions(state)
  return state
}

/**
 * 상태 로드 (암호화된 데이터 지원)
 */
export async function loadStateAsync(): Promise<AppStateV3 | null> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null

    let jsonStr: string
    const isEncrypted = localStorage.getItem(ENCRYPTED_FLAG) === 'true'

    if (isEncrypted && isEncryptionSupported()) {
      jsonStr = await decrypt(raw)

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
    return normalizeLoadedState(parsed)
  } catch (error) {
    console.error('상태 로드 실패:', error)
    return null
  }
}

/**
 * 동기 로드 (기존 호환성 유지)
 */
export function loadState(): AppStateV3 | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null

    const isEncrypted = localStorage.getItem(ENCRYPTED_FLAG) === 'true'

    let jsonStr: string
    if (isEncrypted) {
      try {
        JSON.parse(raw)
        jsonStr = raw
      } catch {
        return null
      }
    } else {
      jsonStr = raw
    }

    const parsed = JSON.parse(jsonStr) as unknown
    return normalizeLoadedState(parsed)
  } catch {
    return null
  }
}

/**
 * 상태 저장 (암호화 적용)
 */
export async function saveStateAsync(state: AppStateV3): Promise<void> {
  try {
    const jsonStr = JSON.stringify(state)

    if (isEncryptionSupported()) {
      const encrypted = await encrypt(jsonStr)
      const hash = await generateHash(jsonStr)

      localStorage.setItem(KEY, encrypted)
      localStorage.setItem(HASH_KEY, hash)
      localStorage.setItem(ENCRYPTED_FLAG, 'true')
    } else {
      localStorage.setItem(KEY, jsonStr)
      localStorage.setItem(ENCRYPTED_FLAG, 'false')
    }
  } catch (error) {
    console.error('상태 저장 실패:', error)
  }
}

/**
 * 동기 저장 (기존 호환성 유지 - 비동기 암호화 백그라운드)
 */
export function saveState(state: AppStateV3) {
  try {
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
    localStorage.removeItem(V2_BACKUP_KEY)
  } catch {
    // ignore
  }
}
