export type Grade = 'again' | 'hard' | 'good'

export type Srs = {
  /** 다음 복습 예정 시각(ms since epoch) */
  dueAt: number
  /** 다음 간격(일) */
  intervalDays: number
  /** 난이도 계수 */
  ease: number
  correctStreak: number
  totalReviews: number
  lastReviewedAt?: number
}

export type VocabItem = {
  id: string
  deckId: string
  sw: string
  ko: string
  en?: string
  pos?: string
  tags: string[]
  example?: string
  exampleKo?: string
  exampleEn?: string
  note?: string
  createdAt: number
  updatedAt: number
  srs: Srs
}

export type ReviewLogItem = {
  id: string
  at: number
  grade: Grade
}

export type Deck = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type WrongNoteItem = {
  id: string
  wrongCount: number
  lastWrongAt: number
}

/** 사용 가능한 모국어/학습 언어 */
export type NativeLang = 'sw' | 'ko' | 'en'
export type TargetLang = 'sw' | 'ko' | 'en'

/** 활성 사용자 버전 키 (모국어-학습언어). 데이터가 있는 4가지 조합만 허용 */
export type VersionKey = 'sw-ko' | 'ko-sw' | 'en-ko' | 'ko-en'

export const ALL_VERSION_KEYS: VersionKey[] = ['sw-ko', 'ko-sw', 'en-ko', 'ko-en']

/** 모국어별로 학습 가능한 언어 목록 */
export const LEARNABLE_BY_NATIVE: Record<NativeLang, TargetLang[]> = {
  ko: ['sw', 'en'],
  en: ['ko'],
  sw: ['ko'],
}

export type AppSettings = {
  /** 학습 화면에서 "기한 도래(due)" 카드만 볼지 */
  dueOnly: boolean
  /** 단어장 리스트에서 영어(en)도 표시할지 */
  showEnglish: boolean
  /**
   * 사용자 언어 모드 (legacy). nativeLang === 'sw' | 'ko'일 때만 의미가 있음.
   * 새 화면은 nativeLang/targetLang을 직접 사용하세요.
   */
  meaningLang: 'sw' | 'ko'

  /** 사용자의 모국어 (UI 언어 = 모국어) */
  nativeLang: NativeLang
  /** 사용자가 학습 중인 언어 */
  targetLang: TargetLang

  /** 상단 탭 */
  topTab: 'home' | 'hangeul' | 'settings'
  /** 하단 탭 */
  bottomTab: 'wordbook' | 'quiz' | 'wrong' | 'dictionary'

  /** 퀴즈 설정 기본값 */
  quizCount: 5 | 10 | 20 | 50
  quizSource: 'all' | 'wrong' | { deckId: string } | { cloud: string }
}

export type AppStateV1 = {
  version: 1
  items: Omit<VocabItem, 'deckId'>[]
  reviewLog: ReviewLogItem[]
  settings: {
    dueOnly: boolean
    showEnglish: boolean
    lastTab: 'wordbook' | 'study' | 'stats' | 'settings'
  }
}

export type AppStateV2 = {
  version: 2
  /** 렌더 중 Date.now 호출을 피하기 위한 "마지막 액션 시각" */
  now: number
  decks: Deck[]
  items: VocabItem[]
  wrong: WrongNoteItem[]
  reviewLog: ReviewLogItem[]
  settings: AppSettings
}

/** 사용자 버전별 학습 슬라이스 (단어장/단어/오답/리뷰 로그) */
export type PerVersionState = {
  decks: Deck[]
  items: VocabItem[]
  wrong: WrongNoteItem[]
  reviewLog: ReviewLogItem[]
}

/**
 * V3: 사용자 버전 4종(sw-ko, ko-sw, en-ko, ko-en)을 분리 저장.
 * 기존 V2 데이터는 settings.meaningLang에 따라 versions['sw-ko'] 또는
 * versions['ko-sw']로 마이그레이션됩니다.
 */
export type AppStateV3 = {
  version: 3
  now: number
  versions: Record<VersionKey, PerVersionState>
  settings: AppSettings
}

/** 현재 활성 버전 키 계산 */
export function currentVersionKey(settings: Pick<AppSettings, 'nativeLang' | 'targetLang'>): VersionKey {
  return `${settings.nativeLang}-${settings.targetLang}` as VersionKey
}


