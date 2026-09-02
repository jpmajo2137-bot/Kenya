import { applyReview, createInitialSrs } from '../lib/srs'
import { newId } from '../lib/id'
import type {
  AppSettings,
  AppStateV3,
  Deck,
  Grade,
  PerVersionState,
  VersionKey,
  VocabItem,
} from '../lib/types'
import { ALL_VERSION_KEYS, currentVersionKey } from '../lib/types'

export const defaultSettings: AppSettings = {
  dueOnly: true,
  showEnglish: true,
  meaningLang: 'ko',
  nativeLang: 'ko',
  targetLang: 'en',
  topTab: 'home',
  bottomTab: 'wordbook',
  quizCount: 10,
  quizSource: { cloud: '모든 단어' },
}

/** 버전별 기본 단어장 이름 */
export function defaultDeckNamesForVersion(key: VersionKey): string[] {
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

export function createSeedSliceForVersion(key: VersionKey, now = Date.now()): PerVersionState {
  const decks: Deck[] = defaultDeckNamesForVersion(key).map((name, i) => ({
    id: newId(),
    name,
    createdAt: now - i,
    updatedAt: now - i,
  }))
  return { decks, items: [], wrong: [], reviewLog: [] }
}

export function createSeedState(now = Date.now()): AppStateV3 {
  const versions = Object.fromEntries(
    ALL_VERSION_KEYS.map((k) => [k, createSeedSliceForVersion(k, now)]),
  ) as Record<VersionKey, PerVersionState>

  return {
    version: 3,
    now,
    versions,
    settings: defaultSettings,
  }
}

/** 활성 버전 슬라이스 가져오기 (없으면 시드해서 채워 반환) */
export function getActiveSlice(state: AppStateV3): PerVersionState {
  const key = currentVersionKey(state.settings)
  return state.versions[key] ?? createSeedSliceForVersion(key, state.now)
}

export type Action =
  | { type: 'deckAdd'; name: string }
  | { type: 'deckRename'; id: string; name: string }
  | { type: 'deckDelete'; id: string }
  | { type: 'add'; item: Omit<VocabItem, 'id' | 'createdAt' | 'updatedAt' | 'srs'> }
  | { type: 'update'; id: string; patch: Partial<Omit<VocabItem, 'id' | 'createdAt' | 'srs'>> }
  | { type: 'delete'; id: string }
  | { type: 'review'; id: string; grade: Grade }
  | { type: 'quizAnswer'; id: string; correct: boolean }
  | { type: 'wrongAdd'; id: string }
  | { type: 'wrongClear' }
  | { type: 'wrongRemove'; id: string }
  | { type: 'settings'; patch: Partial<AppSettings> }
  | { type: 'localClearForCloudAllWords'; keepDeckId?: string }
  | { type: 'resetCurrentVersion' }
  | { type: 'hydrate'; state: AppStateV3 }

/** 활성 슬라이스에 update를 적용하고 새 state를 반환 */
function withSlice(
  state: AppStateV3,
  now: number,
  updater: (slice: PerVersionState) => PerVersionState,
): AppStateV3 {
  const key = currentVersionKey(state.settings)
  const current = state.versions[key] ?? createSeedSliceForVersion(key, now)
  const next = updater(current)
  return {
    ...state,
    now,
    versions: { ...state.versions, [key]: next },
  }
}

export function reducer(state: AppStateV3, action: Action): AppStateV3 {
  const now = Date.now()

  switch (action.type) {
    case 'hydrate': {
      return action.state
    }
    case 'deckAdd': {
      const name = action.name.trim()
      if (!name) return state
      const deck: Deck = { id: newId(), name, createdAt: now, updatedAt: now }
      return withSlice(state, now, (s) => ({ ...s, decks: [deck, ...s.decks] }))
    }
    case 'deckRename': {
      const name = action.name.trim()
      if (!name) return state
      return withSlice(state, now, (s) => ({
        ...s,
        decks: s.decks.map((d) => (d.id === action.id ? { ...d, name, updatedAt: now } : d)),
      }))
    }
    case 'deckDelete': {
      const slice = getActiveSlice(state)
      const used = slice.items.some((x) => x.deckId === action.id)
      if (used) return state
      return withSlice(state, now, (s) => ({
        ...s,
        decks: s.decks.filter((d) => d.id !== action.id),
      }))
    }
    case 'add': {
      const newItem: VocabItem = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        srs: createInitialSrs(now),
        ...action.item,
      }
      return withSlice(state, now, (s) => ({ ...s, items: [newItem, ...s.items] }))
    }
    case 'update': {
      return withSlice(state, now, (s) => ({
        ...s,
        items: s.items.map((x) =>
          x.id === action.id ? { ...x, ...action.patch, updatedAt: now } : x,
        ),
      }))
    }
    case 'delete': {
      return withSlice(state, now, (s) => ({
        ...s,
        items: s.items.filter((x) => x.id !== action.id),
        wrong: s.wrong.filter((w) => w.id !== action.id),
      }))
    }
    case 'review': {
      return withSlice(state, now, (s) => ({
        ...s,
        items: s.items.map((x) =>
          x.id === action.id
            ? { ...x, srs: applyReview(x.srs, action.grade, now), updatedAt: now }
            : x,
        ),
        reviewLog: [...s.reviewLog, { id: action.id, at: now, grade: action.grade }].slice(-1000),
      }))
    }
    case 'quizAnswer': {
      const grade: Grade = action.correct ? 'good' : 'again'
      return withSlice(state, now, (s) => {
        const items = s.items.map((x) =>
          x.id === action.id
            ? { ...x, srs: applyReview(x.srs, grade, now), updatedAt: now }
            : x,
        )
        const reviewLog = [...s.reviewLog, { id: action.id, at: now, grade }].slice(-1000)
        let wrong = s.wrong
        if (!action.correct) {
          const existing = wrong.find((w) => w.id === action.id)
          if (existing) {
            wrong = wrong.map((w) =>
              w.id === action.id ? { ...w, wrongCount: w.wrongCount + 1, lastWrongAt: now } : w,
            )
          } else {
            wrong = [{ id: action.id, wrongCount: 1, lastWrongAt: now }, ...wrong]
          }
        }
        return { ...s, items, reviewLog, wrong }
      })
    }
    case 'wrongAdd': {
      return withSlice(state, now, (s) => {
        const existing = s.wrong.find((w) => w.id === action.id)
        if (existing) {
          return {
            ...s,
            wrong: s.wrong.map((w) =>
              w.id === action.id ? { ...w, wrongCount: w.wrongCount + 1, lastWrongAt: now } : w,
            ),
          }
        }
        return { ...s, wrong: [{ id: action.id, wrongCount: 1, lastWrongAt: now }, ...s.wrong] }
      })
    }
    case 'wrongClear': {
      return withSlice(state, now, (s) => ({ ...s, wrong: [] }))
    }
    case 'wrongRemove': {
      return withSlice(state, now, (s) => ({
        ...s,
        wrong: s.wrong.filter((w) => w.id !== action.id),
      }))
    }
    case 'settings': {
      // nativeLang 변경 시 해당 모국어로 학습 가능한 첫 학습 언어로 보정
      const nextSettings = { ...state.settings, ...action.patch }
      // meaningLang ↔ nativeLang 동기화 (legacy 코드 호환)
      if (action.patch.nativeLang !== undefined && (action.patch.nativeLang === 'sw' || action.patch.nativeLang === 'ko')) {
        nextSettings.meaningLang = action.patch.nativeLang
      } else if (action.patch.meaningLang !== undefined) {
        nextSettings.nativeLang = action.patch.meaningLang
      }
      return { ...state, now, settings: nextSettings }
    }
    case 'localClearForCloudAllWords': {
      return withSlice(state, now, (s) => {
        const fallbackName = defaultDeckNamesForVersion(currentVersionKey(state.settings))[0]
        const keep =
          (action.keepDeckId ? s.decks.find((d) => d.id === action.keepDeckId) : null) ??
          s.decks.find((d) => d.name === fallbackName) ??
          ({ id: newId(), name: fallbackName, createdAt: now, updatedAt: now } satisfies Deck)
        return {
          decks: [{ ...keep, updatedAt: now }],
          items: [],
          wrong: [],
          reviewLog: [],
        }
      })
    }
    case 'resetCurrentVersion': {
      const key = currentVersionKey(state.settings)
      return {
        ...state,
        now,
        versions: { ...state.versions, [key]: createSeedSliceForVersion(key, now) },
      }
    }
  }
}
