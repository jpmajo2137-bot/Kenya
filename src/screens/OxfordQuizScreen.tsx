import { useEffect, useMemo, useState, useCallback } from 'react'
import type { Action } from '../app/state'
import type { Deck, NativeLang, TargetLang, VocabItem, WrongNoteItem } from '../lib/types'
import { Button } from '../components/Button'
import { CorrectedAudioBtn } from '../components/CorrectedAudioBtn'
import {
  PREFER_CLIENT_KO_TTS_WORDS,
  WORD_DISPLAY_OVERRIDE,
  applyEnOverride,
  applyKoOverride,
} from '../lib/displayOverrides'
import { cn } from '../components/cn'
import { t, type Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { isKoEnOxford, loadOxfordKoEnAll } from '../lib/oxfordApi'
import { getOxfordFromCache, isOnline, onOnlineStatusChange } from '../lib/offlineCache'
import {
  WRONG_ANSWERS_UPDATED_EVENT,
  addToWrongAnswers,
  removeFromWrongAnswers,
  getWrongAnswerIds,
} from './FlashcardScreen'
import {
  hideBannerAd,
  resumeBannerAd,
  setLearningSessionActive,
  canAccessQuiz,
  showRewardedAd,
  getQuizAccessRemainingTime,
  maybeShowInterstitialAtBreakpoint,
} from '../lib/admob'
import { romanizeKoreanText } from '../lib/koreanRomanization'
import type { OxfordRow } from './OxfordCloudScreen'
import {
  parseOxfordFilter,
  getOxfordWordsByTopic,
  getOrderedOxfordWords,
  dedupRowsByKoreanMeaning,
  dedupRowsByEnglishWord,
} from '../lib/oxfordFilterUtils'

// 퀴즈 소스로 노출되는 모든 카테고리.
// `key` 는 source 식별자(드롭다운 value 의 'cloud_<key>' 부분이자 cloudPool 필터의 입력),
// 라벨이 없는 prefix-필터(classified:/pos:/ordered:) 인 경우 그대로 source key 로 쓴다.
type CategoryDef = {
  key: string // 예: '입문', 'classified:음식/음료', 'pos:noun', 'ordered:숫자1-50'
  label: Record<Lang, string>
}

const CATEGORIES: CategoryDef[] = [
  // 난이도
  { key: '입문', label: { sw: 'Utangulizi', ko: '입문', en: 'Beginner' } },
  { key: '초급', label: { sw: 'Mwanzo', ko: '초급', en: 'Elementary' } },
  { key: '중급', label: { sw: 'Kati', ko: '중급', en: 'Intermediate' } },
  { key: '고급', label: { sw: 'Juu', ko: '고급', en: 'Advanced' } },
  // 상황
  { key: 'classified:일상생활', label: { sw: 'Maisha ya Kila Siku', ko: '일상생활', en: 'Daily Life' } },
  { key: '여행', label: { sw: 'Safari', ko: '여행', en: 'Travel' } },
  { key: '비즈니스', label: { sw: 'Biashara', ko: '비즈니스', en: 'Business' } },
  { key: '쇼핑', label: { sw: 'Ununuzi', ko: '쇼핑', en: 'Shopping' } },
  { key: '위기탈출', label: { sw: 'Dharura', ko: '위기탈출', en: 'Emergency' } },
  // 주제
  { key: 'ordered:숫자1-50', label: { sw: 'Namba', ko: '숫자', en: 'Numbers' } },
  { key: 'classified:숫자/수량', label: { sw: 'Namba / Kiasi', ko: '숫자/수량', en: 'Numbers / Quantity' } },
  { key: 'classified:음식/음료', label: { sw: 'Chakula/Vinywaji', ko: '음식/음료', en: 'Food/Drinks' } },
  { key: 'classified:가족/관계', label: { sw: 'Familia/Uhusiano', ko: '가족/관계', en: 'Family/Relations' } },
  { key: 'classified:자연/동물', label: { sw: 'Asili/Wanyama', ko: '자연/동물', en: 'Nature/Animals' } },
  { key: 'classified:집/생활용품', label: { sw: 'Nyumba/Vifaa', ko: '집/생활용품', en: 'Home/Household' } },
  { key: 'classified:인사/기본표현', label: { sw: 'Salamu', ko: '인사', en: 'Greetings' } },
  { key: 'classified:신체/건강', label: { sw: 'Mwili/Afya', ko: '신체/건강', en: 'Body/Health' } },
  { key: 'classified:시간/날짜', label: { sw: 'Wakati/Tarehe', ko: '시간/날짜', en: 'Time/Date' } },
  { key: 'classified:색상/외모', label: { sw: 'Rangi/Sura', ko: '색상/외모', en: 'Colors/Appearance' } },
  { key: 'classified:교통/이동', label: { sw: 'Usafiri/Msogeo', ko: '교통/이동', en: 'Transport' } },
  // 품사
  { key: 'pos:noun', label: { sw: 'Nomino', ko: '명사', en: 'Noun' } },
  { key: 'pos:verb', label: { sw: 'Kitenzi', ko: '동사', en: 'Verb' } },
  { key: 'pos:adjective', label: { sw: 'Kivumishi', ko: '형용사', en: 'Adjective' } },
  { key: 'pos:adverb', label: { sw: 'Kielezi', ko: '부사', en: 'Adverb' } },
]
const CAT_KEY_SET = new Set<string>(CATEGORIES.map((c) => c.key))

const WORDS_LABEL: Record<Lang, string> = { sw: 'maneno', ko: '개 단어', en: 'words' }
const ALL_WORDS_LABEL: Record<Lang, string> = {
  sw: 'Maneno Yote',
  ko: '모든 단어',
  en: 'All Words',
}
const LOADING_MSG: Record<Lang, string> = {
  sw: 'Inapakia maneno...',
  ko: '단어 불러오는 중...',
  en: 'Loading words...',
}
const NO_WORDS_MSG: Record<Lang, string> = {
  sw: 'Hakuna maneno katika eneo lililochaguliwa.',
  ko: '선택한 범위에 단어가 없어요.',
  en: 'No words in the selected source.',
}
const START_QUIZ_LABEL: Record<Lang, string> = {
  sw: '▶ ANZA KUIS',
  ko: '▶ 퀴즈 시작',
  en: '▶ START QUIZ',
}

type Source =
  | 'all'
  | 'wrong'
  | { cloud: string }
  | { deckId: string }

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** VocabItem (Oxford 사전 저장) → OxfordRow 호환 형태로 매핑.
 *  word 슬롯에 영어, korean_meaning 슬롯에 한국어를 항상 채워서, 호출부의
 *  koreanIsTarget 분기와 자연스럽게 호환되도록 한다. */
function vocabItemToOxfordRow(item: VocabItem): OxfordRow {
  return {
    id: item.id,
    word: item.en ?? item.sw ?? '',
    korean_meaning: item.ko ?? '',
    level: null,
    pos: item.pos ?? null,
    english_example: item.exampleEn ?? null,
    korean_example: item.exampleKo ?? null,
    word_audio_url: null,
    meaning_audio_url: null,
    english_example_audio_url: null,
    korean_example_audio_url: null,
    image_url: null,
    order_index: null,
    category: item.tags?.[0] ?? null,
    difficulty: null,
    word_pron_ko: null,
    created_at: new Date(item.createdAt ?? Date.now()).toISOString(),
  }
}

export function OxfordQuizScreen({
  decks,
  items,
  wrong,
  quizCount,
  quizSource,
  dispatch,
  lang,
  nativeLang,
  targetLang,
}: {
  decks: Deck[]
  items: VocabItem[]
  wrong: WrongNoteItem[]
  quizCount: 5 | 10 | 20 | 50
  quizSource?: Source
  dispatch: (a: Action) => void
  lang: Lang
  nativeLang: NativeLang
  targetLang: TargetLang
}) {
  void nativeLang
  const koreanIsTarget = targetLang === 'ko'
  // Oxford 의 wrong-note key (FlashcardScreen 와 동일 매핑)
  const wrongMode: 'sw' | 'ko' = koreanIsTarget ? 'sw' : 'ko'

  const [phase, setPhaseState] = useState<'setup' | 'play' | 'result'>('setup')
  const [count, setCount] = useState<5 | 10 | 20 | 50>(quizCount)
  // SW-KO 와 공유하는 quizSource 의 cloud 카테고리 키가 string 으로 타입화돼 있어 안전 변환
  const [source, setSource] = useState<Source>(() => {
    if (!quizSource) return 'all'
    if (quizSource === 'all' || quizSource === 'wrong') return quizSource
    if (typeof quizSource === 'object' && 'cloud' in quizSource) {
      const k = quizSource.cloud as string
      if (CAT_KEY_SET.has(k)) return { cloud: k }
      return 'all'
    }
    if (typeof quizSource === 'object' && 'deckId' in quizSource) {
      return { deckId: quizSource.deckId }
    }
    return 'all'
  })

  // 전체 Oxford 단어 (보기/wrong 매칭용 - 한 번만 로딩)
  const [allOxfordWords, setAllOxfordWords] = useState<OxfordRow[]>([])
  const [allOxfordLoading, setAllOxfordLoading] = useState(true)

  const [online, setOnline] = useState(isOnline())
  useEffect(() => onOnlineStatusChange(setOnline), [])

  // 오답노트 변경 이벤트 수신 → wrong source 재집계 트리거
  const [wrongVersion, setWrongVersion] = useState(0)
  useEffect(() => {
    const handle = () => setWrongVersion((v) => v + 1)
    window.addEventListener(WRONG_ANSWERS_UPDATED_EVENT, handle)
    return () => window.removeEventListener(WRONG_ANSWERS_UPDATED_EVENT, handle)
  }, [])

  // 광고 관련 상태 (SW-KO 와 동일)
  const [showAdModal, setShowAdModal] = useState(false)
  const [adLoading, setAdLoading] = useState(false)
  const [quizAccessRemaining, setQuizAccessRemaining] = useState(getQuizAccessRemainingTime())

  // 남은 시간 업데이트 (1분마다)
  useEffect(() => {
    const updateRemaining = () => setQuizAccessRemaining(getQuizAccessRemainingTime())
    updateRemaining()
    const interval = setInterval(updateRemaining, 60000)
    return () => clearInterval(interval)
  }, [])

  // 페이즈 전환 시 history.pushState (SW-KO 와 동일한 뒤로가기 처리)
  const setPhase = useCallback((newPhase: 'setup' | 'play' | 'result') => {
    if (newPhase === 'play' || newPhase === 'result') {
      window.history.pushState({ quizPhase: newPhase }, '')
    }
    setPhaseState(newPhase)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      // SW-KO 와 동일: 광고 모달이 열려있으면 모달만 닫기
      if (showAdModal) {
        setShowAdModal(false)
        return
      }
      setPhaseState((cur) => (cur === 'play' || cur === 'result' ? 'setup' : cur))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [showAdModal])

  // 플레이 중에는 배너 광고 숨기고 학습 세션 활성화 (SW-KO 와 동일)
  useEffect(() => {
    if (phase === 'play') {
      hideBannerAd('quiz-play').catch(() => {})
      setLearningSessionActive(true, 'quiz-play')
    } else {
      resumeBannerAd('quiz-play').catch(() => {})
      setLearningSessionActive(false, 'quiz-play')
    }
  }, [phase])
  useEffect(() => {
    return () => {
      resumeBannerAd('quiz-play').catch(() => {})
      setLearningSessionActive(false, 'quiz-play')
    }
  }, [])

  // 퀴즈 결과 화면 진입 → 자연스러운 휴식 시점 → 전면 광고 시도 (SW-KO 와 동일)
  useEffect(() => {
    if (phase !== 'result') return
    const tid = setTimeout(() => {
      maybeShowInterstitialAtBreakpoint()
    }, 700)
    return () => clearTimeout(tid)
  }, [phase])

  // 전체 Oxford 단어 페치 (한 번만)
  useEffect(() => {
    let cancelled = false
    const fetchAll = async () => {
      setAllOxfordLoading(true)
      try {
        if (isKoEnOxford(targetLang)) {
          const all = await loadOxfordKoEnAll()
          if (!cancelled) setAllOxfordWords(all)
        } else if (online && supabase) {
          const collected: OxfordRow[] = []
          const pageSize = 1000
          let page = 0
          let more = true
          while (more) {
            if (cancelled) return
            const from = page * pageSize
            const to = from + pageSize - 1
            const { data } = await supabase
              .from('oxford_vocab')
              .select('*')
              .range(from, to)
            if (data && data.length > 0) {
              collected.push(...(data as OxfordRow[]))
              page += 1
              more = data.length === pageSize
            } else {
              more = false
            }
          }
          if (!cancelled) setAllOxfordWords(collected)
        } else {
          const cached = await getOxfordFromCache()
          if (!cancelled) setAllOxfordWords(cached as OxfordRow[])
        }
      } catch {
        if (!cancelled) setAllOxfordWords([])
      } finally {
        if (!cancelled) setAllOxfordLoading(false)
      }
    }
    void fetchAll()
    return () => {
      cancelled = true
    }
  }, [online, targetLang])

  // 사용자 단어를 OxfordRow 호환 형태로 매핑
  const userItemRows = useMemo(
    () => items.map((it) => vocabItemToOxfordRow(it)),
    [items],
  )

  // 현재 source 의 후보 단어 (cloudPool)
  // EN-KO 학습자에게는 같은 한국어 의미를 가진 행이 여러 개 출제되는 것을 막기 위해
  // 클라이언트 측에서 korean_meaning 기준 dedup.
  // KO-EN 학습자는 같은 영어 단어가 sino/native 로 중복 출제되지 않게 word 기준 dedup.
  const cloudPool = useMemo<OxfordRow[]>(() => {
    void wrongVersion
    const apply = (rows: OxfordRow[]) =>
      koreanIsTarget ? dedupRowsByKoreanMeaning(rows) : dedupRowsByEnglishWord(rows)
    if (source === 'all') return apply(allOxfordWords)
    if (source === 'wrong') {
      const stateWrongIds = new Set(wrong.map((w) => w.id))
      const lsWrongIds = getWrongAnswerIds(wrongMode)
      const allWrongIds = new Set(stateWrongIds)
      for (const id of lsWrongIds) allWrongIds.add(id)
      const fromCloud = allOxfordWords.filter((r) => allWrongIds.has(r.id))
      const fromUser = userItemRows.filter((r) => allWrongIds.has(r.id))
      const seen = new Set<string>()
      const merged: OxfordRow[] = []
      for (const r of [...fromCloud, ...fromUser]) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        merged.push(r)
      }
      return apply(merged)
    }
    if (typeof source === 'object' && 'cloud' in source) {
      const key = source.cloud
      const parsed = parseOxfordFilter(key)
      // classified:음식/음료
      if (parsed.classified) {
        const words = new Set(getOxfordWordsByTopic(parsed.classified).map((w) => w.toLowerCase().trim()))
        return apply(allOxfordWords.filter((r) => words.has((r.word ?? '').toLowerCase().trim())))
      }
      // pos:noun
      if (parsed.pos) {
        const p = parsed.pos.toLowerCase()
        return apply(allOxfordWords.filter((r) => (r.pos ?? '').toLowerCase() === p))
      }
      // ordered:숫자1-50
      if (parsed.ordered) {
        const words = new Set(getOrderedOxfordWords(parsed.ordered).map((w) => w.toLowerCase().trim()))
        return apply(allOxfordWords.filter((r) => words.has((r.word ?? '').toLowerCase().trim())))
      }
      // 그 외 prefix 없는 값 → DB category 직접 매치
      const cat = parsed.category ?? key
      return apply(allOxfordWords.filter((r) => r.category === cat))
    }
    if (typeof source === 'object' && 'deckId' in source) {
      return apply(
        userItemRows.filter((r) => {
          const orig = items.find((it) => it.id === r.id)
          return orig?.deckId === source.deckId
        }),
      )
    }
    return []
  }, [source, allOxfordWords, userItemRows, items, wrong, wrongVersion, koreanIsTarget])

  const isCloudSource = typeof source === 'object' && 'cloud' in source
  const isWrongSource = source === 'wrong'
  const isUserDeckSource = typeof source === 'object' && 'deckId' in source
  const isAllSource = source === 'all'

  // 보기 풀: 항상 전체 Oxford + 사용자 항목
  const optionsPool = useMemo<OxfordRow[]>(() => {
    if (allOxfordWords.length > 0) return allOxfordWords
    return cloudPool
  }, [allOxfordWords, cloudPool])

  // 퀴즈 진행 상태
  const [quizItems, setQuizItems] = useState<OxfordRow[]>([])
  // 문제별 방향: true = 한국어가 학습 대상(영어 보기 선택), false = 영어가 학습 대상(한국어 보기 선택).
  // 50:50 무작위 혼합으로 양방향 학습 효과를 동시에 제공.
  const [directions, setDirections] = useState<boolean[]>([])
  const [questionIdx, setQuestionIdx] = useState(0)
  const [choices, setChoices] = useState<OxfordRow[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [removedFromWrong, setRemovedFromWrong] = useState(false)

  const setupChoices = useCallback(
    (correct: OxfordRow, pool: OxfordRow[]) => {
      const distractors = shuffle(pool.filter((r) => r.id !== correct.id)).slice(0, 3)
      setChoices(shuffle([correct, ...distractors]))
    },
    [],
  )

  const startQuizInternal = useCallback(() => {
    if (cloudPool.length === 0) return
    const items = shuffle(cloudPool).slice(0, Math.min(count, cloudPool.length))
    // 50:50 방향 배열: 절반 true / 절반 false 를 채운 뒤 shuffle.
    const half = Math.floor(items.length / 2)
    const dirRaw: boolean[] = [
      ...Array<boolean>(half).fill(true),
      ...Array<boolean>(items.length - half).fill(false),
    ]
    const dirs = shuffle(dirRaw)
    setQuizItems(items)
    setDirections(dirs)
    setQuestionIdx(0)
    setScore(0)
    setPicked(null)
    setRemovedFromWrong(false)
    setupChoices(items[0], optionsPool.length > 0 ? optionsPool : cloudPool)
    setPhase('play')
    dispatch({ type: 'settings', patch: { quizCount: count, quizSource: source } })
  }, [cloudPool, count, optionsPool, setupChoices, setPhase, dispatch, source])

  // 퀴즈 시작 (광고 체크 포함, SW-KO 와 동일)
  // - 사용자 덱(deckId) 이외에는 모두 보상형 광고 게이트 대상
  //   (SW-KO 에서는 'all' 이 { cloud: '모든 단어' } 로 정규화되어 isCloudSource 가 true → 동일하게 처리)
  const start = useCallback(() => {
    const needsRewardGate = !isUserDeckSource
    if (needsRewardGate) {
      if (canAccessQuiz()) {
        startQuizInternal()
      } else {
        window.history.pushState({ adModal: true }, '')
        setShowAdModal(true)
      }
    } else {
      startQuizInternal()
    }
  }, [isUserDeckSource, startQuizInternal])

  // 광고 시청 후 퀴즈 시작 (SW-KO 와 동일)
  const handleWatchAd = async () => {
    setAdLoading(true)
    try {
      const success = await showRewardedAd()
      if (success) {
        window.history.back()
        setQuizAccessRemaining(getQuizAccessRemainingTime())
        setTimeout(() => {
          startQuizInternal()
        }, 300)
      }
    } catch (error) {
      console.error('광고 표시 실패:', error)
    } finally {
      setAdLoading(false)
    }
  }

  const onPick = (id: string) => {
    if (picked) return
    const current = quizItems[questionIdx]
    setPicked(id)
    const correct = id === current.id
    if (correct) setScore((s) => s + 1)
    if (!correct) {
      addToWrongAnswers(current.id, wrongMode)
    }
    dispatch({ type: 'quizAnswer', id: current.id, correct })
  }

  const next = () => {
    const nextIdx = questionIdx + 1
    if (nextIdx >= quizItems.length) {
      setPhase('result')
      return
    }
    setQuestionIdx(nextIdx)
    setPicked(null)
    setRemovedFromWrong(false)
    setupChoices(quizItems[nextIdx], optionsPool.length > 0 ? optionsPool : cloudPool)
  }

  // 오프라인 + 캐시 데이터 없음 → SW-KO 와 동일한 안내 화면
  const isOfflineWithNoData = !online && !allOxfordLoading && allOxfordWords.length === 0
  if (isOfflineWithNoData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="relative mb-8">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 border-2 border-orange-400/30 flex items-center justify-center">
            <div className="text-5xl sm:text-6xl">🧠</div>
          </div>
          <div className="absolute -bottom-2 -right-2 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/30 border-2 border-red-400/40 flex items-center justify-center">
            <span className="text-xl sm:text-2xl">📴</span>
          </div>
        </div>
        <div className="text-center space-y-4 max-w-sm">
          <h2 className="text-xl sm:text-2xl font-extrabold text-white">
            {lang === 'sw'
              ? 'Jaribio Halipatikani'
              : lang === 'en'
                ? 'Quiz Unavailable'
                : '퀴즈를 사용할 수 없습니다'}
          </h2>
          <p className="text-sm sm:text-base text-white/80 leading-relaxed">
            {lang === 'sw'
              ? 'Unahitaji kupakua data kwanza ili uweze kufanya majaribio bila mtandao.'
              : lang === 'en'
                ? 'You need to download data first to take quizzes offline.'
                : '오프라인에서 퀴즈를 풀려면 먼저 데이터를 다운로드해야 합니다.'}
          </p>
        </div>
        <div className="mt-8 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-400/20 max-w-sm w-full">
          <div className="flex items-start gap-3">
            <div className="text-xl sm:text-2xl">💡</div>
            <div>
              <div className="text-sm font-bold text-cyan-300 mb-1">
                {lang === 'sw'
                  ? 'Jinsi ya kutatua'
                  : lang === 'en'
                    ? 'How to fix'
                    : '해결 방법'}
              </div>
              <div className="text-xs text-white/60 leading-relaxed whitespace-pre-line">
                {lang === 'sw'
                  ? '1. Unganisha na mtandao\n2. Nenda kwenye ukurasa wa nyumbani\n3. Bonyeza "📥 Pakua Yote"\n4. Baada ya pakua kukamilika, unaweza kufanya majaribio bila mtandao!'
                  : lang === 'en'
                    ? '1. Connect to the internet\n2. Go to the home screen\n3. Tap "📥 Download All"\n4. After downloading, you can take quizzes offline!'
                    : '1. 인터넷에 연결해주세요\n2. 홈 화면으로 이동\n3. "📥 전체 다운로드" 버튼을 눌러주세요\n4. 다운로드 완료 후 오프라인에서도 퀴즈를 풀 수 있습니다!'}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-2 text-sm text-white/50">
          <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
          <span>
            {lang === 'sw'
              ? 'Inasubiri muunganisho...'
              : lang === 'en'
                ? 'Waiting for connection...'
                : '연결 대기 중...'}
          </span>
        </div>
      </div>
    )
  }

  // ───────────────────────────────────────────────────────────────────────
  // SETUP PHASE
  // ───────────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const wordsLabel = WORDS_LABEL[lang]
    const totalWords = cloudPool.length

    // 드롭다운 표시값
    const getCurrentValue = () => {
      if (source === 'all') return 'all'
      if (source === 'wrong') return 'wrong'
      if (typeof source === 'object' && 'cloud' in source) return `cloud_${source.cloud}`
      if (typeof source === 'object' && 'deckId' in source) return source.deckId
      return 'all'
    }

    const userDecks = decks.filter((d) => !CAT_KEY_SET.has(d.name) && d.name !== '모든 단어' && d.name !== '사전')

    const canStart = !allOxfordLoading && totalWords >= 4

    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="rounded-3xl p-4 sm:p-6 app-banner backdrop-blur">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {t('quizTitle', lang)}
            </div>
            <div className="rounded-full bg-[rgb(var(--green))]/20 px-3 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-extrabold text-[rgb(var(--green))]">
              {totalWords === 0 && allOxfordLoading ? (
                <span
                  className="inline-flex items-center gap-1 align-middle"
                  aria-label={LOADING_MSG[lang]}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"
                    style={{ animationDelay: '300ms' }}
                  />
                </span>
              ) : (
                <>
                  {totalWords.toLocaleString()} {wordsLabel}
                </>
              )}
            </div>
          </div>

          <div className="mt-4 sm:mt-5 grid gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2 text-lg sm:text-xl font-extrabold text-white">
              <span aria-hidden="true">📚</span>
              <span>{t('selectWordbook', lang)}</span>
            </div>
            <select
              className="h-12 sm:h-14 w-full rounded-3xl border border-white/12 bg-white/8 px-4 sm:px-5 text-sm sm:text-base text-white outline-none ring-[rgb(var(--purple))]/25 focus:ring-4 touch-target"
              value={getCurrentValue()}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'all') setSource('all')
                else if (v === 'wrong') setSource('wrong')
                else if (v.startsWith('cloud_'))
                  setSource({ cloud: v.replace('cloud_', '') })
                else setSource({ deckId: v })
              }}
            >
              <option value="all">{ALL_WORDS_LABEL[lang]}</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={`cloud_${c.key}`}>
                  {c.label[lang]}
                </option>
              ))}
              {userDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="wrong">{t('wrongNotes', lang)}</option>
            </select>

            <div className="mt-1 sm:mt-2 flex items-center gap-2 text-lg sm:text-xl font-extrabold text-white">
              <span aria-hidden="true">🎯</span>
              <span>{t('questionCount', lang)}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {[5, 10, 20, 50].map((n) => (
                <button
                  key={n}
                  className={cn(
                    'h-12 sm:h-16 rounded-2xl sm:rounded-3xl border text-lg sm:text-xl font-extrabold transition active:scale-95 touch-target',
                    count === n
                      ? 'border-[rgb(var(--green))]/40 bg-[rgb(var(--green))] text-slate-950'
                      : 'border-white/10 bg-slate-950/25 text-white/90 hover:bg-white/5',
                  )}
                  onClick={() => setCount(n as 5 | 10 | 20 | 50)}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="mt-3 sm:mt-4 space-y-2">
              {allOxfordLoading ? (
                <div className="h-14 sm:h-18 w-full rounded-3xl bg-white/10 flex items-center justify-center">
                  <span className="text-white/70 text-sm sm:text-base">{LOADING_MSG[lang]}</span>
                </div>
              ) : (
                <Button
                  variant="success"
                  className={cn(
                    'h-14 sm:h-18 w-full rounded-3xl shadow-[0_8px_32px_rgba(34,197,94,0.5)] ring-2 sm:ring-4 ring-green-400 transition touch-target',
                    !canStart
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:scale-[1.02] active:scale-[0.98] hover:shadow-[0_12px_40px_rgba(34,197,94,0.6)]',
                  )}
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                  disabled={!canStart}
                  onClick={start}
                >
                  <span
                    className="text-xl sm:text-2xl font-black tracking-wide text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                    style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 2px rgba(0,0,0,0.3)' }}
                  >
                    {START_QUIZ_LABEL[lang]}
                  </span>
                </Button>
              )}
              {!canStart && !allOxfordLoading ? (
                <div className="rounded-2xl border border-[rgb(var(--orange))]/40 bg-[rgb(var(--orange))]/10 p-2.5 sm:p-3 text-xs sm:text-sm text-white">
                  {NO_WORDS_MSG[lang]}
                </div>
              ) : null}

              {/* 퀴즈 접근 권한 남은 시간 표시 (SW-KO 와 동일) */}
              {!isUserDeckSource && quizAccessRemaining > 0 && (
                <div className="mt-2 rounded-2xl border border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/10 p-2.5 sm:p-3 text-xs sm:text-sm text-white/90 text-center">
                  <span className="text-[rgb(var(--green))]">✓</span>{' '}
                  {lang === 'sw'
                    ? `Muda wa kuis bila tangazo: ${Math.ceil(quizAccessRemaining / 60000)} dakika`
                    : lang === 'en'
                      ? `Quiz without ads: ${Math.ceil(quizAccessRemaining / 60000)} min left`
                      : `광고 없이 퀴즈 가능: ${Math.ceil(quizAccessRemaining / 60000)}분 남음`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 보상형 광고 모달 (SW-KO 와 동일) */}
        {showAdModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
            <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 shadow-2xl border border-white/20">
              <div className="text-center">
                <div className="text-6xl mb-4 animate-bounce">🎬</div>
                <h3 className="text-2xl font-extrabold text-white mb-3">
                  {lang === 'sw'
                    ? 'Tazama Tangazo'
                    : lang === 'en'
                      ? 'Watch Ad'
                      : '광고 시청'}
                </h3>
                <p className="text-sm text-white/80 mb-6 leading-relaxed">
                  {lang === 'sw'
                    ? 'Tazama tangazo fupi kupata dakika 30 za kuis bila vikwazo!'
                    : lang === 'en'
                      ? 'Watch a short ad to get 30 minutes of ad-free quizzes!'
                      : '짧은 광고를 시청하면 30분간 광고 없이 퀴즈를 풀 수 있어요!'}
                </p>

                <div className="space-y-3">
                  <button
                    className={cn(
                      'w-full h-16 rounded-2xl font-black text-xl tracking-wide text-white transition-all',
                      'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500',
                      'shadow-[0_8px_32px_rgba(34,197,94,0.5)] ring-4 ring-green-400/50',
                      'hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(34,197,94,0.6)]',
                      'active:scale-[0.98]',
                      adLoading && 'opacity-70 cursor-wait',
                    )}
                    onClick={handleWatchAd}
                    disabled={adLoading}
                    style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                  >
                    {adLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span>
                        {lang === 'sw'
                          ? 'Inapakia...'
                          : lang === 'en'
                            ? 'Loading...'
                            : '로딩 중...'}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span className="text-2xl">▶</span>
                        {lang === 'sw'
                          ? 'Tazama Tangazo'
                          : lang === 'en'
                            ? 'Watch Ad'
                            : '광고 보기'}
                      </span>
                    )}
                  </button>

                  <button
                    className="w-full h-12 rounded-2xl bg-white/10 text-white/60 font-semibold transition hover:bg-white/15 active:scale-95"
                    onClick={() => {
                      window.history.back()
                    }}
                    disabled={adLoading}
                  >
                    {lang === 'sw'
                      ? 'Ghairi'
                      : lang === 'en'
                        ? 'Cancel'
                        : '취소'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ───────────────────────────────────────────────────────────────────────
  // PLAY PHASE
  // ───────────────────────────────────────────────────────────────────────
  if (phase === 'play') {
    const current = quizItems[questionIdx]
    if (!current) return null
    // 문제별 무작위 방향. 배열이 비어 있는 비정상 상태에서는 화면 모드(`koreanIsTarget`)를 기본값으로.
    const dirKoTarget = directions[questionIdx] ?? koreanIsTarget
    const koOverride = WORD_DISPLAY_OVERRIDE[current.korean_meaning]
    const displayKorean = koOverride?.word ?? current.korean_meaning
    const displayKoreanPron = koOverride?.pron ?? null
    const targetText = dirKoTarget ? displayKorean : current.word
    const meaningText = dirKoTarget
      ? (applyEnOverride(current.word, current.korean_meaning) ?? current.word)
      : (applyKoOverride(current.word, displayKorean) ?? displayKorean)
    const targetAudio = dirKoTarget ? current.meaning_audio_url : current.word_audio_url
    const targetTtsLang: 'sw' | 'ko' | 'en' = dirKoTarget ? 'ko' : 'en'

    const progress = `${questionIdx + 1} / ${quizItems.length}`
    const ok = picked !== null ? picked === current.id : null
    const correctLabel = t('correct', lang)
    const wrongLabel =
      lang === 'sw'
        ? `Kosa · Jibu: ${meaningText}`
        : lang === 'en'
          ? `Wrong · Answer: ${meaningText}`
          : `오답 · 정답: ${meaningText}`
    const deckName = (() => {
      if (isAllSource) return ALL_WORDS_LABEL[lang]
      if (isWrongSource) return t('wrongNote', lang)
      if (isUserDeckSource && typeof source === 'object' && 'deckId' in source) {
        return decks.find((d) => d.id === source.deckId)?.name ?? t('wordbook', lang)
      }
      if (isCloudSource && typeof source === 'object' && 'cloud' in source) {
        return CATEGORIES.find((c) => c.key === source.cloud)?.label[lang] ?? source.cloud
      }
      return t('wordbook', lang)
    })()

    return (
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between rounded-2xl p-3 sm:p-4 app-banner backdrop-blur">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setPhase('setup')}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-white/15 bg-white/8 text-white/70 hover:bg-white/15 active:scale-95 transition touch-target"
            >
              ←
            </button>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-semibold text-white/70 truncate">
                {deckName}
              </div>
              <div className="text-sm sm:text-base font-extrabold text-white">
                {t('quiz', lang)} · {progress}
              </div>
            </div>
          </div>
          <div className="text-xs sm:text-sm font-extrabold text-white/90 shrink-0">
            {t('score', lang)} {score}
          </div>
        </div>

        <div className="rounded-3xl p-3 sm:p-5 app-card backdrop-blur">
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-extrabold text-white break-words">
              {targetText}
            </div>
            {(() => {
              // EN-KO: 한국어 단어 → 라틴 로마자.
              // KO-EN: 영어 단어 → DB 저장된 한글 발음(word_pron_ko, 숫자 단어 한정).
              const pron = dirKoTarget
                ? (displayKoreanPron ?? romanizeKoreanText(targetText))
                : (current.word_pron_ko ?? null)
              return pron ? (
                <div className="mt-1 text-sm sm:text-base font-bold text-cyan-400 tracking-tight">
                  [{pron}]
                </div>
              ) : null
            })()}
            {targetAudio || targetText ? (
              <CorrectedAudioBtn
                url={targetAudio}
                displayText={targetText}
                dbText={dirKoTarget ? current.korean_meaning : current.word}
                lang={targetTtsLang}
                preferClientTts={dirKoTarget && (PREFER_CLIENT_KO_TTS_WORDS.has(targetText) || !!koOverride)}
                variant="quizMain"
              />
            ) : null}
          </div>

          <div className="mt-3 sm:mt-4 grid gap-1 sm:gap-1.5">
            {choices.map((c, i) => {
              const cKoOverride = WORD_DISPLAY_OVERRIDE[c.korean_meaning]
              const cDisplayKorean = cKoOverride?.word ?? c.korean_meaning
              const choiceText = dirKoTarget
                ? (applyEnOverride(c.word, c.korean_meaning) ?? c.word)
                : (applyKoOverride(c.word, cDisplayKorean) ?? cDisplayKorean)
              const isCorrect = c.id === current.id
              const isPicked = picked === c.id
              const state =
                picked && isCorrect
                  ? 'border-[rgb(var(--green))]/45 bg-[rgb(var(--green))]/16'
                  : picked && isPicked
                    ? 'border-[rgb(var(--orange))]/55 bg-[rgb(var(--orange))]/16'
                    : 'border-white/10 bg-slate-950/25 hover:bg-white/5'
              return (
                <button
                  key={`${i}_${c.id}`}
                  className={cn(
                    'rounded-xl sm:rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-3 text-left text-sm sm:text-base font-extrabold text-white transition active:scale-[0.99] touch-target',
                    state,
                  )}
                  onClick={() => onPick(c.id)}
                  disabled={picked !== null}
                >
                  {choiceText}
                </button>
              )
            })}
          </div>

          {picked !== null ? (
            <div className="mt-3 sm:mt-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div
                  className={cn(
                    'text-xs sm:text-sm font-semibold min-w-0 truncate',
                    ok ? 'text-[rgb(var(--green))]' : 'text-[rgb(var(--orange))]',
                  )}
                >
                  {ok ? correctLabel : wrongLabel}
                </div>
                <Button onClick={next} className="shrink-0">
                  {t('next', lang)}
                </Button>
              </div>
              {/* 오답노트 퀴즈에서 정답 시 오답노트 제거 버튼 — SW-KO 와 동일 */}
              {isWrongSource && ok ? (
                <button
                  onClick={() => {
                    removeFromWrongAnswers(current.id, wrongMode)
                    dispatch({ type: 'wrongRemove', id: current.id })
                    setRemovedFromWrong(true)
                  }}
                  disabled={removedFromWrong}
                  className={cn(
                    'w-full rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold transition touch-target',
                    removedFromWrong
                      ? 'bg-[rgb(var(--green))]/10 text-[rgb(var(--green))]/70 cursor-not-allowed'
                      : 'bg-[rgb(var(--green))]/15 text-[rgb(var(--green))] hover:bg-[rgb(var(--green))]/25 active:scale-[0.98]',
                  )}
                >
                  {removedFromWrong
                    ? lang === 'sw'
                      ? '✓ Imeondolewa'
                      : lang === 'en'
                        ? '✓ Removed'
                        : '✓ 오답노트에서 제거됨'
                    : lang === 'sw'
                      ? '🗑️ Ondoa kwenye Orodha ya Makosa'
                      : lang === 'en'
                        ? '🗑️ Remove from Wrong Notes'
                        : '🗑️ 오답노트에서 제거'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  // ───────────────────────────────────────────────────────────────────────
  // RESULT PHASE
  // ───────────────────────────────────────────────────────────────────────
  const resultTotal = quizItems.length
  const percentage = resultTotal > 0 ? Math.round((score / resultTotal) * 100) : 0
  return (
    <div className="rounded-3xl p-5 sm:p-6 text-center app-card backdrop-blur">
      <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🎉</div>
      <div className="text-xl sm:text-2xl font-extrabold text-white">{t('done', lang)}</div>
      <div className="mt-3 sm:mt-4 text-3xl sm:text-4xl font-extrabold text-[rgb(var(--green))]">
        {score} / {resultTotal}
      </div>
      <div className="mt-1 sm:mt-2 text-base sm:text-lg font-semibold text-white/70">
        {percentage}%
      </div>
      <div className="mt-4 sm:mt-5 flex justify-center gap-2">
        <Button variant="secondary" onClick={() => setPhase('setup')}>
          {t('reconfigure', lang)}
        </Button>
        <Button onClick={start}>{t('oneMore', lang)}</Button>
      </div>
    </div>
  )
}
