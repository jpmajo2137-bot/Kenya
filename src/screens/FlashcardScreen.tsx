import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '../components/Button'
import { VocabImage } from '../components/VocabImage'
import { wikiSearchTitlesFromMeaningEn } from '../lib/wikiThumbnail'
import type { Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { 
  getMediaFromCache, 
  isOnline,
  onOnlineStatusChange,
  getVocabFromCache,
  getVocabByIds
} from '../lib/offlineCache'
import {
  applyKoOverride,
  applySwOverride,
  WORD_DISPLAY_OVERRIDE,
  EXAMPLE_DISPLAY_OVERRIDE,
  EXAMPLE_TRANSLATION_KO_OVERRIDE,
  EXAMPLE_TRANSLATION_EN_OVERRIDE,
  EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD,
} from '../lib/displayOverrides'
import { parseLevelFilter, buildTopicOrCondition, matchesTopicFilter, getClassifiedWordIds, isWordInClassifiedTopic, getOrderedWordIds, ORDERED_WORD_EXCLUSIONS, CLASSIFIED_WORD_EXCLUSIONS, getClassifiedInclusions, CLASSIFIED_EXTRA_WORDS, getClassifiedDay1Inclusions, CLASSIFIED_DAY1_EXCLUSIONS, getClassifiedDayNExclusions, getClassifiedDayNExclusionsMap, CLASSIFIED_DAYN_EXCLUDE_PREV_DAY, CLASSIFIED_DEDUPLICATE_TOPICS, CLASSIFIED_DEDUPLICATE_BY_WORD_ONLY, getWordsFromPreviousDay, deduplicateClassifiedRows, isRowExcludedByDayN, GLOBAL_WORD_EXCLUSIONS, CATEGORY_WORD_EXCLUSIONS, sortClassifiedRowsByWordOrder, getAllWordsNumberTailIds } from '../lib/filterUtils'

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

// 오답노트 로컬스토리지 키 (언어별 분리)
const WRONG_ANSWERS_KEY_KO = 'flashcard_wrong_answers_ko'
const WRONG_ANSWERS_KEY_SW = 'flashcard_wrong_answers_sw'
export const WRONG_ANSWERS_UPDATED_EVENT = 'wrong-answers-updated'

// 현재 언어 설정 가져오기
function getCurrentMeaningLang(): Mode {
  try {
    const stored = localStorage.getItem('k-kiswahili-app-v2')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.settings?.meaningLang || 'sw'
    }
  } catch {
    // ignore
  }
  return 'sw'
}

function getWrongAnswersKey(lang?: Mode): string {
  const currentLang = lang ?? getCurrentMeaningLang()
  return currentLang === 'ko' ? WRONG_ANSWERS_KEY_KO : WRONG_ANSWERS_KEY_SW
}

function emitWrongAnswersUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WRONG_ANSWERS_UPDATED_EVENT))
  }
}

// 오답노트에서 단어 ID 목록 가져오기 (언어별)
function getWrongAnswers(lang?: Mode): string[] {
  try {
    const key = getWrongAnswersKey(lang)
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// 오답노트에 단어 추가 (언어별)
export function addToWrongAnswers(wordId: string, lang?: Mode) {
  const key = getWrongAnswersKey(lang)
  const current = getWrongAnswers(lang)
  if (!current.includes(wordId)) {
    const updated = [...current, wordId]
    localStorage.setItem(key, JSON.stringify(updated))
    emitWrongAnswersUpdated()
  }
}

// 오답노트에서 단어 제거 (언어별)
export function removeFromWrongAnswers(wordId: string, lang?: Mode) {
  const key = getWrongAnswersKey(lang)
  const current = getWrongAnswers(lang)
  const updated = current.filter((id) => id !== wordId)
  localStorage.setItem(key, JSON.stringify(updated))
  emitWrongAnswersUpdated()
}

// 오답노트 전체 삭제 (언어별, 필요시 사용)
export function clearWrongAnswers(lang?: Mode) {
  const key = getWrongAnswersKey(lang)
  localStorage.removeItem(key)
  emitWrongAnswersUpdated()
}

// 오답노트 개수 가져오기 (언어별)
export function getWrongAnswersCount(lang?: Mode): number {
  return getWrongAnswers(lang).length
}

// 오답노트 단어 ID 목록 export (언어별)
export function getWrongAnswerIds(lang?: Mode): string[] {
  return getWrongAnswers(lang)
}


function AudioBtn({ url }: { url: string | null }) {
  const blobUrlRef = useRef<string | null>(null)
  
  if (!url) return null
  
  const playAudio = async () => {
    let urlToPlay = url
    
    // 오프라인이면 캐시에서 가져오기
    if (!isOnline()) {
      try {
        const blob = await getMediaFromCache(url)
        if (blob) {
          // 이전 Blob URL 해제
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current)
          }
          urlToPlay = URL.createObjectURL(blob)
          blobUrlRef.current = urlToPlay
        }
      } catch {
        // 캐시 실패 시 원본 URL 시도
      }
    }
    
    const a = new Audio(urlToPlay)
    a.play().catch(() => {})
  }
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    playAudio()
  }
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    playAudio()
  }
  
  return (
    <button
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      onTouchStart={(e) => e.stopPropagation()}
      className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition"
      title="Play audio"
    >
      🔊
    </button>
  )
}

