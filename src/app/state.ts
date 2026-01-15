import { applyReview, createInitialSrs } from '../lib/srs'
import { newId } from '../lib/id'
import type { AppSettings, AppStateV2, Deck, Grade, VocabItem } from '../lib/types'

export const defaultSettings: AppSettings = {
  dueOnly: true,
  showEnglish: true,
  meaningLang: 'sw', // 기본 언어: 스와힐리어
  topTab: 'home',
  bottomTab: 'wordbook',
  quizCount: 10,
  quizSource: { cloud: '모든 단어' },
}

export function createSeedState(now = Date.now()): AppStateV2 {
  // 기본 단어장 목록
  const deckNames = [
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

  const decks: Deck[] = deckNames.map((name, i) => ({
    id: newId(),
    name,
    createdAt: now - i, // 순서 유지를 위해 약간씩 다른 시간
    updatedAt: now - i,
  }))

  // 초기 시드는 비워둔다
  const items: VocabItem[] = []

  return {
    version: 2,
    now,
    decks,
    items,
    wrong: [],
    reviewLog: [],
    settings: defaultSettings,
  }
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
  | { type: 'wrongClear' }
  | { type: 'wrongRemove'; id: string }
  | { type: 'settings'; patch: Partial<AppSettings> }
  | { type: 'localClearForCloudAllWords'; keepDeckId?: string }
  | { type: 'hydrate'; state: AppStateV2 }

export function reducer(state: AppStateV2, action: Action): AppStateV2 {
  const now = Date.now()

  switch (action.type) {
    case 'hydrate': {
      return action.state
    }
    case 'deckAdd': {
      const name = action.name.trim()
      if (!name) return state
      const deck: Deck = { id: newId(), name, createdAt: now, updatedAt: now }
      return { ...state, now, decks: [deck, ...state.decks] }
    }
    case 'deckRename': {
      const name = action.name.trim()
      if (!name) return state
      return {
        ...state,
        now,
        decks: state.decks.map((d) => (d.id === action.id ? { ...d, name, updatedAt: now } : d)),
      }
    }
    case 'deckDelete': {
      // 단어가 연결된 단어장은 삭제 방지(안전)
      const used = state.items.some((x) => x.deckId === action.id)
      if (used) return state
      return { ...state, now, decks: state.decks.filter((d) => d.id !== action.id) }
    }
    case 'add': {
      const newItem: VocabItem = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        srs: createInitialSrs(now),
        ...action.item,
      }
      return { ...state, now, items: [newItem, ...state.items] }
    }
    case 'update': {
      return {
        ...state,
        now,
        items: state.items.map((x) =>
          x.id === action.id ? { ...x, ...action.patch, updatedAt: now } : x,
        ),
      }
    }
    case 'delete': {
      return {
        ...state,
        now,
        items: state.items.filter((x) => x.id !== action.id),
        wrong: state.wrong.filter((w) => w.id !== action.id),
      }
    }
    case 'review': {
      const items = state.items.map((x) => {
        if (x.id !== action.id) return x
        return { ...x, srs: applyReview(x.srs, action.grade, now), updatedAt: now }
      })
      const reviewLog = [
        ...state.reviewLog,
        { id: action.id, at: now, grade: action.grade },
      ].slice(-1000)
      return { ...state, now, items, reviewLog }
    }
    case 'quizAnswer': {
      const grade: Grade = action.correct ? 'good' : 'again'
      const items = state.items.map((x) => {
        if (x.id !== action.id) return x
        return { ...x, srs: applyReview(x.srs, grade, now), updatedAt: now }
      })
      const reviewLog = [...state.reviewLog, { id: action.id, at: now, grade }].slice(-1000)

      let wrong = state.wrong
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
      return { ...state, now, items, reviewLog, wrong }
    }
    case 'wrongClear': {
      return { ...state, now, wrong: [] }
    }
    case 'wrongRemove': {
      return { ...state, now, wrong: state.wrong.filter((w) => w.id !== action.id) }
    }
    case 'settings': {
      return { ...state, now, settings: { ...state.settings, ...action.patch } }
    }
    case 'localClearForCloudAllWords': {
      const keep =
        (action.keepDeckId ? state.decks.find((d) => d.id === action.keepDeckId) : null) ??
        state.decks.find((d) => d.name === '모든 단어') ??
        ({ id: newId(), name: '모든 단어', createdAt: now, updatedAt: now } satisfies Deck)

      return {
        ...state,
        now,
        decks: [{ ...keep, updatedAt: now }],
        items: [],
        wrong: [],
        reviewLog: [],
      }
    }
  }
}


