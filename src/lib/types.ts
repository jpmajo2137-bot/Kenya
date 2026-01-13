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

export type AppSettings = {
  /** 학습 화면에서 “기한 도래(due)” 카드만 볼지 */
  dueOnly: boolean
  /** 단어장 리스트에서 영어(en)도 표시할지 */
  showEnglish: boolean
  /** 사용자 언어 모드: sw=스와힐리어 사람용(뜻:영어), ko=한국 사람용(뜻:한국어) */
  meaningLang: 'sw' | 'ko'

  /** 상단 탭 */
  topTab: 'home' | 'settings'
  /** 하단 탭 */
  bottomTab: 'wordbook' | 'quiz' | 'wrong'

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
  /** 렌더 중 Date.now 호출을 피하기 위한 “마지막 액션 시각” */
  now: number
  decks: Deck[]
  items: VocabItem[]
  wrong: WrongNoteItem[]
  reviewLog: ReviewLogItem[]
  settings: AppSettings
}