// VocabItem을 CloudRow 형태로 변환
type UserWord = {
  id: string
  sw: string
  ko: string
  en?: string
  example?: string
  exampleKo?: string
  exampleEn?: string
}

function convertUserWordToCloudRow(item: UserWord, mode: Mode): CloudRow {
  return {
    id: item.id,
    mode,
    word: item.sw,
    word_pronunciation: null,
    word_audio_url: null,
    image_url: null,
    meaning_sw: null,
    meaning_ko: item.ko,
    meaning_en: item.en || null,
    example: item.example || null,
    example_pronunciation: null,
    example_audio_url: null,
    example_translation_sw: null,
    example_translation_ko: item.exampleKo || null,
    example_translation_en: item.exampleEn || null,
  }
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
  userWords,
}: {
  lang: Lang
  mode: Mode
  levelFilter?: string
  dayNumber?: number
  wordsPerDay?: number
  onClose: () => void
  wrongAnswerMode?: boolean // 오답노트 모드
  wrongWordIds?: string[] // 특정 오답 단어 ID 목록 (Day별 학습용)
  userWords?: UserWord[] // 사용자 단어 모드
}) {
  const [words, setWords] = useState<CloudRow[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [knownCount, setKnownCount] = useState(0)
  const [unknownCount, setUnknownCount] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [wrongWords, setWrongWords] = useState<CloudRow[]>([]) // 이번 세션에서 틀린 단어들
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null) // 카드 넘김 애니메이션
  const [isAnimating, setIsAnimating] = useState(false)
  const [online, setOnline] = useState(isOnline())

  // 온라인 상태 감지
  useEffect(() => {
    const unsubscribe = onOnlineStatusChange(setOnline)
    return unsubscribe
  }, [])

  // 뒤로가기는 부모 컴포넌트(AllWordsDayList)에서 처리

  useEffect(() => {
    const fetchWords = async () => {
      setLoading(true)
      const online = isOnline()
      
      // 오답노트 모드 (userWords보다 먼저 체크)
      if (wrongAnswerMode) {
        // wrongWordIds가 제공되면 해당 ID만, 아니면 전체 오답 (언어별)
        const wrongIds = wrongWordIds ?? getWrongAnswers(mode)
        if (wrongIds.length === 0) {
          setWords([])
          setLoading(false)
          return
        }
        
        // userWords에서 오답노트에 있는 사용자 단어 찾기
        const userWrongWords: CloudRow[] = []
        const cloudIdsToFetch: string[] = []
        const userWordIds = new Set(userWords?.map(w => w.id) ?? [])
        
        if (userWords && userWords.length > 0) {
          for (const id of wrongIds) {
            const userWord = userWords.find(w => w.id === id)
            if (userWord) {
              userWrongWords.push(convertUserWordToCloudRow(userWord, mode))
            } else {
              cloudIdsToFetch.push(id)
            }
          }
        } else {
          cloudIdsToFetch.push(...wrongIds.filter(id => !userWordIds.has(id)))
        }
        
        // 클라우드/캐시에서 단어 가져오기
        let cloudWords: CloudRow[] = []
        if (cloudIdsToFetch.length > 0) {
          if (online && supabase) {
            // 온라인: 서버에서 가져오기
            const { data } = await supabase
              .from('generated_vocab')
              .select('*')
              .in('id', cloudIdsToFetch)
            
            cloudWords = ((data ?? []) as CloudRow[]).filter(
              (r) => !r.word?.startsWith('__deleted__')
            )
          } else {
            // 오프라인: 캐시에서 가져오기
            try {
              const cached = await getVocabByIds(cloudIdsToFetch)
              cloudWords = cached.filter(
                (r) => !r.word?.startsWith('__deleted__')
              ) as CloudRow[]
            } catch {
              // 캐시 실패
            }
          }
        }
        
        // 클라우드 단어 + 사용자 단어 합치기
        const allWords = [...cloudWords, ...userWrongWords].filter(
          (r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? '')
        )
        // 셔플
        const shuffled = [...allWords].sort(() => Math.random() - 0.5)
        setWords(shuffled)
        setLoading(false)
        return
      }
      
      // 사용자 단어 모드 (오답노트가 아닐 때)
      if (userWords && userWords.length > 0) {
        const converted = userWords
          .map(w => convertUserWordToCloudRow(w, mode))
          .filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
        // 셔플
        const shuffled = [...converted].sort(() => Math.random() - 0.5)
        setWords(shuffled)
        setLoading(false)
        return
      }
      
      const pf = parseLevelFilter(levelFilter)

      if (pf.disabled) {
        setWords([])
        setLoading(false)
        return
      }

      if (pf.ordered) {
        const orderedIds = getOrderedWordIds(pf.ordered, mode)
        if (orderedIds.length === 0) { setWords([]); setLoading(false); return }
        if (online && supabase) {
          const { data } = await supabase.from('generated_vocab').select('*').in('id', orderedIds)
          const dataMap = new Map((data ?? []).map((r: CloudRow) => [r.id, r]))
          const sorted = orderedIds.map((id) => dataMap.get(id)).filter(Boolean) as CloudRow[]
          const exclusions = ORDERED_WORD_EXCLUSIONS[pf.ordered]
          let filtered = exclusions?.length
            ? sorted.filter((r) => !exclusions.includes(r.word ?? ''))
            : sorted
          filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          const targetWords = dayNumber
            ? filtered.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
            : filtered
          setWords(targetWords)
        } else {
          const cached = await getVocabFromCache(mode)
          const idMap = new Map(cached.map((r) => [r.id, r]))
          const sorted = orderedIds.map((id) => idMap.get(id)).filter(Boolean) as CloudRow[]
          const exclusions = ORDERED_WORD_EXCLUSIONS[pf.ordered]
          let filtered = exclusions?.length
            ? sorted.filter((r) => !exclusions.includes(r.word ?? ''))
            : sorted
          filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          const targetWords = dayNumber
            ? filtered.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
            : filtered
          setWords(targetWords)
        }
        setLoading(false)
        return
      }

      if (pf.classified) {
        const inclusions = getClassifiedInclusions(pf.classified, mode)
        if (online && supabase) {
          if (inclusions?.length) {
            const { data } = await supabase
              .from('generated_vocab')
              .select('*')
              .eq('mode', mode)
              .in('word', inclusions)
              .order('created_at', { ascending: true })
            let filtered = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
            filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
            filtered = sortClassifiedRowsByWordOrder(filtered, pf.classified)
            const targetWords = dayNumber
              ? filtered.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
              : filtered.slice(0, wordsPerDay)
            setWords(targetWords)
          } else {
            const ids = getClassifiedWordIds(pf.classified, mode)
            if (ids.length === 0) { setWords([]); setLoading(false); return }
            const BATCH = 100
            let allData: CloudRow[] = []
            for (let i = 0; i < ids.length; i += BATCH) {
              const chunk = ids.slice(i, i + BATCH)
              const { data } = await supabase
                .from('generated_vocab')
                .select('*')
                .eq('mode', mode)
                .in('id', chunk)
                .order('created_at', { ascending: true })
              allData = allData.concat((data ?? []) as CloudRow[])
            }
            let filtered = allData.filter((r) => !r.word?.startsWith('__deleted__'))
            const exclusions = CLASSIFIED_WORD_EXCLUSIONS[pf.classified]
            if (exclusions?.length) {
              filtered = filtered.filter((r) => !exclusions.includes(r.word ?? ''))
            }
            filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
            const extraWords = CLASSIFIED_EXTRA_WORDS[pf.classified]
            if (extraWords?.length && supabase) {
              const existingWords = new Set(filtered.map((r) => r.word))
              const missing = extraWords.filter((w) => !existingWords.has(w))
              if (missing.length) {
                const { data: extraData } = await supabase
                  .from('generated_vocab')
                  .select('*')
                  .eq('mode', mode)
                  .in('word', missing)
                if (extraData?.length) {
                  filtered = [...filtered, ...(extraData as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))]
                }
              }
            }
            if (CLASSIFIED_DEDUPLICATE_TOPICS.includes(pf.classified)) {
              filtered = deduplicateClassifiedRows(filtered, CLASSIFIED_DEDUPLICATE_BY_WORD_ONLY.includes(pf.classified))
            }
            filtered = sortClassifiedRowsByWordOrder(filtered, pf.classified)
            const day1Incl = getClassifiedDay1Inclusions(pf.classified!, mode)
            let targetWords: CloudRow[]
            if (day1Incl?.length) {
              const day1Set = new Set(day1Incl)
              const day1Excl = new Set(CLASSIFIED_DAY1_EXCLUSIONS[pf.classified] ?? [])
              const day1Rows = filtered.filter((r) => day1Set.has(r.word ?? ''))
              const rest = filtered.filter((r) => !day1Set.has(r.word ?? ''))
              const ordered = [...day1Rows, ...rest]
              const filteredOutExcl = day1Excl.size ? ordered.filter((r) => !day1Excl.has(r.word ?? '')) : ordered
              if (dayNumber) {
                const dayNExcl = getClassifiedDayNExclusions(pf.classified!, dayNumber, mode)
                const dayNExclSet = dayNExcl?.length ? new Set(dayNExcl) : null
                if (dayNExclSet) {
                  let idx = (dayNumber - 1) * wordsPerDay
                  targetWords = []
                  while (targetWords.length < wordsPerDay && idx < filteredOutExcl.length) {
                    const r = filteredOutExcl[idx++]
                    if (!isRowExcludedByDayN(r, dayNExclSet)) targetWords.push(r)
                  }
                } else {
                  targetWords = filteredOutExcl.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
                }
              } else {
                targetWords = filteredOutExcl.slice(0, wordsPerDay)
              }
            } else {
              if (dayNumber) {
                let dayNExclSet = new Set(getClassifiedDayNExclusions(pf.classified!, dayNumber, mode))
                const excludePrevDays = CLASSIFIED_DAYN_EXCLUDE_PREV_DAY[pf.classified]
                if (excludePrevDays?.includes(dayNumber)) {
                  const prevWords = getWordsFromPreviousDay(filtered, dayNumber - 1, wordsPerDay, getClassifiedDayNExclusionsMap(pf.classified!, mode))
                  prevWords.forEach((w) => dayNExclSet.add(w))
                }
                if (dayNExclSet.size) {
                  let idx = (dayNumber - 1) * wordsPerDay
                  targetWords = []
                  while (targetWords.length < wordsPerDay && idx < filtered.length) {
                    const r = filtered[idx++]
                    if (!isRowExcludedByDayN(r, dayNExclSet)) targetWords.push(r)
                  }
                } else {
                  targetWords = filtered.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
                }
              } else {
                targetWords = filtered.slice(0, wordsPerDay)
              }
            }
            setWords(targetWords)
          }
        } else {
          const cached = await getVocabFromCache(mode)
          let filtered: CloudRow[]
          if (inclusions?.length) {
            filtered = cached.filter(
              (r) => !r.word?.startsWith('__deleted__') && inclusions.includes(r.word ?? '')
            ) as CloudRow[]
          } else {
            filtered = cached.filter(
              (r) => !r.word?.startsWith('__deleted__') && isWordInClassifiedTopic(r.id, pf.classified!)
            ) as CloudRow[]
            const exclusions = CLASSIFIED_WORD_EXCLUSIONS[pf.classified]
            if (exclusions?.length) {
              filtered = filtered.filter((r) => !exclusions.includes(r.word ?? ''))
            }
            if (pf.classified === '시간/날짜' && mode === 'sw') {
              const monthWords = ['januari','februari','aprili','mei','juni','julai','agosti','septemba','oktoba','novemba','desemba']
              const monthSet = new Set(monthWords)
              const filteredIds = new Set(filtered.map((r) => r.id))
              for (const r of cached) {
                if (!r.word?.startsWith('__deleted__') && monthSet.has((r.word ?? '').toLowerCase()) && !filteredIds.has(r.id)) {
                  filtered.push(r as CloudRow)
                  filteredIds.add(r.id)
                }
              }
            }
          }
          filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          const extraWordsCache = CLASSIFIED_EXTRA_WORDS[pf.classified!]
          if (extraWordsCache?.length) {
            const existingIds = new Set(filtered.map((r) => r.id))
            const extras = cached.filter((r) =>
              !r.word?.startsWith('__deleted__') &&
              extraWordsCache.includes(r.word ?? '') &&
              !existingIds.has(r.id)
            ) as CloudRow[]
            filtered = [...filtered, ...extras]
          }
          if (CLASSIFIED_DEDUPLICATE_TOPICS.includes(pf.classified)) {
            filtered = deduplicateClassifiedRows(filtered, CLASSIFIED_DEDUPLICATE_BY_WORD_ONLY.includes(pf.classified))
          }
          filtered = sortClassifiedRowsByWordOrder(filtered, pf.classified)
          const day1Incl = getClassifiedDay1Inclusions(pf.classified!, mode)
          if (day1Incl?.length) {
            const day1Set = new Set(day1Incl)
            const day1Excl = new Set(CLASSIFIED_DAY1_EXCLUSIONS[pf.classified] ?? [])
            const day1Rows = filtered.filter((r) => day1Set.has(r.word ?? ''))
            const rest = filtered.filter((r) => !day1Set.has(r.word ?? ''))
            const ordered = [...day1Rows, ...rest]
            const filteredOutExcl = day1Excl.size ? ordered.filter((r) => !day1Excl.has(r.word ?? '')) : ordered
            if (dayNumber) {
              const dayNExcl = getClassifiedDayNExclusions(pf.classified!, dayNumber, mode)
              const dayNExclSet = dayNExcl?.length ? new Set(dayNExcl) : null
              if (dayNExclSet) {
                let idx = (dayNumber - 1) * wordsPerDay
                filtered = []
                while (filtered.length < wordsPerDay && idx < filteredOutExcl.length) {
                  const r = filteredOutExcl[idx++]
                  if (!isRowExcludedByDayN(r, dayNExclSet)) filtered.push(r)
                }
              } else {
                filtered = filteredOutExcl.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
              }
            } else {
              filtered = filteredOutExcl.slice(0, wordsPerDay)
            }
          } else if (dayNumber) {
            let dayNExclSet = new Set(getClassifiedDayNExclusions(pf.classified!, dayNumber, mode))
            const excludePrevDays = CLASSIFIED_DAYN_EXCLUDE_PREV_DAY[pf.classified]
            if (excludePrevDays?.includes(dayNumber)) {
              const prevWords = getWordsFromPreviousDay(filtered, dayNumber - 1, wordsPerDay, getClassifiedDayNExclusionsMap(pf.classified!, mode))
              prevWords.forEach((w) => dayNExclSet.add(w))
            }
            if (dayNExclSet.size) {
              let idx = (dayNumber - 1) * wordsPerDay
              const targetWords: CloudRow[] = []
              while (targetWords.length < wordsPerDay && idx < filtered.length) {
                const r = filtered[idx++]
                if (!isRowExcludedByDayN(r, dayNExclSet)) targetWords.push(r)
              }
              filtered = targetWords
            } else {
              filtered = filtered.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
            }
          } else {
            filtered = filtered.slice(0, wordsPerDay)
          }
          setWords(filtered)
        }
        setLoading(false)
        return
      }

      const catExcl = pf.category ? CATEGORY_WORD_EXCLUSIONS[pf.category] : null
      const needFullFetchForCategory = !!catExcl?.length

      if (online && supabase) {
        if (needFullFetchForCategory) {
          let catQuery = supabase
            .from('generated_vocab')
            .select('*')
            .eq('mode', mode)
            .eq('category', pf.category!)
          if (pf.pos) catQuery = catQuery.eq('pos', pf.pos)
          const { data } = await catQuery
            .order('created_at', { ascending: true })
            .limit(2000)
          let cleaned = ((data ?? []) as CloudRow[]).filter(
            (r) => !r.word?.startsWith('__deleted__')
          )
          cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          const exclSet = new Set(catExcl!)
          cleaned = cleaned.filter((r) => !exclSet.has(r.word ?? ''))
          if (dayNumber) {
            const start = (dayNumber - 1) * wordsPerDay
            setWords(cleaned.slice(start, start + wordsPerDay))
          } else {
            setWords(cleaned.slice(0, wordsPerDay))
          }
        } else {
          const isAllWords = !pf.category && !pf.pos && !pf.topic
          const numberTailIds = isAllWords ? getAllWordsNumberTailIds(mode) : []
          const needNumberTail = numberTailIds.length > 0

          if (needNumberTail && dayNumber) {
            const numberIdFilter = `(${numberTailIds.join(',')})`
            const { count: nonNumCount } = await supabase
              .from('generated_vocab')
              .select('*', { count: 'exact', head: true })
              .eq('mode', mode)
              .not('id', 'in', numberIdFilter)
            const nonNumberCount = nonNumCount ?? 0
            const nonNumberDays = Math.ceil(nonNumberCount / wordsPerDay)

            if (dayNumber <= nonNumberDays) {
              const startIdx = (dayNumber - 1) * wordsPerDay
              const endIdx = startIdx + wordsPerDay - 1
              const { data } = await supabase
                .from('generated_vocab')
                .select('*')
                .eq('mode', mode)
                .not('id', 'in', numberIdFilter)
                .order('created_at', { ascending: true })
                .range(startIdx, endIdx)
              let cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
              cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
              setWords(cleaned)
            } else {
              const numOffset = (dayNumber - nonNumberDays - 1) * wordsPerDay
              const targetIds = numberTailIds.slice(numOffset, numOffset + wordsPerDay)
              if (targetIds.length === 0) { setWords([]); setLoading(false); return }
              const { data } = await supabase
                .from('generated_vocab')
                .select('*')
                .in('id', targetIds)
              const idOrder = new Map(targetIds.map((id, i) => [id, i]))
              let sorted = ((data ?? []) as CloudRow[]).sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
              sorted = sorted.filter((r) => !r.word?.startsWith('__deleted__'))
              setWords(sorted)
            }
          } else {
            let query = supabase
              .from('generated_vocab')
              .select('*')
              .eq('mode', mode)

            if (pf.category) query = query.eq('category', pf.category)
            if (pf.pos) query = query.eq('pos', pf.pos)
            if (pf.topic) {
              const orCond = buildTopicOrCondition(pf.topic, mode)
              if (orCond) query = query.or(orCond)
            }

            if (needNumberTail) {
              query = query.not('id', 'in', `(${numberTailIds.join(',')})`)
            }

            if (dayNumber) {
              const startIdx = (dayNumber - 1) * wordsPerDay
              const endIdx = startIdx + wordsPerDay - 1

              const { data } = await query
                .order('created_at', { ascending: true })
                .range(startIdx, endIdx)

              let cleaned = ((data ?? []) as CloudRow[]).filter(
                (r) => !r.word?.startsWith('__deleted__')
              )
              cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
              setWords(cleaned)
            } else {
              const { data } = await query
                .order('created_at', { ascending: true })
                .limit(wordsPerDay)

              let cleaned = ((data ?? []) as CloudRow[]).filter(
                (r) => !r.word?.startsWith('__deleted__')
              )
              cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
              setWords(cleaned)
            }
          }
        }
      } else {
        try {
          if (pf.topic) {
            const allData = await getVocabFromCache(mode)
            let filtered = allData.filter(
              (r) => !r.word?.startsWith('__deleted__') &&
                matchesTopicFilter(r as unknown as Record<string, unknown>, pf.topic!, mode)
            )
            filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
            if (dayNumber) {
              const start = (dayNumber - 1) * wordsPerDay
              filtered = filtered.slice(start, start + wordsPerDay)
            } else {
              filtered = filtered.slice(0, wordsPerDay)
            }
            setWords(filtered as CloudRow[])
          } else {
            const isAllWordsCache = !pf.category && !pf.pos && !pf.topic
            const numberTailIdsCache = isAllWordsCache ? getAllWordsNumberTailIds(mode) : []

            if (numberTailIdsCache.length > 0) {
              const allData = await getVocabFromCache(mode)
              let cleaned = allData.filter((r) => !r.word?.startsWith('__deleted__'))
              cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
              const numberIdSet = new Set(numberTailIdsCache)
              const nonNumber = cleaned.filter((r) => !numberIdSet.has(r.id))
              const numberIdMap = new Map(cleaned.map((r) => [r.id, r]))
              const numberRows = numberTailIdsCache.map((id) => numberIdMap.get(id)).filter(Boolean) as typeof cleaned
              const reordered = [...nonNumber, ...numberRows]
              if (dayNumber) {
                const start = (dayNumber - 1) * wordsPerDay
                setWords(reordered.slice(start, start + wordsPerDay) as CloudRow[])
              } else {
                setWords(reordered.slice(0, wordsPerDay) as CloudRow[])
              }
            } else {
              const cached = await getVocabFromCache(
                mode,
                pf.category,
                needFullFetchForCategory ? undefined : dayNumber,
                wordsPerDay,
                pf.pos
              )
              let cleaned = cached.filter(
                (r) => !r.word?.startsWith('__deleted__')
              ) as CloudRow[]
              cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
              if (needFullFetchForCategory && catExcl?.length) {
                const exclSet = new Set(catExcl)
                cleaned = cleaned.filter((r) => !exclSet.has(r.word ?? ''))
              }
              if (needFullFetchForCategory && dayNumber) {
                const start = (dayNumber - 1) * wordsPerDay
                setWords(cleaned.slice(start, start + wordsPerDay))
              } else {
                setWords(cleaned)
              }
            }
          }
        } catch {
          setWords([])
        }
      }
      setLoading(false)
    }
    void fetchWords()
  }, [mode, levelFilter, dayNumber, wordsPerDay, wrongAnswerMode, wrongWordIds, userWords])

  const currentWord = words[currentIndex]

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev)
  }, [])

  const goToNext = useCallback((direction: 'left' | 'right' = 'left') => {
    if (isAnimating) return
    setIsAnimating(true)
    setSlideDirection(direction)
    
    // 애니메이션 후 다음 카드로
    setTimeout(() => {
      setIsFlipped(false)
      setCurrentIndex((i) => {
        if (i < words.length - 1) {
          return i + 1
        } else {
          setIsComplete(true)
          return i
        }
      })
      setSlideDirection(null)
      setIsAnimating(false)
    }, 300)
  }, [words.length, isAnimating])

  const handleKnown = useCallback(() => {
    setKnownCount((c) => c + 1)
    // 알아요 선택해도 오답노트에서 자동 제거하지 않음
    // 오답노트 플래시카드에서 "외웠어요" 버튼으로만 제거 가능
    goToNext('left')
  }, [goToNext])

  const handleUnknown = useCallback(() => {
    setUnknownCount((c) => c + 1)
    // 몰라요 선택 시 오답노트에 추가 (언어별)
    if (currentWord) {
      addToWrongAnswers(currentWord.id, mode)
      setWrongWords((prev) => [...prev, currentWord])
    }
    goToNext('left')
  }, [goToNext, currentWord, mode])

  // 오답노트 모드: 외웠어요 (오답노트에서 제거, 언어별)
  const handleMastered = useCallback(() => {
    setKnownCount((c) => c + 1)
    if (currentWord) {
      removeFromWrongAnswers(currentWord.id, mode)
    }
    goToNext('left')
  }, [goToNext, currentWord, mode])

  // 오답노트 모드: 넘기기 (오답노트에서 제거 안함)
  const handleSkip = useCallback(() => {
    setUnknownCount((c) => c + 1)
    goToNext('left')
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

  // 오프라인인데 단어가 없는 경우 - 사용 불가 안내
  if (!online && words.length === 0 && !userWords?.length) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/95 p-4" style={{ paddingTop: 'calc(var(--safe-top) + 16px)', paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}>
        <div className="min-h-full flex flex-col items-center justify-center px-4">
          {/* 뒤로가기 버튼 */}
          <div className="absolute top-4 left-4" style={{ top: 'calc(var(--safe-top) + 16px)' }}>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition"
            >
              ← {lang === 'sw' ? 'Rudi' : '뒤로'}
            </button>
          </div>

          {/* 아이콘 영역 */}
          <div className="relative mb-8">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 border-2 border-orange-400/30 flex items-center justify-center">
              <div className="text-5xl sm:text-6xl">🃏</div>
            </div>
            <div className="absolute -bottom-2 -right-2 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/30 border-2 border-red-400/40 flex items-center justify-center">
              <span className="text-xl sm:text-2xl">📴</span>
            </div>
          </div>

          {/* 메인 메시지 */}
          <div className="text-center space-y-4 max-w-sm">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              {lang === 'sw' ? 'Kadi Hazipatikani' : '플래시카드를 사용할 수 없습니다'}
            </h2>
            
            <p className="text-sm sm:text-base text-white/80 leading-relaxed">
              {lang === 'sw' 
                ? 'Unahitaji kupakua data kwanza ili uweze kutumia kadi bila mtandao.'
                : '오프라인에서 플래시카드를 사용하려면 먼저 데이터를 다운로드해야 합니다.'}
            </p>
          </div>

          {/* 안내 카드 */}
          <div className="mt-8 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-400/20 max-w-sm w-full">
            <div className="flex items-start gap-3">
              <div className="text-xl sm:text-2xl">💡</div>
              <div>
                <div className="text-sm font-bold text-cyan-300 mb-1">
                  {lang === 'sw' ? 'Jinsi ya kutatua' : '해결 방법'}
                </div>
                <div className="text-xs text-white/60 leading-relaxed whitespace-pre-line">
                  {lang === 'sw'
                    ? '1. Unganisha na mtandao\n2. Nenda kwenye ukurasa wa nyumbani\n3. Bonyeza "📥 Pakua Yote"'
                    : '1. 인터넷에 연결해주세요\n2. 홈 화면으로 이동\n3. "📥 전체 다운로드" 버튼을 눌러주세요'}
                </div>
              </div>
            </div>
          </div>

          {/* 연결 대기 */}
          <div className="mt-6 flex items-center gap-2 text-sm text-white/50">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            <span>{lang === 'sw' ? 'Inasubiri muunganisho...' : '연결 대기 중...'}</span>
          </div>
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
      const trimmed = raw.includes(',') ? raw.split(',')[0].trim() : raw
      return (mode === 'sw'
        ? applySwOverride(w.word, trimmed)
        : applyKoOverride(w.word, trimmed)) ?? trimmed
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

  const wordOverrideEntry = WORD_DISPLAY_OVERRIDE[currentWord.word]
  const displayWord = wordOverrideEntry?.word ?? currentWord.word
  const displayWordPron = wordOverrideEntry?.pron ?? currentWord.word_pronunciation

  const rawMeaning = mode === 'sw' 
    ? (currentWord.meaning_sw || currentWord.meaning_en || '') 
    : (currentWord.meaning_ko || currentWord.meaning_en || '')
  const trimmedMeaning = rawMeaning.includes(',') ? rawMeaning.split(',')[0].trim() : rawMeaning
  const meaning = (mode === 'sw'
    ? applySwOverride(currentWord.word, trimmedMeaning)
    : applyKoOverride(currentWord.word, trimmedMeaning)) ?? trimmedMeaning
  
  const exOverride = currentWord.example ? EXAMPLE_DISPLAY_OVERRIDE[currentWord.example] : undefined
  const displayExample = exOverride?.text ?? currentWord.example
  const displayExamplePron = exOverride?.pron ?? currentWord.example_pronunciation

  const wordOverride = currentWord.word ? EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD[currentWord.word] : undefined
  const rawExTranslation = mode === 'sw'
    ? ((wordOverride?.sw ?? currentWord.example_translation_sw) || currentWord.example_translation_en || '')
    : ((wordOverride?.ko ?? currentWord.example_translation_ko) || currentWord.example_translation_en || '')
  const exampleTranslation = mode === 'sw'
    ? (EXAMPLE_TRANSLATION_EN_OVERRIDE[rawExTranslation] ?? rawExTranslation)
    : (EXAMPLE_TRANSLATION_KO_OVERRIDE[rawExTranslation] ?? EXAMPLE_TRANSLATION_EN_OVERRIDE[rawExTranslation] ?? rawExTranslation)
  const exampleTranslationPron = mode === 'ko' ? wordOverride?.koPron : undefined

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
          onClick={!isAnimating ? handleFlip : undefined}
          className={`w-full max-w-md cursor-pointer perspective-1000 transition-all duration-300 ease-out ${
            slideDirection === 'left' ? 'opacity-0 -translate-x-full rotate-[-10deg]' :
            slideDirection === 'right' ? 'opacity-0 translate-x-full rotate-[10deg]' : ''
          }`}
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
              <VocabImage
                url={currentWord.image_url}
                alt={currentWord.word}
                wikiSearchTerms={wikiSearchTitlesFromMeaningEn(
                  currentWord.meaning_en,
                  currentWord.word,
                )}
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl object-cover mb-4 sm:mb-6"
              />
              <div className="text-3xl sm:text-4xl font-extrabold text-white mb-2 sm:mb-3 flex items-center">
                {displayWord}
                <AudioBtn url={currentWord.word_audio_url} />
              </div>
              {displayWordPron && (
                <div className="text-base sm:text-lg text-cyan-400 font-semibold">
                  [{displayWordPron}]
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
                {displayWord}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mb-4 sm:mb-6 text-center">
                {meaning}
              </div>
              
              {displayExample && (
                <div className="w-full rounded-2xl bg-black/30 p-3 sm:p-4 mb-3 sm:mb-4">
                  <div className="text-sm sm:text-base text-white/90 mb-1 flex items-center flex-wrap">
                    {displayExample}
                    <AudioBtn url={currentWord.example_audio_url} />
                  </div>
                  {displayExamplePron && (
                    <div className="text-xs sm:text-sm text-cyan-400 mb-1 sm:mb-2">
                      [{displayExamplePron}]
                    </div>
                  )}
                  {exampleTranslation && (
                    <div className="text-xs sm:text-sm text-white/60">
                      {exampleTranslation}
                      {exampleTranslationPron && (
                        <span className="ml-1 text-cyan-400">[{exampleTranslationPron}]</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="p-3 sm:p-4 pb-20 sm:pb-8">
        {isFlipped ? (
          wrongAnswerMode ? (
            // 오답노트 모드: 넘기기 / 외웠어요
            <div className="flex gap-3 sm:gap-4 max-w-md mx-auto">
              <button
                onClick={handleSkip}
                disabled={isAnimating}
                className="flex-1 rounded-2xl bg-slate-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-slate-300 border-2 border-slate-500/30 hover:bg-slate-500/30 active:scale-95 transition touch-target disabled:opacity-50"
              >
                {lang === 'sw' ? '➡️ Ruka' : '➡️ 넘기기'}
              </button>
              <button
                onClick={handleMastered}
                disabled={isAnimating}
                className="flex-1 rounded-2xl bg-emerald-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-emerald-400 border-2 border-emerald-500/30 hover:bg-emerald-500/30 active:scale-95 transition touch-target disabled:opacity-50"
              >
                {lang === 'sw' ? '✅ Ondoa' : '✅ 오답노트 제거'}
              </button>
            </div>
          ) : (
            // 일반 모드: 몰라요 / 알아요
            <div className="flex gap-3 sm:gap-4 max-w-md mx-auto">
              <button
                onClick={handleUnknown}
                disabled={isAnimating}
                className="flex-1 rounded-2xl bg-rose-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-rose-400 border-2 border-rose-500/30 hover:bg-rose-500/30 active:scale-95 transition touch-target disabled:opacity-50"
              >
                {lang === 'sw' ? '❌ Sijui' : '❌ 몰라요'}
              </button>
              <button
                onClick={handleKnown}
                disabled={isAnimating}
                className="flex-1 rounded-2xl bg-emerald-500/20 py-4 sm:py-5 text-lg sm:text-xl font-bold text-emerald-400 border-2 border-emerald-500/30 hover:bg-emerald-500/30 active:scale-95 transition touch-target disabled:opacity-50"
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
