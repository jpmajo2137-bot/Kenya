import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Button } from '../components/Button'
import type { Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { CloudAllWordsScreen } from './CloudAllWordsScreen'
import { FlashcardScreen, getWrongAnswersCount } from './FlashcardScreen'
import type { VocabItem } from '../lib/types'
import {
  parseLevelFilter,
  buildTopicOrCondition,
  getClassifiedDisplayCount,
  getOrderedCount,
  CATEGORY_MAX_DAYS,
  CLASSIFIED_MAX_DAYS,
  CATEGORY_WORD_EXCLUSIONS,
  POS_WORD_EXCLUSIONS,
  GLOBAL_WORD_EXCLUSIONS,
  getAllWordsNumberTailIds,
  ORDERED_WORDS_PER_DAY,
  getClassifiedInclusions,
  getClassifiedWordIds,
  CLASSIFIED_WORD_EXCLUSIONS,
  CLASSIFIED_EXTRA_WORDS,
  buildClassifiedDisplayList,
} from '../lib/filterUtils'
import { applyEnOverride } from '../lib/displayOverrides'

const DEFAULT_WORDS_PER_DAY = 40

type Mode = 'sw' | 'ko'

export function AllWordsDayList({
  lang,
  mode,
  showEnglish,
  levelFilter = '',
  title,
  userItems = [],
  dictionaryDeckId,
}: {
  lang: Lang
  mode: Mode
  showEnglish: boolean
  levelFilter?: string
  title?: string
  userItems?: VocabItem[]
  dictionaryDeckId?: string
}) {
  const [totalCount, setTotalCount] = useState(0)
  const [selectedDay, setSelectedDayState] = useState<number | null>(null)
  const [flashcardDay, setFlashcardDayState] = useState<number | null>(null)
  const [userFlashcardMode, setUserFlashcardMode] = useState(false)
  const [dictSelectedDay, setDictSelectedDay] = useState<number | null>(null)
  const [dictFlashcardDay, setDictFlashcardDay] = useState<number | null>(null)
  const [dictAllFlashcard, setDictAllFlashcard] = useState(false)
  const [loading, setLoading] = useState(true)
  const [, setWrongCount] = useState(getWrongAnswersCount(mode))

  const dictItems = useMemo(() => {
    if (!dictionaryDeckId) return []
    return userItems
      .filter((x) => x.deckId === dictionaryDeckId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }, [userItems, dictionaryDeckId])

  const otherUserItems = useMemo(() => {
    if (!dictionaryDeckId) return userItems
    return userItems.filter((x) => x.deckId !== dictionaryDeckId)
  }, [userItems, dictionaryDeckId])

  const dictTotalDays = Math.ceil(dictItems.length / DEFAULT_WORDS_PER_DAY)

  const getDictItemsForDay = useCallback(
    (day: number) => {
      const start = (day - 1) * DEFAULT_WORDS_PER_DAY
      return dictItems.slice(start, start + DEFAULT_WORDS_PER_DAY)
    },
    [dictItems],
  )

  // 컴포넌트 마운트 시 history state 교체 (Day 선택 화면) - replaceState로 중복 방지
  const didReplaceInitialState = useRef(false)
  useEffect(() => {
    if (!didReplaceInitialState.current) {
      didReplaceInitialState.current = true
      // pushState 대신 replaceState로 기존 history를 교체 (두 번 클릭 문제 해결)
      window.history.replaceState({ screen: 'dayList' }, '')
    }
  }, [])

  // 상태 변경 시 history 추가하는 wrapper 함수들
  const selectDay = (day: number) => {
    window.history.pushState({ screen: 'wordList', day }, '')
    setSelectedDayState(day)
  }

  const startFlashcard = (day: number) => {
    window.history.pushState({ screen: 'flashcard', day }, '')
    setFlashcardDayState(day)
  }

  const startUserFlashcard = () => {
    window.history.pushState({ screen: 'userFlashcard' }, '')
    setUserFlashcardMode(true)
  }

  const selectDictDay = (day: number) => {
    window.history.pushState({ screen: 'dictWordList', day }, '')
    setDictSelectedDay(day)
  }

  const startDictFlashcard = (day: number) => {
    window.history.pushState({ screen: 'dictFlashcard', day }, '')
    setDictFlashcardDay(day)
  }

  const startDictAllFlashcard = () => {
    window.history.pushState({ screen: 'dictAllFlashcard' }, '')
    setDictAllFlashcard(true)
  }

  const closeFlashcard = useCallback(() => {
    setFlashcardDayState(null)
    setUserFlashcardMode(false)
    setDictFlashcardDay(null)
    setDictAllFlashcard(false)
    setWrongCount(getWrongAnswersCount(mode))
  }, [mode])

  // 뒤로가기 핸들러
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { screen?: string } | null

      if (dictAllFlashcard && state?.screen !== 'dictAllFlashcard') {
        setDictAllFlashcard(false)
        setWrongCount(getWrongAnswersCount(mode))
        return
      }
      if (dictFlashcardDay !== null && state?.screen !== 'dictFlashcard') {
        setDictFlashcardDay(null)
        setWrongCount(getWrongAnswersCount(mode))
        return
      }
      if (dictSelectedDay !== null && state?.screen !== 'dictWordList') {
        setDictSelectedDay(null)
        return
      }
      if (userFlashcardMode && state?.screen !== 'userFlashcard') {
        setUserFlashcardMode(false)
        setWrongCount(getWrongAnswersCount(mode))
        return
      }
      if (flashcardDay !== null && state?.screen !== 'flashcard') {
        setFlashcardDayState(null)
        setWrongCount(getWrongAnswersCount(mode))
        return
      }
      if (selectedDay !== null && state?.screen !== 'wordList') {
        setSelectedDayState(null)
        return
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [flashcardDay, selectedDay, userFlashcardMode, dictSelectedDay, dictFlashcardDay, dictAllFlashcard, mode])

  useEffect(() => {
    const fetchCount = async () => {
      if (!supabase) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const pf = parseLevelFilter(levelFilter)
        if (pf.disabled) {
          setTotalCount(0)
          setLoading(false)
          return
        }
        if (pf.ordered) {
          setTotalCount(getOrderedCount(pf.ordered, mode))
          setLoading(false)
          return
        }
        if (pf.classified) {
          const topic = pf.classified
          if (supabase) {
            try {
              const inclusions = getClassifiedInclusions(topic, mode)
              let list: { word?: string | null; meaning_ko?: string | null }[] = []
              if (inclusions?.length) {
                const { data, error } = await supabase
                  .from('generated_vocab')
                  .select('*')
                  .eq('mode', mode)
                  .in('word', inclusions)
                  .order('created_at', { ascending: true })
                if (error) throw error
                list = (data ?? []).filter((r: { word?: string | null }) => !r.word?.startsWith('__deleted__'))
                list = list.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
              } else {
                const ids = getClassifiedWordIds(topic, mode)
                if (ids.length === 0) {
                  setTotalCount(0)
                  setLoading(false)
                  return
                }
                const BATCH = 100
                let allData: { word?: string | null; meaning_ko?: string | null }[] = []
                for (let i = 0; i < ids.length; i += BATCH) {
                  const chunk = ids.slice(i, i + BATCH)
                  const { data, error } = await supabase
                    .from('generated_vocab')
                    .select('*')
                    .eq('mode', mode)
                    .in('id', chunk)
                    .order('created_at', { ascending: true })
                  if (error) throw error
                  allData = allData.concat(data ?? [])
                }
                list = allData.filter((r) => !r.word?.startsWith('__deleted__'))
                const exclusions = CLASSIFIED_WORD_EXCLUSIONS[topic]
                if (exclusions?.length) {
                  list = list.filter((r) => !exclusions.includes(r.word ?? ''))
                }
                list = list.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
                const extraWords = CLASSIFIED_EXTRA_WORDS[topic]
                if (extraWords?.length) {
                  const existingWords = new Set(list.map((r) => r.word))
                  const missing = extraWords.filter((w) => !existingWords.has(w))
                  if (missing.length) {
                    const { data: extraData } = await supabase
                      .from('generated_vocab')
                      .select('*')
                      .eq('mode', mode)
                      .in('word', missing)
                    if (extraData?.length) {
                      list.push(
                        ...extraData.filter(
                          (r: { word?: string | null }) => !r.word?.startsWith('__deleted__'),
                        ),
                      )
                    }
                  }
                }
              }
              const finalList = buildClassifiedDisplayList(list, topic, mode)
              setTotalCount(finalList.length)
            } catch {
              setTotalCount(getClassifiedDisplayCount(topic, mode, DEFAULT_WORDS_PER_DAY))
            }
          } else {
            setTotalCount(getClassifiedDisplayCount(topic, mode, DEFAULT_WORDS_PER_DAY))
          }
          setLoading(false)
          return
        }
        // 카테고리/품사 제외 단어가 있으면 전체 조회 후 필터링하여 정확한 개수 사용
        const catExcl = pf.category ? CATEGORY_WORD_EXCLUSIONS[pf.category] : null
        const posExcl = pf.pos ? POS_WORD_EXCLUSIONS[pf.pos] : null
        if ((pf.category && catExcl?.length) || (pf.pos && posExcl?.length)) {
          try {
            let catQuery = supabase
              .from('generated_vocab')
              .select('word')
              .eq('mode', mode)
            if (pf.category) catQuery = catQuery.eq('category', pf.category)
            if (pf.pos) catQuery = catQuery.eq('pos', pf.pos)
            const { data } = await catQuery
              .order('created_at', { ascending: true })
              .limit(2000)
            let cleaned = (data ?? []).filter((r: { word?: string | null }) => !(r.word ?? '').startsWith('__deleted__'))
            cleaned = cleaned.filter((r: { word?: string | null }) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
            if (catExcl?.length) {
              const exclSet = new Set(catExcl)
              cleaned = cleaned.filter((r: { word?: string | null }) => !exclSet.has(r.word ?? ''))
            }
            if (posExcl?.length) {
              const exclSet = new Set(posExcl)
              cleaned = cleaned.filter((r: { word?: string | null }) => !exclSet.has(r.word ?? ''))
            }
            setTotalCount(cleaned.length)
          } catch {
            const { count } = await supabase
              .from('generated_vocab')
              .select('*', { count: 'exact', head: true })
              .eq('mode', mode)
              .eq('category', pf.category ?? '')
            setTotalCount(count ?? 0)
          }
          setLoading(false)
          return
        }
        const isAllWords = !pf.category && !pf.pos && !pf.topic
        const numberTailIds = isAllWords ? getAllWordsNumberTailIds(mode) : []
        if (numberTailIds.length > 0) {
          const { count: nonNumCount } = await supabase
            .from('generated_vocab')
            .select('*', { count: 'exact', head: true })
            .eq('mode', mode)
            .not('id', 'in', `(${numberTailIds.join(',')})`)
          setTotalCount((nonNumCount ?? 0) + numberTailIds.length)
          setLoading(false)
          return
        }
        let query = supabase
          .from('generated_vocab')
          .select('*', { count: 'exact', head: true })
          .eq('mode', mode)
        if (pf.category) query = query.eq('category', pf.category)
        if (pf.pos) query = query.eq('pos', pf.pos)
        if (pf.topic) {
          const orCond = buildTopicOrCondition(pf.topic, mode)
          if (orCond) query = query.or(orCond)
        }
        const { count } = await query
        setTotalCount(count ?? 0)
      } catch {
        // 에러 처리
      }
      setLoading(false)
    }
    void fetchCount()
  }, [mode, levelFilter])

  const pf = parseLevelFilter(levelFilter)
  const WORDS_PER_DAY = (pf.ordered && ORDERED_WORDS_PER_DAY[pf.ordered]) || DEFAULT_WORDS_PER_DAY
  const maxDays = pf.classified ? CLASSIFIED_MAX_DAYS[pf.classified] : (pf.category ? CATEGORY_MAX_DAYS[pf.category] : undefined)
  const totalDays = maxDays != null
    ? Math.min(Math.ceil(totalCount / WORDS_PER_DAY), maxDays)
    : Math.ceil(totalCount / WORDS_PER_DAY)
  const displayTotalCount = maxDays != null
    ? Math.min(totalCount, maxDays * WORDS_PER_DAY)
    : totalCount

  // 사전 전체 플래시카드
  if (dictAllFlashcard && dictItems.length > 0) {
    return (
      <FlashcardScreen
        lang={lang}
        mode={mode}
        onClose={closeFlashcard}
        userWords={dictItems}
      />
    )
  }

  // 사전 Day별 플래시카드
  if (dictFlashcardDay !== null) {
    const dayItems = getDictItemsForDay(dictFlashcardDay)
    if (dayItems.length > 0) {
      return (
        <FlashcardScreen
          lang={lang}
          mode={mode}
          onClose={closeFlashcard}
          userWords={dayItems}
        />
      )
    }
  }

  // 사전 Day 단어 목록
  if (dictSelectedDay !== null) {
    const dayItems = getDictItemsForDay(dictSelectedDay)
    const startWord = (dictSelectedDay - 1) * WORDS_PER_DAY + 1
    const endWord = Math.min(dictSelectedDay * WORDS_PER_DAY, dictItems.length)
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-3xl p-3 sm:p-4 app-card backdrop-blur">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold text-white">
              📖 {lang === 'sw' ? 'Kamusi' : '사전'} Day {dictSelectedDay}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-white/60">
              ({startWord} ~ {endWord})
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => startDictFlashcard(dictSelectedDay)}
              className="rounded-xl px-3 py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white hover:from-indigo-500/50 hover:to-purple-500/50 active:scale-95 transition border border-indigo-400/30 touch-target"
            >
              📇 {lang === 'sw' ? 'Kadi' : '카드'}
            </button>
            <Button variant="secondary" onClick={() => window.history.back()}>
              {lang === 'sw' ? 'Rudi' : '목록'}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {dayItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl p-3 bg-white/5 border border-white/10"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-extrabold text-white">{item.sw}</div>
                  <div className="text-sm font-semibold text-white/80 mt-0.5">{item.ko}</div>
                  {showEnglish && item.en && (
                    <div className="text-xs text-white/60 mt-0.5">
                      {applyEnOverride(item.en.trim(), item.sw) ?? item.en}
                    </div>
                  )}
                </div>
              </div>
              {item.example && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="text-xs text-cyan-400">{item.example}</div>
                  {item.exampleKo && (
                    <div className="text-xs text-white/60 mt-0.5">{item.exampleKo}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 사용자 단어 플래시카드 모드
  if (userFlashcardMode && otherUserItems.length > 0) {
    return (
      <FlashcardScreen
        lang={lang}
        mode={mode}
        onClose={closeFlashcard}
        userWords={otherUserItems}
      />
    )
  }

  // 플래시카드 모드
  if (flashcardDay !== null) {
    return (
      <FlashcardScreen
        lang={lang}
        mode={mode}
        levelFilter={levelFilter}
        dayNumber={flashcardDay}
        wordsPerDay={WORDS_PER_DAY}
        onClose={closeFlashcard}
      />
    )
  }

  // Day 선택 시 해당 Day의 단어 표시
  if (selectedDay !== null) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-3xl p-3 sm:p-4 app-card backdrop-blur">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold text-white">
              Day {selectedDay}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-white/60">
              ({(selectedDay - 1) * WORDS_PER_DAY + 1} ~ {Math.min(selectedDay * WORDS_PER_DAY, displayTotalCount)})
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <Button variant="secondary" onClick={() => window.history.back()}>
              {lang === 'sw' ? 'Rudi' : '목록'}
            </Button>
          </div>
        </div>
        <CloudAllWordsScreen
          lang={lang}
          mode={mode}
          showEnglish={showEnglish}
          levelFilter={levelFilter}
          dayNumber={selectedDay}
          wordsPerDay={WORDS_PER_DAY}
        />
      </div>
    )
  }

  // 카테고리별 타이틀
  const categoryTranslations: Record<string, string> = {
    '입문': 'Utangulizi',
    '초급': 'Mwanzo',
    '중급': 'Kati',
    '고급': 'Juu',
    '여행': 'Safari',
    '비즈니스': 'Biashara',
    '쇼핑': 'Ununuzi',
    '위기탈출': 'Dharura',
    'classified:집/생활용품': 'Nyumba/Vifaa',
    'classified:신체/건강': 'Mwili/Afya',
    'classified:시간/날짜': 'Wakati/Tarehe',
  }

  const posDisplayNames: Record<string, { ko: string; sw: string }> = {
    noun: { ko: '명사', sw: 'Nomino' },
    verb: { ko: '동사', sw: 'Kitenzi' },
    adjective: { ko: '형용사', sw: 'Kivumishi' },
    adverb: { ko: '부사', sw: 'Kielezi' },
    phrase: { ko: '구/표현', sw: 'Msemo' },
  }

  const orderedDisplayNames: Record<string, { ko: string; sw: string }> = {
    '숫자1-50': { ko: '숫자', sw: 'Namba' },
  }

  const resolveLevelLabel = (lf: string): string => {
    if (lf === 'classified:인사/기본표현') return lang === 'sw' ? 'Salamu' : '인사'
    if (lf.startsWith('pos:')) {
      const pos = lf.slice(4)
      return posDisplayNames[pos]?.[lang === 'sw' ? 'sw' : 'ko'] ?? pos
    }
    if (lf.startsWith('ordered:')) {
      const key = lf.slice(8)
      return orderedDisplayNames[key]?.[lang === 'sw' ? 'sw' : 'ko'] ?? key
    }
    if (lf.startsWith('classified:')) {
      const raw = lf.slice(11)
      return lang === 'sw' ? (categoryTranslations[lf] || raw) : raw
    }
    return lang === 'sw' ? (categoryTranslations[lf] || lf) : lf
  }

  const displayTitle = title || (levelFilter
    ? resolveLevelLabel(levelFilter)
    : (lang === 'sw' ? 'Maneno Yote' : '모든 단어'))

  // Day 목록 표시
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
        <div className="text-lg sm:text-xl font-extrabold text-white">
          {displayTitle} - {lang === 'sw' ? 'Chagua Siku' : 'Day 선택'}
        </div>
        <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/60">
          {lang === 'sw' 
            ? `Jumla: ${displayTotalCount.toLocaleString()} maneno (${totalDays} siku)`
            : `총 ${displayTotalCount.toLocaleString()}개 단어 (${totalDays}일)`}
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl p-5 sm:p-6 text-center app-card backdrop-blur">
          <div className="text-xs sm:text-sm font-semibold text-white/70">
            {lang === 'sw' ? 'Inapakia...' : '불러오는 중...'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const startWord = (day - 1) * WORDS_PER_DAY + 1
            const endWord = Math.min(day * WORDS_PER_DAY, displayTotalCount)
            return (
              <div
                key={day}
                className="rounded-2xl p-3 sm:p-4 app-card backdrop-blur border border-white/15"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div>
                    <div className="text-base sm:text-lg font-extrabold text-white">Day {day}</div>
                    <div className="text-[10px] sm:text-xs font-semibold text-white/50">
                      {startWord}-{endWord}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 sm:gap-2">
                  <button
                    onClick={() => selectDay(day)}
                    className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-white/10 text-white hover:bg-white/20 active:scale-95 transition touch-target"
                  >
                    📚 {lang === 'sw' ? 'Orodha' : '목록'}
                  </button>
                  <button
                    onClick={() => startFlashcard(day)}
                    className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white hover:from-indigo-500/50 hover:to-purple-500/50 active:scale-95 transition border border-indigo-400/30 touch-target"
                  >
                    📇 {lang === 'sw' ? 'Kadi' : '카드'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 사전 단어 Day 섹션 - 모든 단어일 때만 표시 */}
      {!levelFilter && dictItems.length > 0 && (
        <div className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur border border-emerald-500/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg sm:text-xl font-extrabold text-white">
                📖 {lang === 'sw' ? 'Kamusi' : '사전'}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-white/60 mt-1">
                {lang === 'sw'
                  ? `${dictItems.length} maneno (${dictTotalDays} siku)`
                  : `${dictItems.length}개 단어 (${dictTotalDays}일)`}
              </div>
            </div>
            <button
              onClick={startDictAllFlashcard}
              className="rounded-xl px-3 py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-white hover:from-emerald-500/50 hover:to-teal-500/50 active:scale-95 transition border border-emerald-400/30 touch-target shrink-0"
            >
              📇 {lang === 'sw' ? 'Kadi Zote' : '전체 카드'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {Array.from({ length: dictTotalDays }, (_, i) => i + 1).map((day) => {
              const startWord = (day - 1) * WORDS_PER_DAY + 1
              const endWord = Math.min(day * WORDS_PER_DAY, dictItems.length)
              const dayItems = getDictItemsForDay(day)
              const isIncomplete = dayItems.length < WORDS_PER_DAY && day === dictTotalDays
              return (
                <div
                  key={`dict-${day}`}
                  className="rounded-2xl p-3 sm:p-4 bg-white/5 border border-emerald-500/15"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div>
                      <div className="text-base sm:text-lg font-extrabold text-white">Day {day}</div>
                      <div className="text-[10px] sm:text-xs font-semibold text-white/50">
                        {startWord}-{endWord}
                        {isIncomplete && (
                          <span className="ml-1 text-[rgb(var(--orange))]">
                            ({dayItems.length}/{WORDS_PER_DAY})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2">
                    <button
                      onClick={() => selectDictDay(day)}
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-white/10 text-white hover:bg-white/20 active:scale-95 transition touch-target"
                    >
                      📚 {lang === 'sw' ? 'Orodha' : '목록'}
                    </button>
                    <button
                      onClick={() => startDictFlashcard(day)}
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-white hover:from-emerald-500/50 hover:to-teal-500/50 active:scale-95 transition border border-emerald-400/30 touch-target"
                    >
                      📇 {lang === 'sw' ? 'Kadi' : '카드'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 기타 사용자 단어 섹션 - 모든 단어일 때만 표시 */}
      {!levelFilter && otherUserItems.length > 0 && (
        <div className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg sm:text-xl font-extrabold text-white">
                📝 {lang === 'sw' ? 'Maneno Yangu' : '내가 추가한 단어'}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-white/60 mt-1">
                {lang === 'sw'
                  ? `${otherUserItems.length} maneno (yamehifadhiwa kwenye kifaa)`
                  : `${otherUserItems.length}개 단어 (기기에 저장됨)`}
              </div>
            </div>
            <button
              onClick={startUserFlashcard}
              className="rounded-xl px-4 py-2 text-sm font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white hover:from-indigo-500/50 hover:to-purple-500/50 active:scale-95 transition border border-indigo-400/30 touch-target"
            >
              📇 {lang === 'sw' ? 'Kadi' : '카드'}
            </button>
          </div>
          <div className="space-y-2">
            {otherUserItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl p-3 bg-white/5 border border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-extrabold text-white">{item.sw}</div>
                    <div className="text-sm font-semibold text-white/80 mt-0.5">{item.ko}</div>
                    {showEnglish && item.en && (
                      <div className="text-xs text-white/60 mt-0.5">
                        {applyEnOverride(item.en.trim(), item.sw) ?? item.en}
                      </div>
                    )}
                  </div>
                </div>
                {item.example && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="text-xs text-cyan-400">{item.example}</div>
                    {item.exampleKo && (
                      <div className="text-xs text-white/60 mt-0.5">{item.exampleKo}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
