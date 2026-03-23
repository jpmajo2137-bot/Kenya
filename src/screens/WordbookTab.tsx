import { useEffect, useMemo, useRef, useState } from 'react'
import type { Action } from '../app/state'
import type { Deck, VocabItem } from '../lib/types'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Input } from '../components/TextField'
import { useToast } from '../components/Toast'
import { t, type Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { getWrongAnswersCount, WRONG_ANSWERS_UPDATED_EVENT } from './FlashcardScreen'
import { 
  isOnline, 
  onOnlineStatusChange
} from '../lib/offlineCache'
import { AllWordsDayList } from './AllWordsDayList'
import { WordbookScreen } from './WordbookScreen'
import { DictionaryDayList } from './DictionaryDayList'
import { getClassifiedDisplayCount, getOrderedCount, CATEGORY_WORD_EXCLUSIONS, POS_WORD_EXCLUSIONS, CATEGORY_MAX_DAYS, GLOBAL_WORD_EXCLUSIONS } from '../lib/filterUtils'

const WORDS_PER_DAY = 40


const DICTIONARY_DECK_NAME = '사전'

// 클라우드 단어장 레벨
const CLOUD_DECK_LEVELS: Record<string, string> = {
  '모든 단어': '',
  '입문': '입문',
  '초급': '초급',
  '중급': '중급',
  '고급': '고급',
  '여행': '여행',
  '비즈니스': '비즈니스',
  '쇼핑': '쇼핑',
  '위기탈출': '위기탈출',
}

// 난이도별 상위 단어장 (개별 표시)
const LEVEL_DECK_NAMES = ['입문', '초급', '중급', '고급']
const LEVEL_INFO: { name: string; emoji: string; swLabel: string }[] = [
  { name: '입문', emoji: '🌱', swLabel: 'Utangulizi' },
  { name: '초급', emoji: '📗', swLabel: 'Mwanzo' },
  { name: '중급', emoji: '📘', swLabel: 'Kati' },
  { name: '고급', emoji: '📕', swLabel: 'Juu' },
]

// 카테고리별 단어장 (부모)
const STUDY_PARENT_NAME = '카테고리별 단어장'
const CATEGORY_DECK_NAMES = ['여행', '비즈니스', '쇼핑', '위기탈출']

type CategoryEntry = {
  key: string
  emoji: string
  koLabel: string
  swLabel: string
  filter: string
  group: 'situation' | 'subject' | 'pos'
}

const CATEGORY_INFO: CategoryEntry[] = [
  // 상황별
  { key: 'cl:일상생활', emoji: '🏡', koLabel: '일상생활', swLabel: 'Maisha ya Kila Siku', filter: 'classified:일상생활', group: 'situation' },
  { key: '여행', emoji: '✈️', koLabel: '여행', swLabel: 'Safari', filter: 'category:여행', group: 'situation' },
  { key: '비즈니스', emoji: '💼', koLabel: '비즈니스', swLabel: 'Biashara', filter: 'category:비즈니스', group: 'situation' },
  { key: '쇼핑', emoji: '🛍️', koLabel: '쇼핑', swLabel: 'Ununuzi', filter: 'category:쇼핑', group: 'situation' },
  { key: '위기탈출', emoji: '🆘', koLabel: '위기탈출', swLabel: 'Dharura', filter: 'category:위기탈출', group: 'situation' },
  // 주제별 (GPT-5.2 Pro 분류 기반)
  { key: 'ord:숫자1-50', emoji: '🔢', koLabel: '숫자', swLabel: 'Namba', filter: 'ordered:숫자1-50', group: 'subject' },
  { key: 'cl:숫자/수량', emoji: '🔢', koLabel: '숫자/수량', swLabel: 'Namba / Kiasi', filter: 'classified:숫자/수량', group: 'subject' },
  { key: 'cl:음식/음료', emoji: '🍽️', koLabel: '음식/음료', swLabel: 'Chakula/Vinywaji', filter: 'classified:음식/음료', group: 'subject' },
  { key: 'cl:가족/관계', emoji: '👪', koLabel: '가족/관계', swLabel: 'Familia/Uhusiano', filter: 'classified:가족/관계', group: 'subject' },
  { key: 'cl:자연/동물', emoji: '🌿', koLabel: '자연/동물', swLabel: 'Asili/Wanyama', filter: 'classified:자연/동물', group: 'subject' },
  { key: 'cl:집/생활용품', emoji: '🏠', koLabel: '집/생활용품', swLabel: 'Nyumba/Vifaa', filter: 'classified:집/생활용품', group: 'subject' },
  { key: 'cl:인사/기본표현', emoji: '👋', koLabel: '인사', swLabel: 'Salamu', filter: 'classified:인사/기본표현', group: 'subject' },
  { key: 'cl:신체/건강', emoji: '💪', koLabel: '신체/건강', swLabel: 'Mwili/Afya', filter: 'classified:신체/건강', group: 'subject' },
  { key: 'cl:시간/날짜', emoji: '⏰', koLabel: '시간/날짜', swLabel: 'Wakati/Tarehe', filter: 'classified:시간/날짜', group: 'subject' },
  { key: 'cl:색상/외모', emoji: '🎨', koLabel: '색상/외모', swLabel: 'Rangi/Sura', filter: 'classified:색상/외모', group: 'subject' },
  { key: 'cl:교통/이동', emoji: '🚗', koLabel: '교통/이동', swLabel: 'Usafiri/Msogeo', filter: 'classified:교통/이동', group: 'subject' },
  // 품사별 (DB pos 컬럼 기반)
  { key: 'pos:noun', emoji: '📝', koLabel: '명사', swLabel: 'Nomino', filter: 'pos:noun', group: 'pos' },
  { key: 'pos:verb', emoji: '🏃', koLabel: '동사', swLabel: 'Kitenzi', filter: 'pos:verb', group: 'pos' },
  { key: 'pos:adjective', emoji: '🎨', koLabel: '형용사', swLabel: 'Kivumishi', filter: 'pos:adjective', group: 'pos' },
  { key: 'pos:adverb', emoji: '⏩', koLabel: '부사', swLabel: 'Kielezi', filter: 'pos:adverb', group: 'pos' },
]


// 기본 단어장 이름 번역 (스와힐리어)
const deckNameTranslations: Record<string, string> = {
  '모든 단어': 'Maneno Yote',
  '입문': 'Utangulizi',
  '초급': 'Mwanzo',
  '중급': 'Kati',
  '고급': 'Juu',
  '여행': 'Safari',
  '비즈니스': 'Biashara',
  '쇼핑': 'Ununuzi',
  '위기탈출': 'Dharura',
  '사전': 'Kamusi',
  [STUDY_PARENT_NAME]: 'Msamiati kwa Kundi',
}

export function WordbookTab({
  decks,
  items,
  showEnglish,
  dispatch,
  lang,
  meaningLang,
}: {
  decks: Deck[]
  items: VocabItem[]
  showEnglish: boolean
  dispatch: (a: Action) => void
  lang: Lang
  meaningLang: 'sw' | 'ko'
}) {
  const { toast } = useToast()
  
  // 안전한 데이터 접근
  const safeDecks = Array.isArray(decks) ? decks : []
  const safeItems = Array.isArray(items) ? items : []
  
  const [selectedDeckId, setSelectedDeckIdState] = useState<string | null>(null)
  const [showCategories, setShowCategoriesState] = useState(false)
  const [categoryFilter, setCategoryFilterState] = useState<string | null>(null)
  const [categoryLabel, setCategoryLabelState] = useState('')
  const selectedDeck = safeDecks.find((d) => d?.id === selectedDeckId) ?? null

  // 단어장을 열 때 history 추가
  const openDeck = (deckId: string) => {
    window.history.pushState({ wordbookDeckId: deckId }, '')
    setSelectedDeckIdState(deckId)
  }

  const openCategories = () => {
    window.history.pushState({ wordbookCategoryParent: true }, '')
    setShowCategoriesState(true)
  }

  const openCategoryFilter = (filter: string, label: string) => {
    window.history.pushState({ wordbookCategoryFilter: filter }, '')
    setCategoryFilterState(filter)
    setCategoryLabelState(label)
  }

  // 단어장을 닫을 때
  const closeDeck = () => {
    setSelectedDeckIdState(null)
  }

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as {
        screen?: string
        wordbookDeckId?: string
        wordbookCategoryParent?: boolean
        wordbookCategoryFilter?: string
      } | null

      if (state?.screen) return
      if (state?.wordbookDeckId) return

      if (state?.wordbookCategoryFilter) {
        setCategoryFilterState(state.wordbookCategoryFilter)
        setSelectedDeckIdState(null)
        return
      }

      if (state?.wordbookCategoryParent) {
        setSelectedDeckIdState(null)
        setCategoryFilterState(null)
        return
      }

      setSelectedDeckIdState((current) => current !== null ? null : current)
      setShowCategoriesState(false)
      setCategoryFilterState(null)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const isCloudDeck = selectedDeck ? (String(selectedDeck.name ?? '') in CLOUD_DECK_LEVELS) : false
  const isDictionaryDeck = selectedDeck ? String(selectedDeck.name ?? '') === DICTIONARY_DECK_NAME : false

  // 오프라인 상태 (먼저 선언해야 다른 useEffect에서 사용 가능)
  const [online, setOnline] = useState(isOnline())
  
  // 온라인 전환 시 데이터 재로드를 위한 트리거
  const [fetchTrigger, setFetchTrigger] = useState(0)
  const prevOnlineRef = useRef(online)

  // 클라우드 단어장 단어 수 가져오기
  const [cloudCounts, setCloudCounts] = useState<Record<string, number>>({})
  const [isLoadingCounts, setIsLoadingCounts] = useState(true)
  
  // 플래시카드 오답노트 개수
  const [flashcardWrongCount, setFlashcardWrongCount] = useState(0)
  
  useEffect(() => {
    // 초기 카운트 설정 (언어별)
    setFlashcardWrongCount(getWrongAnswersCount(meaningLang))
    
    // 오답노트 업데이트 이벤트 리스너
    const handleWrongAnswersUpdated = () => {
      setFlashcardWrongCount(getWrongAnswersCount(meaningLang))
    }
    
    window.addEventListener(WRONG_ANSWERS_UPDATED_EVENT, handleWrongAnswersUpdated)
    return () => window.removeEventListener(WRONG_ANSWERS_UPDATED_EVENT, handleWrongAnswersUpdated)
  }, [selectedDeckId, meaningLang])

  // 온라인 전환 감지 및 데이터 재로드 트리거
  useEffect(() => {
    // 오프라인 -> 온라인 전환 감지
    if (!prevOnlineRef.current && online) {
      // 약간의 딜레이 후 재로드 (네트워크 안정화 대기)
      const timer = setTimeout(() => {
        setFetchTrigger(prev => prev + 1)
      }, 500)
      return () => clearTimeout(timer)
    }
    prevOnlineRef.current = online
  }, [online])
  
  useEffect(() => {
    let isCancelled = false

    const fetchCloudCounts = async () => {
      if (!supabase || !navigator.onLine) {
        setIsLoadingCounts(false)
        return
      }

      setIsLoadingCounts(true)

      const mode = lang === 'sw' ? 'sw' : 'ko'
      const counts: Record<string, number> = {}

      // 1) 분류/순서 카운트는 로컬 데이터로 즉시 계산 (API 호출 불필요)
      for (const cat of CATEGORY_INFO.filter((c) => c.group === 'subject' || (c.group === 'situation' && c.filter.startsWith('classified:')))) {
        if (cat.filter.startsWith('ordered:')) {
          counts[cat.key] = getOrderedCount(cat.filter.replace('ordered:', ''), mode)
        } else {
          const topicName = cat.filter.replace('classified:', '')
          counts[cat.key] = getClassifiedDisplayCount(topicName, mode, WORDS_PER_DAY)
        }
      }

      // 즉시 로컬 카운트 반영 → 로딩 화면 해제
      if (!isCancelled) {
        setCloudCounts({ ...counts })
        setIsLoadingCounts(false)
      }

      // 2) Supabase 카운트는 병렬로 백그라운드 로딩
      try {
        const promises: Promise<void>[] = []

        // 전체 단어 수
        promises.push(
          supabase.from('generated_vocab').select('*', { count: 'exact', head: true }).eq('mode', mode)
            .then(({ count }) => { counts['모든 단어'] = count ?? 0 })
        )

        // 카테고리별
        for (const cat of ['입문', '초급', '중급', '고급', '여행', '비즈니스', '쇼핑', '위기탈출'] as const) {
          const catExcl = CATEGORY_WORD_EXCLUSIONS[cat]
          if (catExcl?.length) {
            promises.push(
              supabase.from('generated_vocab').select('word').eq('mode', mode).eq('category', cat)
                .order('created_at', { ascending: true }).limit(2000)
                .then(({ data }) => {
                  let cleaned = (data ?? []).filter((r: { word?: string | null }) => !(r.word ?? '').startsWith('__deleted__'))
                  cleaned = cleaned.filter((r: { word?: string | null }) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
                  const exclSet = new Set(catExcl)
                  cleaned = cleaned.filter((r: { word?: string | null }) => !exclSet.has(r.word ?? ''))
                  counts[cat] = cleaned.length
                })
            )
          } else {
            promises.push(
              supabase.from('generated_vocab').select('*', { count: 'exact', head: true }).eq('mode', mode).eq('category', cat)
                .then(({ count }) => { counts[cat] = count ?? 0 })
            )
          }
        }

        // 품사별
        for (const posVal of ['noun', 'verb', 'adjective', 'adverb', 'phrase']) {
          const pExcl = POS_WORD_EXCLUSIONS[posVal]
          if (pExcl?.length) {
            promises.push(
              supabase.from('generated_vocab').select('word').eq('mode', mode).eq('pos', posVal)
                .order('created_at', { ascending: true }).limit(2000)
                .then(({ data }) => {
                  let cleaned = (data ?? []).filter((r: { word?: string | null }) => !(r.word ?? '').startsWith('__deleted__'))
                  const exclSet = new Set(pExcl)
                  cleaned = cleaned.filter((r: { word?: string | null }) => !exclSet.has(r.word ?? ''))
                  counts[`pos:${posVal}`] = cleaned.length
                })
            )
          } else {
            promises.push(
              supabase.from('generated_vocab').select('*', { count: 'exact', head: true }).eq('mode', mode).eq('pos', posVal)
                .then(({ count }) => { counts[`pos:${posVal}`] = count ?? 0 })
            )
          }
        }

        await Promise.allSettled(promises)

        if (!isCancelled) {
          setCloudCounts({ ...counts })
        }
      } catch (error) {
        console.error('단어 수 로딩 실패:', error)
        if (!isCancelled) {
          setCloudCounts({ ...counts })
        }
      }
    }

    void fetchCloudCounts()

    return () => {
      isCancelled = true
    }
  }, [lang, fetchTrigger])

  // 안전한 단어 수 계산 - useMemo 사용
  const itemsInDeck = useMemo(() => {
    if (!selectedDeckId) return []
    const isAllWords = selectedDeck?.name === '모든 단어'
    if (isAllWords) return safeItems
    return safeItems.filter((x) => x?.deckId === selectedDeckId)
  }, [safeItems, selectedDeckId, selectedDeck?.name])

  const [createOpen, setCreateOpen] = useState(false)
  const [deckName, setDeckName] = useState('')

  const createDeck = () => {
    const name = deckName.trim()
    if (!name) {
      toast({ title: t('enterWordbookName', lang) })
      return
    }
    dispatch({ type: 'deckAdd', name })
    setCreateOpen(false)
    setDeckName('')
    toast({ title: t('wordbookCreated', lang), description: name })
  }

  const wordsLabel = lang === 'sw' ? 'maneno' : '개 단어'
  
  const translateDeckName = (name: string | undefined | null): string => {
    if (!name) return '(이름 없음)'
    if (lang === 'sw' && deckNameTranslations[name]) {
      return deckNameTranslations[name]
    }
    if (name === '모든 단어') return t('allWords', lang)
    return name
  }

  useEffect(() => {
    const unsubscribeOnline = onOnlineStatusChange((newOnlineStatus) => {
      setOnline(newOnlineStatus)
    })
    
    return () => {
      unsubscribeOnline()
    }
  }, [])

  // 로딩 중일 때 로딩 화면 표시
  const hasCloudData = Object.keys(cloudCounts).length > 0
  const shouldShowLoading = isLoadingCounts || (online && !hasCloudData)

  // 오답노트로 이동
  const goToWrongNote = () => {
    dispatch({ type: 'settings', patch: { bottomTab: 'wrong' } })
  }

  // 카테고리 필터 선택됨 (품사별 등 물리적 덱 없이 필터만 적용)
  if (categoryFilter && !selectedDeckId) {
    const mode = lang === 'sw' ? 'sw' : 'ko'
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">{categoryLabel}</div>
          </div>
          <Button variant="secondary" onClick={() => { setCategoryFilterState(null); window.history.back() }}>
            {t('backToList', lang)}
          </Button>
        </div>
        <AllWordsDayList
          lang={lang}
          mode={mode}
          showEnglish={showEnglish}
          levelFilter={categoryFilter}
          title={categoryLabel}
          userItems={safeItems}
          dictionaryDeckId={safeDecks.find((d) => d.name === DICTIONARY_DECK_NAME)?.id}
        />
      </div>
    )
  }

  // 단어장 선택됨
  if (selectedDeck && selectedDeckId) {
    const levelFilter = CLOUD_DECK_LEVELS[selectedDeck.name ?? ''] ?? ''
    const mode = lang === 'sw' ? 'sw' : 'ko'
    
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">{translateDeckName(selectedDeck.name)}</div>
            {!isCloudDeck && !isDictionaryDeck && (
              <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                <span className="app-chip">📚 {String(itemsInDeck.length)} {wordsLabel}</span>
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={() => closeDeck()}>
            {t('backToList', lang)}
          </Button>
        </div>

        {isCloudDeck ? (
          <AllWordsDayList
            lang={lang}
            mode={mode}
            showEnglish={showEnglish}
            levelFilter={levelFilter}
            title={translateDeckName(selectedDeck.name)}
            userItems={safeItems}
            dictionaryDeckId={safeDecks.find((d) => d.name === DICTIONARY_DECK_NAME)?.id}
          />
        ) : isDictionaryDeck ? (
          <DictionaryDayList
            lang={lang}
            items={itemsInDeck}
            decks={safeDecks}
            deckId={selectedDeckId}
            showEnglish={showEnglish}
            dispatch={dispatch}
          />
        ) : (
          <WordbookScreen
            items={itemsInDeck}
            decks={safeDecks}
            fixedDeckId={selectedDeckId}
            showEnglish={showEnglish}
            dispatch={dispatch}
            lang={lang}
          />
        )}
      </div>
    )
  }

  // 카테고리별 단어장 - 카테고리 선택 화면
  if (showCategories && !selectedDeckId && !categoryFilter) {
    const situationCats = CATEGORY_INFO.filter((c) => c.group === 'situation')
    const subjectCats = CATEGORY_INFO.filter((c) => c.group === 'subject')
    const posCats = CATEGORY_INFO.filter((c) => c.group === 'pos')
    const getDisplayCount = (catKey: string) => {
      const raw = cloudCounts[catKey] ?? 0
      const maxDays = CATEGORY_MAX_DAYS[catKey]
      return maxDays != null ? Math.min(raw, maxDays * WORDS_PER_DAY) : raw
    }
    const classifiedSituationTotal = situationCats
      .filter((c) => c.filter.startsWith('classified:'))
      .reduce((sum, c) => sum + (cloudCounts[c.key] ?? 0), 0)
    const situationTotal = CATEGORY_DECK_NAMES.reduce((sum, n) => sum + getDisplayCount(n), 0) + classifiedSituationTotal
    const subjectTotal = subjectCats.reduce((sum, c) => sum + (cloudCounts[c.key] ?? 0), 0)
    const posTotal = posCats.reduce((sum, c) => sum + (cloudCounts[c.key] ?? 0), 0)

    const renderCategoryGrid = (cats: CategoryEntry[], borderStyle: string) => (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {cats.map((cat) => {
          const isSituation = cat.group === 'situation'
          const isClassifiedSituation = isSituation && cat.filter.startsWith('classified:')
          const deck = (isSituation && !isClassifiedSituation) ? safeDecks.find((d) => d.name === cat.koLabel) : null
          if (isSituation && !isClassifiedSituation && !deck) return null
          const rawCount = cloudCounts[cat.key] ?? (isSituation && !isClassifiedSituation ? (cloudCounts[cat.koLabel] ?? 0) : 0)
          const count = (isSituation && !isClassifiedSituation) ? getDisplayCount(cat.koLabel) : rawCount

          const handleClick = () => {
            if (isSituation && !isClassifiedSituation && deck) {
              openDeck(deck.id)
            } else {
              openCategoryFilter(cat.filter, lang === 'sw' ? cat.swLabel : cat.koLabel)
            }
          }

          return (
            <button
              key={cat.key}
              onClick={handleClick}
              className={`flex flex-col items-start rounded-2xl p-4 sm:p-5 text-left transition hover:bg-white/8 active:scale-[0.98] app-card backdrop-blur touch-target ${borderStyle}`}
            >
              <span className="text-2xl sm:text-3xl">{cat.emoji}</span>
              <div className="mt-2 sm:mt-3 text-base sm:text-lg font-extrabold text-white">
                {lang === 'sw' ? cat.swLabel : cat.koLabel}
              </div>
              <div className="mt-1 text-xs sm:text-sm font-semibold text-white/50">
                📚 {count.toLocaleString()} {wordsLabel}
              </div>
            </button>
          )
        })}
      </div>
    )

    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">
              📚 {lang === 'sw' ? 'Msamiati kwa Kundi' : STUDY_PARENT_NAME}
            </div>
            <div className="mt-1 text-xs sm:text-sm font-semibold text-white/60">
              {lang === 'sw'
                ? `${CATEGORY_INFO.length} makundi`
                : `${CATEGORY_INFO.length}개 카테고리`}
            </div>
          </div>
          <Button variant="secondary" onClick={() => { setShowCategoriesState(false); window.history.back() }}>
            {t('backToList', lang)}
          </Button>
        </div>

        {/* 상황별 */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-lg">🌍</span>
            <span className="text-sm sm:text-base font-bold text-white/80">
              {lang === 'sw' ? 'Kwa Hali' : '상황별'}
            </span>
            <span className="text-xs font-semibold text-white/40">
              {situationTotal.toLocaleString()} {wordsLabel}
            </span>
          </div>
          {renderCategoryGrid(situationCats, 'border border-white/15')}
        </div>

        {/* 주제별 */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-lg">📚</span>
            <span className="text-sm sm:text-base font-bold text-white/80">
              {lang === 'sw' ? 'Kwa Mada' : '주제별'}
            </span>
            <span className="text-xs font-semibold text-white/40">
              {subjectTotal.toLocaleString()} {wordsLabel}
            </span>
          </div>
          {renderCategoryGrid(subjectCats, 'border border-amber-400/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5')}
        </div>

        {/* 품사별 */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-lg">📖</span>
            <span className="text-sm sm:text-base font-bold text-white/80">
              {lang === 'sw' ? 'Kwa Aina ya Neno' : '품사별'}
            </span>
            <span className="text-xs font-semibold text-white/40">
              {posTotal.toLocaleString()} {wordsLabel}
            </span>
          </div>
          {renderCategoryGrid(posCats, 'border border-teal-400/20 bg-gradient-to-br from-teal-500/5 to-cyan-500/5')}
        </div>
      </div>
    )
  }

  if (shouldShowLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative">
          <div className="text-6xl sm:text-7xl animate-bounce">📚</div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-3 bg-black/20 rounded-full blur-sm animate-pulse" />
        </div>
        <div className="mt-6 text-lg sm:text-xl font-bold text-white">
          {lang === 'sw' ? 'Inapakia maneno...' : '단어 로딩 중...'}
        </div>
        <div className="mt-2 text-sm text-white/60">
          {lang === 'sw' ? 'Tafadhali subiri' : '잠시만 기다려주세요'}
        </div>
        <div className="mt-6 flex gap-1.5">
          <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
          <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 오답노트 위젯 */}
      {flashcardWrongCount > 0 && (
        <button
          onClick={goToWrongNote}
          className="w-full rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-rose-500/20 to-orange-500/20 border border-rose-400/30 hover:from-rose-500/30 hover:to-orange-500/30 transition active:scale-[0.99] backdrop-blur touch-target"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="text-3xl sm:text-4xl">📝</span>
              <div className="text-left">
                <div className="text-lg sm:text-xl font-extrabold text-white">
                  {lang === 'sw' ? 'Orodha ya Makosa' : '오답노트'}
                </div>
                <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-rose-300">
                  {String(flashcardWrongCount)} {lang === 'sw' ? 'maneno ya kurudia' : '개 단어 복습 필요'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-xl sm:rounded-2xl bg-rose-500/30 px-3 py-1.5 sm:px-4 sm:py-2 text-xl sm:text-2xl font-extrabold text-rose-300">
                {String(flashcardWrongCount)}
              </div>
              <div className="text-xl sm:text-2xl text-rose-400">→</div>
            </div>
          </div>
        </button>
      )}

      <div className="rounded-3xl p-4 sm:p-5 app-banner backdrop-blur">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{t('wordbookTitle', lang)} ({String(safeDecks.filter((d) => !CATEGORY_DECK_NAMES.includes(d.name) && !LEVEL_DECK_NAMES.includes(d.name)).length + 1 + LEVEL_DECK_NAMES.length)})</div>
            <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/70">{t('wordbookDesc', lang)}</div>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} className="shrink-0">
            {t('newWordbook', lang)}
          </Button>
        </div>

        {/* 단어장 목록 */}
        <div className="mt-4 sm:mt-5 grid gap-2.5 sm:gap-3">
          {/* 사용자 단어장 (카테고리/난이도 덱 제외) */}
          {safeDecks
            .slice()
            .filter((d) => {
              const name = String(d?.name ?? '')
              return !CATEGORY_DECK_NAMES.includes(name) && !LEVEL_DECK_NAMES.includes(name) && name !== '모든 단어' && name !== DICTIONARY_DECK_NAME
            })
            .sort((a, b) => {
              const aTime = typeof a?.updatedAt === 'number' ? a.updatedAt : 0
              const bTime = typeof b?.updatedAt === 'number' ? b.updatedAt : 0
              return bTime - aTime
            })
            .map((d) => {
              const deckId = String(d?.id ?? '')
              const deckName = String(d?.name ?? '')
              const count = safeItems.filter((x) => x?.deckId === deckId).length

              return (
                <button
                  key={deckId}
                  onClick={() => openDeck(deckId)}
                  className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{translateDeckName(deckName)}</div>
                    <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                      <span className="app-chip">📚 {String(count)} {wordsLabel}</span>
                    </div>
                  </div>
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                    ▼
                  </div>
                </button>
              )
            })}

          {/* 난이도별 상위 단어장 (입문/초급/중급/고급) */}
          {LEVEL_INFO.map((lv) => {
            const deck = safeDecks.find((d) => d.name === lv.name)
            if (!deck) return null
            const count = cloudCounts[lv.name] ?? 0
            return (
              <button
                key={deck.id}
                onClick={() => openDeck(deck.id)}
                className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl">{lv.emoji}</span>
                    <span className="text-xl sm:text-2xl font-extrabold text-white truncate">{lang === 'sw' ? lv.swLabel : lv.name}</span>
                  </div>
                  <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                    <span className="app-chip">📚 {count.toLocaleString()} {wordsLabel}</span>
                  </div>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                  ▼
                </div>
              </button>
            )
          })}

          {/* 학습 단어장 (상황별 카테고리 부모) */}
          <button
            onClick={openCategories}
            className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-indigo-400/25 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 touch-target"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xl sm:text-2xl font-extrabold text-white truncate">
                📚 {lang === 'sw' ? 'Msamiati kwa Kundi' : STUDY_PARENT_NAME}
              </div>
              <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                <span className="app-chip">📚 {CATEGORY_DECK_NAMES.reduce((sum, n) => {
                  const raw = cloudCounts[n] ?? 0
                  const maxDays = CATEGORY_MAX_DAYS[n]
                  return sum + (maxDays != null ? Math.min(raw, maxDays * WORDS_PER_DAY) : raw)
                }, 0).toLocaleString()} {wordsLabel}</span>
                <span className="app-chip">{CATEGORY_INFO.length} {lang === 'sw' ? 'makundi' : '개 하위 단어장'}</span>
              </div>
            </div>
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/15 text-white/70 shrink-0 ml-2">
              ▼
            </div>
          </button>

          {/* 사전 */}
          {(() => {
            const dictDeck = safeDecks.find((d) => d.name === DICTIONARY_DECK_NAME)
            if (!dictDeck) return null
            const count = safeItems.filter((x) => x?.deckId === dictDeck.id).length
            return (
              <button
                key={dictDeck.id}
                onClick={() => openDeck(dictDeck.id)}
                className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{translateDeckName(DICTIONARY_DECK_NAME)}</div>
                  <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                    <span className="app-chip">📚 {String(count)} {wordsLabel}</span>
                  </div>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                  ▼
                </div>
              </button>
            )
          })()}

          {/* 모든 단어 */}
          {(() => {
            const allDeck = safeDecks.find((d) => d.name === '모든 단어')
            if (!allDeck) return null
            const count = (cloudCounts['모든 단어'] ?? 0) + safeItems.length
            return (
              <button
                key={allDeck.id}
                onClick={() => openDeck(allDeck.id)}
                className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{translateDeckName('모든 단어')}</div>
                  <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                    <span className="app-chip">📚 {count.toLocaleString()} {wordsLabel}</span>
                  </div>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                  ▼
                </div>
              </button>
            )
          })()}
        </div>
      </div>

      <Modal
        open={createOpen}
        title={t('newWordbookModal', lang)}
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('cancel', lang)}
            </Button>
            <Button onClick={createDeck}>{t('create', lang)}</Button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-sm font-semibold text-white/80">{t('wordbookName', lang)}</div>
          <Input value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder={t('wordbookNamePlaceholder', lang)} />
          <div className="text-xs font-semibold text-white/60">{t('wordbookNameHint', lang)}</div>
        </div>
      </Modal>
    </div>
  )
}
