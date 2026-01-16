import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '../components/Button'
import type { Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { CloudAllWordsScreen } from './CloudAllWordsScreen'
import { FlashcardScreen, getWrongAnswersCount } from './FlashcardScreen'
import type { VocabItem } from '../lib/types'

const WORDS_PER_DAY = 40

type Mode = 'sw' | 'ko'

export function AllWordsDayList({
  lang,
  mode,
  showEnglish,
  levelFilter = '',
  title,
  userItems = [],
}: {
  lang: Lang
  mode: Mode
  showEnglish: boolean
  levelFilter?: string
  title?: string
  userItems?: VocabItem[]
}) {
  const [totalCount, setTotalCount] = useState(0)
  const [selectedDay, setSelectedDayState] = useState<number | null>(null)
  const [flashcardDay, setFlashcardDayState] = useState<number | null>(null)
  const [userFlashcardMode, setUserFlashcardMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [, setWrongCount] = useState(getWrongAnswersCount())

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

  const closeFlashcard = useCallback(() => {
    setFlashcardDayState(null)
    setUserFlashcardMode(false)
    setWrongCount(getWrongAnswersCount())
  }, [])

  // 뒤로가기 핸들러
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { screen?: string } | null
      
      // 사용자 단어 flashcard에서 뒤로가기
      if (userFlashcardMode && state?.screen !== 'userFlashcard') {
        setUserFlashcardMode(false)
        setWrongCount(getWrongAnswersCount())
        return
      }
      
      // flashcard에서 뒤로가기
      if (flashcardDay !== null && state?.screen !== 'flashcard') {
        setFlashcardDayState(null)
        setWrongCount(getWrongAnswersCount())
        return
      }
      
      // 단어 목록에서 뒤로가기
      if (selectedDay !== null && state?.screen !== 'wordList') {
        setSelectedDayState(null)
        return
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [flashcardDay, selectedDay, userFlashcardMode])

  useEffect(() => {
    const fetchCount = async () => {
      if (!supabase) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        let query = supabase
          .from('generated_vocab')
          .select('*', { count: 'exact', head: true })
          .eq('mode', mode)
        if (levelFilter) {
          query = query.eq('category', levelFilter)
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

  const totalDays = Math.ceil(totalCount / WORDS_PER_DAY)

  // 사용자 단어 플래시카드 모드
  if (userFlashcardMode && userItems && userItems.length > 0) {
    return (
      <FlashcardScreen
        lang={lang}
        mode={mode}
        onClose={closeFlashcard}
        userWords={userItems}
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
              ({(selectedDay - 1) * WORDS_PER_DAY + 1} ~ {Math.min(selectedDay * WORDS_PER_DAY, totalCount)})
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <Button 
              variant="primary" 
              onClick={() => startFlashcard(selectedDay)}
            >
              📇 {lang === 'sw' ? 'Kadi' : '카드'}
            </Button>
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
  }
  
  const displayTitle = title || (levelFilter 
    ? (lang === 'sw' ? categoryTranslations[levelFilter] || levelFilter : levelFilter)
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
            ? `Jumla: ${totalCount.toLocaleString()} maneno (${totalDays} siku)`
            : `총 ${totalCount.toLocaleString()}개 단어 (${totalDays}일)`}
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
            const endWord = Math.min(day * WORDS_PER_DAY, totalCount)
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

      {/* 사용자 단어 섹션 - 모든 단어일 때만 표시 */}
      {!levelFilter && userItems.length > 0 && (
        <div className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg sm:text-xl font-extrabold text-white">
                📝 {lang === 'sw' ? 'Maneno Yangu' : '내가 추가한 단어'}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-white/60 mt-1">
                {lang === 'sw' 
                  ? `${userItems.length} maneno (yamehifadhiwa kwenye kifaa)`
                  : `${userItems.length}개 단어 (기기에 저장됨)`}
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
            {userItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl p-3 bg-white/5 border border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-extrabold text-white">{item.sw}</div>
                    <div className="text-sm font-semibold text-white/80 mt-0.5">{item.ko}</div>
                    {showEnglish && item.en && (
                      <div className="text-xs text-white/60 mt-0.5">{item.en}</div>
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
