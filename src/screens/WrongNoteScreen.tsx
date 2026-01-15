import { useEffect, useMemo, useState } from 'react'
import type { Action } from '../app/state'
import type { Deck, VocabItem, WrongNoteItem } from '../lib/types'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { t, type Lang } from '../lib/i18n'
import { getWrongAnswerIds, FlashcardScreen, WRONG_ANSWERS_UPDATED_EVENT } from './FlashcardScreen'
import { supabase } from '../lib/supabase'

const WORDS_PER_DAY = 40
const WRONG_ANSWERS_KEY = 'flashcard_wrong_answers'

type CloudWord = {
  id: string
  word: string
  word_audio_url: string | null
  meaning_sw: string | null
  meaning_ko: string | null
  meaning_en: string | null
}

export function WrongNoteScreen({
  decks,
  items,
  wrong,
  dispatch,
  lang,
}: {
  decks: Deck[]
  items: VocabItem[]
  wrong: WrongNoteItem[]
  dispatch: (a: Action) => void
  lang: Lang
}) {
  const [mode, setModeState] = useState<'home' | 'list' | 'dayList'>('home')
  const [cloudWrongWords, setCloudWrongWords] = useState<CloudWord[]>([])
  const [loadingCloud, setLoadingCloud] = useState(false)
  const [cloudWrongIdCount, setCloudWrongIdCount] = useState(0)
  const [cloudFetchFailed, setCloudFetchFailed] = useState(false)
  const [selectedDay, setSelectedDayState] = useState<number | null>(null)
  const [flashcardMode, setFlashcardModeState] = useState(false)

  const notifyWrongAnswersUpdated = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(WRONG_ANSWERS_UPDATED_EVENT))
    }
  }

  // 상태 변경 시 history 추가하는 wrapper 함수들
  const goToDayList = () => {
    window.history.pushState({ wrongNote: 'dayList' }, '')
    setModeState('dayList')
  }

  const goToList = (day: number | null = null) => {
    window.history.pushState({ wrongNote: 'list', day }, '')
    setSelectedDayState(day)
    setModeState('list')
  }

  const startFlashcard = () => {
    window.history.pushState({ wrongNote: 'flashcard' }, '')
    setFlashcardModeState(true)
  }

  const goBack = () => {
    if (flashcardMode) {
      setFlashcardModeState(false)
    } else if (mode === 'list') {
      if (selectedDay !== null) {
        setSelectedDayState(null)
        setModeState('dayList')
      } else {
        setModeState('home')
      }
    } else if (mode === 'dayList') {
      setModeState('home')
    }
  }

  // 뒤로가기 핸들러
  useEffect(() => {
    const handlePopState = () => {
      goBack()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [mode, flashcardMode, selectedDay])

  // 플래시카드 오답노트에서 단어 가져오기
  useEffect(() => {
    const fetchCloudWrongWords = async () => {
      const wrongIds = getWrongAnswerIds()
      setCloudWrongIdCount(wrongIds.length)

      if (wrongIds.length === 0) {
        setCloudWrongWords([])
        setLoadingCloud(false)
        setCloudFetchFailed(false)
        return
      }

      if (!supabase) {
        setCloudWrongWords([])
        setLoadingCloud(false)
        setCloudFetchFailed(true)
        return
      }
      
      setLoadingCloud(true)
      setCloudFetchFailed(false)
      const { data, error } = await supabase
        .from('generated_vocab')
        .select('id, word, word_audio_url, meaning_sw, meaning_ko, meaning_en')
        .in('id', wrongIds)
      
      if (error) {
        console.error('오답노트 불러오기 실패:', error)
        setLoadingCloud(false)
        setCloudFetchFailed(true)
        return
      }

      const fetched = (data ?? []) as CloudWord[]
      setCloudWrongWords(fetched)
      setLoadingCloud(false)

      if (fetched.length !== wrongIds.length) {
        const fetchedIds = new Set(fetched.map((w) => w.id))
        const updated = wrongIds.filter((id) => fetchedIds.has(id))
        try {
          localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(updated))
          setCloudWrongIdCount(updated.length)
        } catch {
          // ignore
        }
      }
    }
    void fetchCloudWrongWords()
  }, [mode, flashcardMode])

  // Day별 단어 그룹
  const totalDays = Math.ceil(cloudWrongWords.length / WORDS_PER_DAY)
  
  const getWordsForDay = (day: number) => {
    const start = (day - 1) * WORDS_PER_DAY
    const end = start + WORDS_PER_DAY
    return cloudWrongWords.slice(start, end)
  }

  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items])
  const rows = useMemo(() => {
    return wrong
      .slice()
      .sort((a, b) => b.lastWrongAt - a.lastWrongAt)
      .map((w) => ({ w, item: byId.get(w.id) }))
      .filter((x) => Boolean(x.item))
  }, [wrong, byId])

  const cloudWrongCount = (loadingCloud || cloudFetchFailed) ? cloudWrongIdCount : cloudWrongWords.length
  const totalWrong = rows.length + cloudWrongCount

  const wrongLabel = lang === 'sw' ? 'Makosa' : '오답'
  const viewWordsLabel = lang === 'sw' ? 'Tazama Maneno ya Makosa' : '오답 단어 보기'
  const totalLabel = lang === 'sw' ? 'Jumla' : '총'
  // const backLabel = lang === 'sw' ? '← Rudi' : '← 돌아가기' // 사용하지 않음
  const resetLabel = lang === 'sw' ? 'Weka upya' : '초기화'
  const resetConfirmMsg = lang === 'sw' ? 'Weka upya orodha ya makosa?' : '오답노트를 초기화할까요?'
  const removeLabel = lang === 'sw' ? 'Ondoa' : '제거'
  const noWrongLabel = lang === 'sw' ? 'Hakuna makosa.' : '오답이 없어요.'

  // 클라우드 오답노트 단어 제거
  const removeCloudWord = (wordId: string) => {
    // 로컬스토리지에서 제거
    try {
      const stored = localStorage.getItem(WRONG_ANSWERS_KEY)
      const current: string[] = stored ? JSON.parse(stored) : []
      const updated = current.filter((id) => id !== wordId)
      localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(updated))
      setCloudWrongWords((prev) => prev.filter((w) => w.id !== wordId))
      setCloudWrongIdCount(updated.length)
      notifyWrongAnswersUpdated()
    } catch {
      // ignore
    }
  }

  // 클라우드 오답노트 전체 삭제
  const clearCloudWrongWords = () => {
    localStorage.removeItem(WRONG_ANSWERS_KEY)
    setCloudWrongWords([])
    setCloudWrongIdCount(0)
    notifyWrongAnswersUpdated()
  }

  if (mode === 'list') {
    // selectedDay가 있으면 해당 Day의 단어만, 없으면 전체
    const displayCloudWords = selectedDay !== null 
      ? getWordsForDay(selectedDay) 
      : cloudWrongWords
    
    const listTitle = selectedDay !== null
      ? `Day ${selectedDay}`
      : viewWordsLabel
    
    const listCount = selectedDay !== null
      ? displayCloudWords.length
      : totalWrong
    
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold text-white">{listTitle}</div>
            <div className="text-xs sm:text-sm font-semibold text-white/70">{totalLabel} {listCount}</div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            {selectedDay !== null && (
              <Button 
                variant="primary" 
                onClick={() => startFlashcard()}
              >
                📇 {lang === 'sw' ? 'Kadi' : '카드'}
              </Button>
            )}
            <Button variant="secondary" onClick={() => goBack()}>
              {lang === 'sw' ? 'Rudi' : '돌아가기'}
            </Button>
            {selectedDay === null && (
              <Button
                variant="danger"
                onClick={() => {
                  const ok = window.confirm(resetConfirmMsg)
                  if (ok) {
                    dispatch({ type: 'wrongClear' })
                    clearCloudWrongWords()
                  }
                }}
              >
                {resetLabel}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:gap-3">
          {/* 로컬 오답 단어 (전체 보기일 때만) */}
          {selectedDay === null && rows.map(({ w, item }) => {
            if (!item) return null
            const deckName = decks.find((d) => d.id === item.deckId)?.name ?? t('wordbook', lang)
            return (
            <div key={item.id} className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                  <div className="text-lg sm:text-xl font-extrabold text-white">{item.sw}</div>
                  <div className="mt-0.5 sm:mt-1 text-sm sm:text-base text-white/85">{item.ko}</div>
                    <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                    <Badge>{deckName}</Badge>
                    <Badge className="border-[rgb(var(--orange))]/25 bg-[rgb(var(--orange))]/15 text-white">
                        {wrongLabel} {w.wrongCount}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => dispatch({ type: 'wrongRemove', id: item.id })}>
                    {removeLabel}
                  </Button>
                </div>
              </div>
            )
          })}

          {/* 플래시카드 오답노트 단어 */}
          {loadingCloud ? (
            <div className="rounded-3xl p-4 sm:p-5 text-center app-card backdrop-blur">
              <div className="text-xs sm:text-sm text-white/70">
                {lang === 'sw' ? 'Inapakia...' : '불러오는 중...'}
              </div>
            </div>
          ) : (
            displayCloudWords.map((word) => {
              const rawMeaning = lang === 'sw' 
                ? (word.meaning_sw || word.meaning_en || '') 
                : (word.meaning_ko || word.meaning_en || '')
              const meaning = rawMeaning.includes(',') ? rawMeaning.split(',')[0].trim() : rawMeaning
              return (
                <div key={word.id} className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-lg sm:text-xl font-extrabold text-white truncate">{word.word}</div>
                        {word.word_audio_url && (
                          <button
                            onClick={() => {
                              const a = new Audio(word.word_audio_url!)
                              void a.play()
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm hover:bg-white/20 active:scale-95 transition touch-target shrink-0"
                          >
                            🔊
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 sm:mt-1 text-sm sm:text-base text-white/85">{meaning}</div>
                      <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                        <Badge className="border-purple-400/25 bg-purple-500/15 text-purple-300">
                          📇 {lang === 'sw' ? 'Flashcard' : '플래시카드'}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="ghost" onClick={() => removeCloudWord(word.id)} className="shrink-0">
                      {removeLabel}
                    </Button>
                  </div>
                </div>
              )
            })
          )}

          {(selectedDay === null ? !rows.length : true) && !displayCloudWords.length && !loadingCloud ? (
          <div className="rounded-3xl p-6 sm:p-8 text-center app-card backdrop-blur">
              {noWrongLabel}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  // 플래시카드 모드
  if (flashcardMode && selectedDay !== null) {
    const dayWords = getWordsForDay(selectedDay)
    return (
      <FlashcardScreen
        lang={lang}
        mode={lang === 'sw' ? 'sw' : 'ko'}
        onClose={() => {
          setFlashcardModeState(false)
          setSelectedDayState(null)
          // 오답노트 홈으로 돌아가기
          setModeState('home')
        }}
        wrongAnswerMode={true}
        wrongWordIds={dayWords.map(w => w.id)}
      />
    )
  }

  // Day 목록 화면
  if (mode === 'dayList') {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-lg sm:text-xl font-extrabold text-white">
                {lang === 'sw' ? 'Orodha ya Makosa - Chagua Siku' : '오답노트 - Day 선택'}
              </div>
              <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/60">
                {lang === 'sw' 
                  ? `Jumla: ${cloudWrongWords.length} maneno (${totalDays} siku)`
                  : `총 ${cloudWrongWords.length}개 단어 (${totalDays}일)`}
              </div>
            </div>
            <Button variant="secondary" onClick={() => goBack()} className="shrink-0">
              {lang === 'sw' ? 'Rudi' : '돌아가기'}
            </Button>
          </div>
        </div>

        {loadingCloud ? (
          <div className="rounded-3xl p-5 sm:p-6 text-center app-card backdrop-blur">
            <div className="text-xs sm:text-sm font-semibold text-white/70">
              {lang === 'sw' ? 'Inapakia...' : '불러오는 중...'}
            </div>
          </div>
        ) : totalDays === 0 ? (
          <div className="rounded-3xl p-6 sm:p-8 text-center app-card backdrop-blur">
            <div className="text-sm sm:text-base text-white/70">
              {lang === 'sw' ? 'Hakuna makosa' : '오답이 없어요'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
              const dayWords = getWordsForDay(day)
              const startWord = (day - 1) * WORDS_PER_DAY + 1
              const endWord = Math.min(day * WORDS_PER_DAY, cloudWrongWords.length)
              return (
                <div
                  key={day}
                  className="rounded-2xl p-3 sm:p-4 app-card backdrop-blur border border-rose-400/20 bg-gradient-to-br from-rose-500/10 to-orange-500/10"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div>
                      <div className="text-base sm:text-lg font-extrabold text-white">Day {day}</div>
                      <div className="text-[10px] sm:text-xs font-semibold text-white/50">
                        {startWord}-{endWord} ({dayWords.length}{lang === 'sw' ? ' maneno' : '개'})
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2">
                    <button
                      onClick={() => goToList(day)}
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-white/10 text-white hover:bg-white/20 active:scale-95 transition touch-target"
                    >
                      📚 {lang === 'sw' ? 'Orodha' : '목록'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDayState(day)
                        startFlashcard()
                      }}
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-rose-500/30 to-orange-500/30 text-white hover:from-rose-500/50 hover:to-orange-500/50 active:scale-95 transition border border-rose-400/30 touch-target"
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

  const wrongNoteTitleLabel = t('wrongNoteTitle', lang)
  const wrongNoteDescLabel = lang === 'sw' ? `${totalWrong} maneno bado hujui` : `${totalWrong}개 단어를 아직 못 외웠어요`
  const unmasteredLabel = lang === 'sw' ? 'Maneno Yasiyojulikana' : '못 외운 단어'
  const quizBtnLabel = lang === 'sw' ? '🎯 Maswali' : '🎯 퀴즈'
  const viewBtnLabel = lang === 'sw' ? '📖 Tazama' : '📖 단어 보기'
  const dayBtnLabel = lang === 'sw' ? 'Kadi za Makosa' : '오답 플래시카드'

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-3xl p-4 sm:p-5 app-banner backdrop-blur">
        <div className="text-xl sm:text-2xl font-extrabold text-white">{wrongNoteTitleLabel}</div>
        <div className="text-xs sm:text-sm font-semibold text-white/70 text-right">{wrongNoteDescLabel}</div>
      </div>

      <div className="rounded-3xl p-4 sm:p-6 app-card backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="text-2xl sm:text-3xl font-extrabold text-[rgb(var(--orange))]">{unmasteredLabel}</div>
          <div className="rounded-xl sm:rounded-2xl bg-[rgb(var(--orange))]/20 px-3 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base font-extrabold text-[rgb(var(--orange))]">
            {totalWrong}
          </div>
        </div>

        <div className="mt-4 sm:mt-5 grid gap-2 sm:gap-3">
          {/* Day별 플래시카드 버튼 */}
          {cloudWrongWords.length > 0 && (
            <Button
              variant="danger"
              className="h-16 sm:h-20 rounded-3xl shadow-lg w-full"
              onClick={() => goToDayList()}
            >
              <span className="text-xl sm:text-[2rem] font-bold">{dayBtnLabel}</span>
            </Button>
          )}
          
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Button
              variant="secondary"
              className="h-14 sm:h-16 rounded-3xl shadow-lg text-base sm:text-lg font-bold"
              onClick={() => dispatch({ type: 'settings', patch: { bottomTab: 'quiz', quizSource: 'wrong' } })}
              disabled={!totalWrong}
            >
              {quizBtnLabel}
            </Button>
            <Button 
              className="h-14 sm:h-16 rounded-3xl shadow-lg text-base sm:text-lg font-bold" 
              variant="secondary" 
              onClick={() => goToDayList()}
            >
              {viewBtnLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}


