import { useEffect, useMemo, useState } from 'react'
import type { Action } from '../app/state'
import type { TargetLang, WrongNoteItem } from '../lib/types'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { CorrectedAudioBtn } from '../components/CorrectedAudioBtn'
import {
  PREFER_CLIENT_KO_TTS_WORDS,
  WORD_DISPLAY_OVERRIDE,
  applyEnOverride,
  applyKoOverride,
} from '../lib/displayOverrides'
import { t, type Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { getOxfordByIds, isOnline } from '../lib/offlineCache'
import { romanizeKoreanText } from '../lib/koreanRomanization'
import type { OxfordRow } from './OxfordCloudScreen'
import { FlashcardScreen } from './FlashcardScreen'
import {
  removeFromWrongAnswers,
  clearWrongAnswers,
  getWrongAnswerIds,
  WRONG_ANSWERS_UPDATED_EVENT,
} from './FlashcardScreen'
import { oxfordRowsToUserWords } from '../lib/oxfordAdapter'
import { dedupRowsByEnglishWord } from '../lib/oxfordFilterUtils'

const WORDS_PER_DAY = 40

type Mode = 'home' | 'dayList' | 'list' | 'flashcard'

export function OxfordWrongNoteScreen({
  wrong,
  dispatch,
  lang,
  targetLang,
}: {
  wrong: WrongNoteItem[]
  dispatch: (a: Action) => void
  lang: Lang
  targetLang: TargetLang
}) {
  const koreanIsTarget = targetLang === 'ko'
  const wrongMode: 'sw' | 'ko' = koreanIsTarget ? 'sw' : 'ko'
  const [rows, setRows] = useState<OxfordRow[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('home')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [lsVersion, setLsVersion] = useState(0)

  // localStorage 오답 변경 이벤트 수신
  useEffect(() => {
    const handle = () => setLsVersion((v) => v + 1)
    window.addEventListener(WRONG_ANSWERS_UPDATED_EVENT, handle)
    return () => window.removeEventListener(WRONG_ANSWERS_UPDATED_EVENT, handle)
  }, [])

  // 헤더 뒤로가기 / 안드로이드 뒤로가기 지원
  const pushMode = (next: Mode, day: number | null = null) => {
    window.history.pushState({ screen: 'oxford-wrong', mode: next, day }, '')
    setMode(next)
    setSelectedDay(day)
  }
  useEffect(() => {
    const handlePop = (e: PopStateEvent) => {
      const st = e.state as { screen?: string; mode?: Mode; day?: number | null } | null
      if (st?.screen === 'oxford-wrong' && st.mode) {
        setMode(st.mode)
        setSelectedDay(st.day ?? null)
      } else {
        setMode('home')
        setSelectedDay(null)
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  // state wrong + localStorage wrong 병합 (SW-KO WrongNoteScreen과 동일 패턴)
  const mergedWrongIds = useMemo(() => {
    void lsVersion
    const stateIds = new Set(wrong.map((w) => w.id))
    const lsIds = getWrongAnswerIds(wrongMode)
    const combined = new Set(stateIds)
    for (const id of lsIds) combined.add(id)
    return Array.from(combined)
  }, [wrong, wrongMode, lsVersion])

  useEffect(() => {
    if (mergedWrongIds.length === 0) {
      setRows([])
      return
    }
    let cancelled = false
    const fetchRows = async () => {
      setLoading(true)
      try {
        if (isOnline() && supabase) {
          const { data } = await supabase.from('oxford_vocab').select('*').in('id', mergedWrongIds)
          if (!cancelled) setRows((data ?? []) as OxfordRow[])
        } else {
          const cached = await getOxfordByIds(mergedWrongIds)
          if (!cancelled) setRows(cached as OxfordRow[])
        }
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchRows()
    return () => {
      cancelled = true
    }
  }, [mergedWrongIds])

  const wrongMap = useMemo(() => new Map(wrong.map((w) => [w.id, w])), [wrong])

  // wrong 배열 순서를 따라 rows 정렬 (lastWrongAt desc).
  // state에 없는 localStorage-only 항목은 마지막에 추가.
  // KO-EN 학습자는 같은 영어 단어가 2개 카드로 보이지 않도록 word 기준 dedup.
  const orderedRows = useMemo(() => {
    const sortedWrong = [...wrong].sort((a, b) => b.lastWrongAt - a.lastWrongAt)
    const rowById = new Map(rows.map((r) => [r.id, r]))
    const stateIds = new Set(wrong.map((w) => w.id))
    const ordered = sortedWrong
      .map((w) => rowById.get(w.id))
      .filter((r): r is OxfordRow => Boolean(r))
    // localStorage-only 항목 (state에 없는 것)
    const lsOnlyRows = rows.filter((r) => !stateIds.has(r.id))
    const allOrdered = [...ordered, ...lsOnlyRows]
    return koreanIsTarget ? allOrdered : dedupRowsByEnglishWord(allOrdered)
  }, [wrong, rows, koreanIsTarget])

  const totalCount = orderedRows.length
  const totalDays = Math.ceil(totalCount / WORDS_PER_DAY)

  const getRowsForDay = (day: number) => {
    const start = (day - 1) * WORDS_PER_DAY
    const end = start + WORDS_PER_DAY
    return orderedRows.slice(start, end)
  }

  const onRemove = (id: string) => {
    dispatch({ type: 'wrongRemove', id })
    removeFromWrongAnswers(id, wrongMode)
  }

  const onClear = () => {
    if (
      window.confirm(
        lang === 'sw'
          ? 'Futa makosa yote?'
          : lang === 'en'
            ? 'Clear all wrong notes?'
            : '오답을 모두 지울까요?',
      )
    ) {
      dispatch({ type: 'wrongClear' })
      clearWrongAnswers(wrongMode)
    }
  }

  // 플래시카드 모드
  if (mode === 'flashcard' && selectedDay !== null) {
    const dayRows = getRowsForDay(selectedDay)
    const userWords = oxfordRowsToUserWords(dayRows, koreanIsTarget)
    return (
      <FlashcardScreen
        lang={lang}
        mode={koreanIsTarget ? 'sw' : 'ko'}
        dayNumber={selectedDay}
        wordsPerDay={WORDS_PER_DAY}
        userWords={userWords}
        wrongAnswerMode
        wrongWordIds={dayRows.map((r) => r.id)}
        onWrongAnswer={(wordId) => dispatch({ type: 'wrongAdd', id: wordId })}
        onMastered={(wordId) => dispatch({ type: 'wrongRemove', id: wordId })}
        onClose={() => {
          if (window.history.state?.screen === 'oxford-wrong') {
            window.history.back()
          } else {
            setMode('home')
            setSelectedDay(null)
          }
        }}
      />
    )
  }

  // 단어 목록 (Day 단위 또는 전체)
  if (mode === 'list') {
    const displayRows = selectedDay !== null ? getRowsForDay(selectedDay) : orderedRows
    const listTitle =
      selectedDay !== null
        ? `Day ${selectedDay}`
        : lang === 'sw'
          ? 'Tazama Maneno ya Makosa'
          : lang === 'en'
            ? 'View Wrong Words'
            : '오답 단어 보기'
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold text-white">{listTitle}</div>
            <div className="text-xs sm:text-sm font-semibold text-white/70">
              {lang === 'sw' ? 'Jumla' : lang === 'en' ? 'Total' : '총'} {displayRows.length}
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            <Button
              variant="secondary"
              onClick={() => window.history.back()}
            >
              {lang === 'sw' ? 'Rudi' : lang === 'en' ? 'Back' : '돌아가기'}
            </Button>
            {selectedDay === null && (
              <Button variant="danger" onClick={onClear}>
                {lang === 'sw' ? 'Weka upya' : lang === 'en' ? 'Reset' : '초기화'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:gap-3">
          {displayRows.length === 0 && !loading ? (
            <div className="rounded-3xl p-6 sm:p-8 text-center app-card backdrop-blur">
              <div className="text-sm font-semibold text-white/70">
                {t('noWrongWords', lang)}
              </div>
            </div>
          ) : null}
          {displayRows.map((r) => {
            const meta = wrongMap.get(r.id)
            const koOverride = WORD_DISPLAY_OVERRIDE[r.korean_meaning]
            const displayKorean = koOverride?.word ?? r.korean_meaning
            const displayKoreanPron = koOverride?.pron ?? null
            const targetText = koreanIsTarget ? displayKorean : r.word
            const meaningText = koreanIsTarget
              ? (applyEnOverride(r.word, r.korean_meaning) ?? r.word)
              : (applyKoOverride(r.word, displayKorean) ?? displayKorean)
            const targetAudio = koreanIsTarget ? r.meaning_audio_url : r.word_audio_url
            const targetTtsLang: 'sw' | 'ko' | 'en' = koreanIsTarget ? 'ko' : 'en'
            return (
              <div key={r.id} className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-lg sm:text-xl font-extrabold text-white truncate">
                        {targetText}
                      </div>
                      {(() => {
                        const pron = koreanIsTarget
                          ? (displayKoreanPron ?? romanizeKoreanText(targetText))
                          : (r.word_pron_ko ?? null)
                        return pron ? (
                          <span className="text-[12px] font-bold text-cyan-400 tracking-tight">
                            [{pron}]
                          </span>
                        ) : null
                      })()}
                      <CorrectedAudioBtn
                        url={targetAudio}
                        displayText={targetText}
                        dbText={koreanIsTarget ? r.korean_meaning : r.word}
                        lang={targetTtsLang}
                        preferClientTts={koreanIsTarget && (PREFER_CLIENT_KO_TTS_WORDS.has(targetText) || !!koOverride)}
                        variant="wrongNote"
                      />
                    </div>
                    <div className="mt-0.5 sm:mt-1 text-sm sm:text-base text-white/85 break-words">
                      {meaningText}
                    </div>
                    <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                      {r.category ? <Badge>{r.category}</Badge> : null}
                      <Badge className="border-[rgb(var(--orange))]/25 bg-[rgb(var(--orange))]/15 text-white">
                        {t('wrongCount', lang)} {meta?.wrongCount ?? 1}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => onRemove(r.id)}
                    aria-label={t('removeFromWrong', lang)}
                    className="shrink-0"
                  >
                    {lang === 'sw' ? 'Ondoa' : lang === 'en' ? 'Remove' : '제거'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
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
                {lang === 'sw'
                  ? 'Orodha ya Makosa - Chagua Siku'
                  : lang === 'en'
                    ? 'Wrong Notes - Pick a Day'
                    : '오답노트 - Day 선택'}
              </div>
              <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/60">
                {lang === 'sw'
                  ? `Jumla: ${totalCount} maneno (${totalDays} siku)`
                  : lang === 'en'
                    ? `Total: ${totalCount} words (${totalDays} days)`
                    : `총 ${totalCount}개 단어 (${totalDays}일)`}
              </div>
            </div>
            <Button variant="secondary" onClick={() => window.history.back()} className="shrink-0">
              {lang === 'sw' ? 'Rudi' : lang === 'en' ? 'Back' : '돌아가기'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl p-5 sm:p-6 text-center app-card backdrop-blur">
            <div className="text-xs sm:text-sm font-semibold text-white/70">
              {lang === 'sw' ? 'Inapakia...' : lang === 'en' ? 'Loading...' : '불러오는 중...'}
            </div>
          </div>
        ) : totalDays === 0 ? (
          <div className="rounded-3xl p-6 sm:p-8 text-center app-card backdrop-blur">
            <div className="text-sm sm:text-base text-white/70">
              {lang === 'sw' ? 'Hakuna makosa' : lang === 'en' ? 'No wrong words' : '오답이 없어요'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
              const dayRows = getRowsForDay(day)
              const startWord = (day - 1) * WORDS_PER_DAY + 1
              const endWord = Math.min(day * WORDS_PER_DAY, totalCount)
              return (
                <div
                  key={day}
                  className="rounded-2xl p-3 sm:p-4 app-card backdrop-blur border border-rose-400/20 bg-gradient-to-br from-rose-500/10 to-orange-500/10"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div>
                      <div className="text-base sm:text-lg font-extrabold text-white">
                        Day {day}
                      </div>
                      <div className="text-[10px] sm:text-xs font-semibold text-white/50">
                        {startWord}-{endWord} ({dayRows.length}
                        {lang === 'sw' ? ' maneno' : lang === 'en' ? ' words' : '개'})
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2">
                    <button
                      onClick={() => pushMode('list', day)}
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-white/10 text-white hover:bg-white/20 active:scale-95 transition touch-target"
                    >
                      📚 {lang === 'sw' ? 'Orodha' : lang === 'en' ? 'List' : '목록'}
                    </button>
                    <button
                      onClick={() => pushMode('flashcard', day)}
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-rose-500/30 to-orange-500/30 text-white hover:from-rose-500/50 hover:to-orange-500/50 active:scale-95 transition border border-rose-400/30 touch-target"
                    >
                      📇 {lang === 'sw' ? 'Kadi' : lang === 'en' ? 'Cards' : '카드'}
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

  // 홈 화면 — SW-KO WrongNoteScreen 과 동일 구조
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-3xl p-4 sm:p-5 app-banner backdrop-blur">
        <div className="text-xl sm:text-2xl font-extrabold text-white">
          {t('wrongNoteTitle', lang)}
        </div>
        <div className="text-xs sm:text-sm font-semibold text-white/70 text-right">
          {lang === 'sw'
            ? `${totalCount} maneno bado hujui`
            : lang === 'en'
              ? `${totalCount} words you haven't mastered`
              : `${totalCount}개 단어를 아직 못 외웠어요`}
        </div>
      </div>

      <div className="rounded-3xl p-4 sm:p-6 app-card backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="text-2xl sm:text-3xl font-extrabold text-[rgb(var(--orange))]">
            {lang === 'sw'
              ? 'Maneno Yasiyojulikana'
              : lang === 'en'
                ? 'Unmastered Words'
                : '못 외운 단어'}
          </div>
          <div className="rounded-xl sm:rounded-2xl bg-[rgb(var(--orange))]/20 px-3 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base font-extrabold text-[rgb(var(--orange))]">
            {totalCount}
          </div>
        </div>

        <div className="mt-4 sm:mt-5 grid gap-2 sm:gap-3">
          {totalCount > 0 && (
            <Button
              variant="danger"
              className="h-16 sm:h-20 rounded-3xl shadow-lg w-full"
              onClick={() => pushMode('dayList')}
            >
              <span className="text-xl sm:text-[2rem] font-bold">
                {lang === 'sw'
                  ? 'Kadi za Makosa'
                  : lang === 'en'
                    ? 'Wrong Note Flashcards'
                    : '오답 플래시카드'}
              </span>
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Button
              variant="secondary"
              className="h-14 sm:h-16 rounded-3xl shadow-lg text-base sm:text-lg font-bold"
              onClick={() =>
                dispatch({
                  type: 'settings',
                  patch: { bottomTab: 'quiz', quizSource: 'wrong' },
                })
              }
              disabled={!totalCount}
            >
              {lang === 'sw' ? '🎯 Maswali' : lang === 'en' ? '🎯 Quiz' : '🎯 퀴즈'}
            </Button>
            <Button
              className="h-14 sm:h-16 rounded-3xl shadow-lg text-base sm:text-lg font-bold"
              variant="secondary"
              onClick={() => pushMode('dayList')}
              disabled={!totalCount}
            >
              {lang === 'sw' ? '📖 Tazama' : lang === 'en' ? '📖 View' : '📖 단어 보기'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
