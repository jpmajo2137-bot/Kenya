import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Button } from '../components/Button'
import type { Lang } from '../lib/i18n'
import type { VocabItem, Deck } from '../lib/types'
import type { Action } from '../app/state'
import { WordbookScreen } from './WordbookScreen'
import { FlashcardScreen } from './FlashcardScreen'

const WORDS_PER_DAY = 40

export function DictionaryDayList({
  lang,
  items,
  decks,
  deckId,
  showEnglish,
  dispatch,
}: {
  lang: Lang
  items: VocabItem[]
  decks: Deck[]
  deckId: string
  showEnglish: boolean
  dispatch: (a: Action) => void
}) {
  const [selectedDay, setSelectedDayState] = useState<number | null>(null)
  const [flashcardDay, setFlashcardDayState] = useState<number | null>(null)
  const [allFlashcard, setAllFlashcard] = useState(false)

  const didReplaceInitialState = useRef(false)
  useEffect(() => {
    if (!didReplaceInitialState.current) {
      didReplaceInitialState.current = true
      window.history.replaceState({ screen: 'dictDayList' }, '')
    }
  }, [])

  const selectDay = (day: number) => {
    window.history.pushState({ screen: 'dictWordList', day }, '')
    setSelectedDayState(day)
  }

  const startFlashcard = (day: number) => {
    window.history.pushState({ screen: 'dictFlashcard', day }, '')
    setFlashcardDayState(day)
  }

  const startAllFlashcard = () => {
    window.history.pushState({ screen: 'dictAllFlashcard' }, '')
    setAllFlashcard(true)
  }

  const closeFlashcard = useCallback(() => {
    setFlashcardDayState(null)
    setAllFlashcard(false)
  }, [])

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { screen?: string } | null

      if (allFlashcard && state?.screen !== 'dictAllFlashcard') {
        setAllFlashcard(false)
        return
      }
      if (flashcardDay !== null && state?.screen !== 'dictFlashcard') {
        setFlashcardDayState(null)
        return
      }
      if (selectedDay !== null && state?.screen !== 'dictWordList') {
        setSelectedDayState(null)
        return
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [flashcardDay, selectedDay, allFlashcard])

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.createdAt - b.createdAt),
    [items],
  )

  const totalDays = Math.ceil(sorted.length / WORDS_PER_DAY)

  const getItemsForDay = useCallback(
    (day: number) => {
      const start = (day - 1) * WORDS_PER_DAY
      const end = day * WORDS_PER_DAY
      return sorted.slice(start, end)
    },
    [sorted],
  )

  if (allFlashcard && items.length > 0) {
    return (
      <FlashcardScreen
        lang={lang}
        mode={lang === 'sw' ? 'sw' : 'ko'}
        onClose={closeFlashcard}
        userWords={items}
      />
    )
  }

  if (flashcardDay !== null) {
    const dayItems = getItemsForDay(flashcardDay)
    if (dayItems.length > 0) {
      return (
        <FlashcardScreen
          lang={lang}
          mode={lang === 'sw' ? 'sw' : 'ko'}
          onClose={closeFlashcard}
          userWords={dayItems}
        />
      )
    }
  }

  if (selectedDay !== null) {
    const dayItems = getItemsForDay(selectedDay)
    const startWord = (selectedDay - 1) * WORDS_PER_DAY + 1
    const endWord = Math.min(selectedDay * WORDS_PER_DAY, sorted.length)

    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-3xl p-3 sm:p-4 app-card backdrop-blur">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold text-white">
              Day {selectedDay}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-white/60">
              ({startWord} ~ {endWord})
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => startFlashcard(selectedDay)}
              className="rounded-xl px-3 py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white hover:from-indigo-500/50 hover:to-purple-500/50 active:scale-95 transition border border-indigo-400/30 touch-target"
            >
              📇 {lang === 'sw' ? 'Kadi' : '카드'}
            </button>
            <Button variant="secondary" onClick={() => window.history.back()}>
              {lang === 'sw' ? 'Rudi' : '목록'}
            </Button>
          </div>
        </div>
        <WordbookScreen
          items={dayItems}
          decks={decks}
          fixedDeckId={deckId}
          showEnglish={showEnglish}
          dispatch={dispatch}
          lang={lang}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg sm:text-xl font-extrabold text-white">
              {lang === 'sw' ? 'Kamusi' : '사전'} - {lang === 'sw' ? 'Chagua Siku' : 'Day 선택'}
            </div>
            <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/60">
              {lang === 'sw'
                ? `Jumla: ${sorted.length.toLocaleString()} maneno (${totalDays} siku)`
                : `총 ${sorted.length.toLocaleString()}개 단어 (${totalDays}일)`}
            </div>
          </div>
          {items.length > 0 && (
            <button
              onClick={startAllFlashcard}
              className="rounded-xl px-3 py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white hover:from-indigo-500/50 hover:to-purple-500/50 active:scale-95 transition border border-indigo-400/30 touch-target shrink-0"
            >
              📇 {lang === 'sw' ? 'Kadi Zote' : '전체 카드'}
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-3xl p-8 text-center app-card backdrop-blur">
          <p className="text-4xl mb-3">📖</p>
          <p className="text-sm font-bold text-white/50">
            {lang === 'ko'
              ? '사전에서 단어를 검색하고 저장해 보세요!'
              : 'Tafuta maneno kwenye kamusi na uhifadhi!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const startWord = (day - 1) * WORDS_PER_DAY + 1
            const endWord = Math.min(day * WORDS_PER_DAY, sorted.length)
            const dayItems = getItemsForDay(day)
            const isIncomplete = dayItems.length < WORDS_PER_DAY && day === totalDays

            return (
              <div
                key={day}
                className="rounded-2xl p-3 sm:p-4 app-card backdrop-blur border border-white/15"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div>
                    <div className="text-base sm:text-lg font-extrabold text-white">
                      Day {day}
                    </div>
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
    </div>
  )
}
