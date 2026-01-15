import { useEffect, useState, useCallback } from 'react'
import { Button } from '../components/Button'
import type { Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'

type Mode = 'sw' | 'ko'

type CloudRow = {
  id: string
  mode: Mode
  word: string
  word_pronunciation: string | null
  word_audio_url: string | null
  image_url: string | null
  meaning_sw: string | null
  meaning_ko: string | null
  meaning_en: string | null
  example: string | null
  example_pronunciation: string | null
  example_audio_url: string | null
  example_translation_sw: string | null
  example_translation_ko: string | null
  example_translation_en: string | null
}

// 오답노트 로컬스토리지 키
const WRONG_ANSWERS_KEY = 'flashcard_wrong_answers'
export const WRONG_ANSWERS_UPDATED_EVENT = 'wrong-answers-updated'

function emitWrongAnswersUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WRONG_ANSWERS_UPDATED_EVENT))
  }
}

// 오답노트에서 단어 ID 목록 가져오기
function getWrongAnswers(): string[] {
  try {
    const stored = localStorage.getItem(WRONG_ANSWERS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// 오답노트에 단어 추가
export function addToWrongAnswers(wordId: string) {
  const current = getWrongAnswers()
  if (!current.includes(wordId)) {
    const updated = [...current, wordId]
    localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(updated))
    emitWrongAnswersUpdated()
  }
}

// 오답노트에서 단어 제거
export function removeFromWrongAnswers(wordId: string) {
  const current = getWrongAnswers()
  const updated = current.filter((id) => id !== wordId)
  localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(updated))
  emitWrongAnswersUpdated()
}

// 오답노트 전체 삭제 (필요시 사용)
// function clearWrongAnswers() {
//   localStorage.removeItem(WRONG_ANSWERS_KEY)
// }

// 오답노트 개수 가져오기
export function getWrongAnswersCount(): number {
  return getWrongAnswers().length
}

// 오답노트 단어 ID 목록 export
export function getWrongAnswerIds(): string[] {
  return getWrongAnswers()
}

function AudioBtn({ url }: { url: string | null }) {
  if (!url) return null
  const play = () => {
    const a = new Audio(url)
    void a.play()
  }
  return (
    <button
      onClick={play}
      className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition"
      title="Play audio"
    >
      🔊
    </button>
  )
}

export function FlashcardScreen({
  lang,
  mode,
  levelFilter = '',
  dayNumber,
  wordsPerDay = 40,
  onClose,
  wrongAnswerMode = false,
  wrongWordIds,
}: {
  lang: Lang
  mode: Mode
  levelFilter?: string
  dayNumber?: number
  wordsPerDay?: number
  onClose: () => void
  wrongAnswerMode?: boolean // 오답노트 모드
  wrongWordIds?: string[] // 특정 오답 단어 ID 목록 (Day별 학습용)
}) {
  const [words, setWords] = useState<CloudRow[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [knownCount, setKnownCount] = useState(0)
  const [unknownCount, setUnknownCount] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [wrongWords, setWrongWords] = useState<CloudRow[]>([]) // 이번 세션에서 틀린 단어들

  // 뒤로가기는 부모 컴포넌트(AllWordsDayList)에서 처리

  useEffect(() => {
    const fetchWords = async () => {
      if (!supabase) return
      setLoading(true)
      
      // 오답노트 모드
      if (wrongAnswerMode) {
        // wrongWordIds가 제공되면 해당 ID만, 아니면 전체 오답
        const wrongIds = wrongWordIds ?? getWrongAnswers()
        if (wrongIds.length === 0) {
          setWords([])
          setLoading(false)
          return
        }
        
        const { data } = await supabase
          .from('generated_vocab')
          .select('*')
          .in('id', wrongIds)
        
        const cleaned = ((data ?? []) as CloudRow[]).filter(
          (r) => !r.word?.startsWith('__deleted__')
        )
        setWords(cleaned)
        setLoading(false)
        return
      }
      
      // 일반 모드
      let query = supabase
        .from('generated_vocab')
        .select('*')
        .eq('mode', mode)
      
      if (levelFilter) {
        query = query.eq('category', levelFilter)
      }
      
      if (dayNumber) {
        const startIdx = (dayNumber - 1) * wordsPerDay
        const endIdx = startIdx + wordsPerDay - 1
        
        const { data } = await query
          .order('created_at', { ascending: true })
          .range(startIdx, endIdx)
        
        const cleaned = ((data ?? []) as CloudRow[]).filter(
          (r) => !r.word?.startsWith('__deleted__')
        )
        setWords(cleaned)
      } else {
        const { data } = await query
          .order('created_at', { ascending: true })
          .limit(wordsPerDay)
        
        const cleaned = ((data ?? []) as CloudRow[]).filter(
          (r) => !r.word?.startsWith('__deleted__')
        )
        setWords(cleaned)
      }
      setLoading(false)
    }
    void fetchWords()
  }, [mode, levelFilter, dayNumber, wordsPerDay, wrongAnswerMode, wrongWordIds])

  const currentWord = words[currentIndex]

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev)
  }, [])

  const goToNext = useCallback(() => {
    setIsFlipped(false)
    setCurrentIndex((i) => {
      if (i < words.length - 1) {
        return i + 1
      } else {
        setIsComplete(true)
        return i
      }
    })
  }, [words.length])

  const handleKnown = useCallback(() => {
    setKnownCount((c) => c + 1)
    // 알아요 선택 시 오답노트에서 제거
    if (currentWord) {
      removeFromWrongAnswers(currentWord.id)
    }
    goToNext()
  }, [goToNext, currentWord])

  const handleUnknown = useCallback(() => {
    setUnknownCount((c) => c + 1)
    // 몰라요 선택 시 오답노트에 추가
    if (currentWord) {
      addToWrongAnswers(currentWord.id)
      setWrongWords((prev) => [...prev, currentWord])
    }
    goToNext()
  }, [goToNext, currentWord])

  // 오답노트 모드: 외웠어요 (오답노트에서 제거)
  const handleMastered = useCallback(() => {
    setKnownCount((c) => c + 1)
    if (currentWord) {
      removeFromWrongAnswers(currentWord.id)
    }
    goToNext()
  }, [goToNext, currentWord])

  // 오답노트 모드: 넘기기 (오답노트에서 제거 안함)
  const handleSkip = useCallback(() => {
    setUnknownCount((c) => c + 1)
    goToNext()
  }, [goToNext])

  const handleRestart = () => {
    setCurrentIndex(0)
    setIsFlipped(false)
    setKnownCount(0)
    setUnknownCount(0)
    setIsComplete(false)
  }

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!isFlipped) {
          handleFlip()
        }
      } else if (e.key === 'ArrowRight' || e.key === 'o') {
        if (isFlipped) {
          if (wrongAnswerMode) handleMastered()
          else handleKnown()
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'x') {
        if (isFlipped) {
          if (wrongAnswerMode) handleSkip()
          else handleUnknown()
        }
      } else if (e.key === 'Escape') {
        window.history.back()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFlipped, handleFlip, handleKnown, handleUnknown, handleMastered, handleSkip, wrongAnswerMode, onClose])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-xl font-bold text-white">
          {lang === 'sw' ? 'Inapakia...' : '불러오는 중...'}
        </div>
      </div>
    )
  }

  if (isComplete) {
    const total = knownCount + unknownCount
    const percentage = total > 0 ? Math.round((knownCount / total) * 100) : 0
    
    const getMeaning = (w: CloudRow) => {
      const raw = mode === 'sw' 
        ? (w.meaning_sw || w.meaning_en || '') 
        : (w.meaning_ko || w.meaning_en || '')
      return raw.includes(',') ? raw.split(',')[0].trim() : raw
    }
    
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/95 p-3 sm:p-4" style={{ paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}>
        <div className="min-h-full flex items-center justify-center py-4 sm:py-8">
          <div className="w-full max-w-md rounded-3xl bg-gradient-to-br from-emerald-900/80 to-teal-900/80 p-5 sm:p-8 text-center backdrop-blur border border-white/20">
            <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🎉</div>
            <div className="text-xl sm:text-2xl font-extrabold text-white mb-1 sm:mb-2">
              {lang === 'sw' ? 'Umekamilika!' : '학습 완료!'}
            </div>
            <div className="text-base sm:text-lg text-white/80 mb-4 sm:mb-6">
              Day {dayNumber}
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="rounded-2xl bg-emerald-500/20 p-3 sm:p-4">
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">{knownCount}</div>
                <div className="text-xs sm:text-sm text-emerald-300">
                  {wrongAnswerMode 
                    ? (lang === 'sw' ? 'Ondoa' : '제거됨')
                    : (lang === 'sw' ? 'Najua' : '알아요')}
                </div>
              </div>
              <div className="rounded-2xl bg-rose-500/20 p-3 sm:p-4">
                <div className="text-2xl sm:text-3xl font-extrabold text-rose-400">{unknownCount}</div>
                <div className="text-xs sm:text-sm text-rose-300">
                  {wrongAnswerMode
                    ? (lang === 'sw' ? 'Ruka' : '넘기기')
                    : (lang === 'sw' ? 'Sijui' : '몰라요')}
                </div>
              </div>
            </div>
            
            <div className="mb-4 sm:mb-6">
              <div className="text-xs sm:text-sm text-white/60 mb-2">
                {lang === 'sw' ? 'Kiwango cha mafanikio' : '정답률'}
              </div>
              <div className="h-2.5 sm:h-3 rounded-full bg-white/20 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white mt-2">{percentage}%</div>
            </div>
            
            {/* 오답노트 */}
            {wrongWords.length > 0 && (
              <div className="mb-4 sm:mb-6 text-left">
                <div className="text-xs sm:text-sm font-bold text-rose-400 mb-2 sm:mb-3 flex items-center gap-2">
                  📝 {lang === 'sw' ? 'Maneno Yaliyokosewa' : '오답노트'} ({wrongWords.length})
                </div>
                <div className="max-h-36 sm:max-h-48 overflow-y-auto rounded-2xl bg-black/30 p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                  {wrongWords.map((w) => (
                    <div key={w.id} className="flex items-center justify-between rounded-xl bg-white/5 px-2.5 sm:px-3 py-1.5 sm:py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold text-white truncate">{w.word}</div>
                        <div className="text-[10px] sm:text-xs text-white/60 truncate">{getMeaning(w)}</div>
                      </div>
                      <AudioBtn url={w.word_audio_url} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] sm:text-xs text-white/40 text-center">
                  {lang === 'sw' ? 'Imehifadhiwa kwenye orodha ya makosa' : '오답노트에 저장됨'}
                </div>
              </div>
            )}
            
            <div className="flex gap-2 sm:gap-3">
              <Button variant="secondary" onClick={() => window.history.back()} className="flex-1">
                {lang === 'sw' ? 'Funga' : '닫기'}
              </Button>
              <Button variant="primary" onClick={handleRestart} className="flex-1">
                {lang === 'sw' ? 'Rudia' : '다시하기'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!currentWord) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-center">
          <div className="text-xl font-bold text-white mb-4">
            {lang === 'sw' ? 'Hakuna maneno' : '단어가 없습니다'}
          </div>
          <Button variant="secondary" onClick={() => window.history.back()}>
            {lang === 'sw' ? 'Funga' : '닫기'}
          </Button>
        </div>
      </div>
    )
  }

  const rawMeaning = mode === 'sw' 
    ? (currentWord.meaning_sw || currentWord.meaning_en || '') 
    : (currentWord.meaning_ko || currentWord.meaning_en || '')
  const meaning = rawMeaning.includes(',') ? rawMeaning.split(',')[0].trim() : rawMeaning
  
  const exampleTranslation = mode === 'sw'
    ? (currentWord.example_translation_sw || currentWord.example_translation_en || '')
    : (currentWord.example_translation_ko || currentWord.example_translation_en || '')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4">
        <button
          onClick={() => window.history.back()}
          className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition touch-target"
        >
          ✕
        </button>
        <div className="text-center">
          <div className="text-xs sm:text-sm font-semibold text-white/60">Day {dayNumber}</div>
          <div className="text-base sm:text-lg font-bold text-white">
            {currentIndex + 1} / {words.length}
          </div>
        </div>
        <div className="w-10 sm:w-11" />
      </div>
      
      {/* Progress bar */}
      <div className="px-3 sm:px-4">
        <div className="h-1.5 sm:h-2 rounded-full bg-white/20 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
        <div 
          onClick={handleFlip}
          className="w-full max-w-md cursor-pointer perspective-1000"
        >
          <div 
            className={`relative w-full min-h-[320px] sm:min-h-[400px] rounded-3xl transition-transform duration-500 transform-style-preserve-3d ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Front - Word */}
            <div 
              className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-900/90 to-purple-900/90 p-5 sm:p-8 flex flex-col items-center justify-center backdrop-blur border border-white/20"
              style={{ backfaceVisibility: 'hidden' }}
            >
              {currentWord.image_url && (
                <img 
                  src={currentWord.image_url} 
                  alt={currentWord.word}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl object-cover mb-4 sm:mb-6"
                />
              )}
              <div className="text-3xl sm:text-4xl font-extrabold text-white mb-2 sm:mb-3 flex items-center">
                {currentWord.word}
                <AudioBtn url={currentWord.word_audio_url} />
              </div>
              {currentWord.word_pronunciation && (
                <div className="text-base sm:text-lg text-cyan-400 font-semibold">
                  [{currentWord.word_pronunciation}]
                </div>
              )}
              <div className="mt-6 sm:mt-8 text-xs sm:text-sm text-white/50">
                {lang === 'sw' ? 'Gusa kuona jibu' : '탭하여 뜻 보기'}
              </div>
            </div>
            
            {/* Back - Meaning */}
            <div 
              className="absolute inset-0 rounded-3xl bg-gradient-to-br from-teal-900/90 to-emerald-900/90 p-5 sm:p-8 flex flex-col items-center justify-center backdrop-blur border border-white/20 overflow-y-auto"
              style={{ 
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <div className="text-lg sm:text-2xl font-bold text-white/60 mb-1 sm:mb-2">
                {currentWord.word}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mb-4 sm:mb-6 text-center">
                {meaning}
              </div>
              
              {currentWord.example && (
                <div className="w-full rounded-2xl bg-black/30 p-3 sm:p-4 mb-3 sm:mb-4">
                  <div className="text-sm sm:text-base text-white/90 mb-1 flex items-center flex-wrap">
                    {currentWord.example}
                    <AudioBtn url={currentWord.example_audio_url} />
                  </div>
                  {currentWord.example_pronunciation && (
                    <div className="text-xs sm:text-sm text-cyan-400 mb-1 sm:mb-2">
                      [{currentWord.example_pronunciation}]
                    </div>
                  )}
                  {exampleTranslation && (
                    <div className="text-xs sm:text-sm text-white/60">
                      {exampleTranslation}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="p-3 sm:p-4 pb-4 sm:pb-8">
        {isFlipped ? (
          wrongAnswerMode ? (
            // 오답노트 모드: 넘기기 / 외웠어요
            <div className="flex gap-3 sm:gap-4 max-w-md mx-auto">
              <button
                onClick={handleSkip}
                className="flex-1 rounded-2xl bg-slate-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-slate-300 border-2 border-slate-500/30 hover:bg-slate-500/30 active:scale-95 transition touch-target"
              >
                {lang === 'sw' ? '➡️ Ruka' : '➡️ 넘기기'}
              </button>
              <button
                onClick={handleMastered}
                className="flex-1 rounded-2xl bg-emerald-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-emerald-400 border-2 border-emerald-500/30 hover:bg-emerald-500/30 active:scale-95 transition touch-target"
              >
                {lang === 'sw' ? '✅ Ondoa' : '✅ 오답노트 제거'}
              </button>
            </div>
          ) : (
            // 일반 모드: 몰라요 / 알아요
            <div className="flex gap-3 sm:gap-4 max-w-md mx-auto">
              <button
                onClick={handleUnknown}
                className="flex-1 rounded-2xl bg-rose-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-rose-400 border-2 border-rose-500/30 hover:bg-rose-500/30 active:scale-95 transition touch-target"
              >
                {lang === 'sw' ? '❌ Sijui' : '❌ 몰라요'}
              </button>
              <button
                onClick={handleKnown}
                className="flex-1 rounded-2xl bg-emerald-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-emerald-400 border-2 border-emerald-500/30 hover:bg-emerald-500/30 active:scale-95 transition touch-target"
              >
                {lang === 'sw' ? '✅ Najua' : '✅ 알아요'}
              </button>
            </div>
          )
        ) : (
          <button
            onClick={handleFlip}
            className="w-full max-w-md mx-auto block rounded-2xl bg-white/10 py-4 sm:py-5 text-lg sm:text-xl font-bold text-white border-2 border-white/20 hover:bg-white/20 active:scale-95 transition touch-target"
          >
            {lang === 'sw' ? '👀 Ona jibu' : '👀 정답 보기'}
          </button>
        )}
      </div>

      {/* Keyboard hints (desktop only) */}
      <div className="hidden md:block absolute bottom-4 left-4 text-xs text-white/30">
        <div>Space/Enter: {lang === 'sw' ? 'Geuza' : '뒤집기'}</div>
        {wrongAnswerMode ? (
          <>
            <div>← / X: {lang === 'sw' ? 'Ruka' : '넘기기'}</div>
            <div>→ / O: {lang === 'sw' ? 'Ondoa' : '오답노트 제거'}</div>
          </>
        ) : (
          <>
            <div>← / X: {lang === 'sw' ? 'Sijui' : '몰라요'}</div>
            <div>→ / O: {lang === 'sw' ? 'Najua' : '알아요'}</div>
          </>
        )}
        <div>Esc: {lang === 'sw' ? 'Funga' : '닫기'}</div>
      </div>
    </div>
  )
}
