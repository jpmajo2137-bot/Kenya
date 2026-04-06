import { useEffect, useMemo, useState, useCallback } from 'react'
import type { Action } from '../app/state'
import type { Deck, VocabItem, WrongNoteItem } from '../lib/types'
import { Button } from '../components/Button'
import { cn } from '../components/cn'
import { t, type Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { getWrongAnswerIds, addToWrongAnswers, removeFromWrongAnswers, WRONG_ANSWERS_UPDATED_EVENT } from './FlashcardScreen'
import { getVocabByIds, getVocabFromCache, isOnline, onOnlineStatusChange, type CachedVocab } from '../lib/offlineCache'
import { canAccessQuiz, showRewardedAd, getQuizAccessRemainingTime } from '../lib/admob'
import { applyKoOverride, applyEnOverride, applySwOverride, WORD_DISPLAY_OVERRIDE } from '../lib/displayOverrides'
import { GLOBAL_WORD_EXCLUSIONS } from '../lib/filterUtils'

type QuizSource = 'all' | 'wrong' | { deckId: string } | { cloud: string }

type CloudWord = {
  id: string
  word: string
  word_audio_url: string | null
  meaning_ko_audio_url: string | null
  meaning_sw: string | null
  meaning_ko: string | null
  meaning_en: string | null
}

// 오답노트 키는 언어별로 분리 (FlashcardScreen에서 관리)
function getWrongAnswersKey(lang: 'sw' | 'ko'): string {
  return lang === 'ko' ? 'flashcard_wrong_answers_ko' : 'flashcard_wrong_answers_sw'
}

function mapCachedToCloud(row: CachedVocab): CloudWord {
  return {
    id: row.id,
    word: row.word,
    word_audio_url: row.word_audio_url ?? null,
    meaning_ko_audio_url: row.meaning_ko_audio_url ?? null,
    meaning_sw: row.meaning_sw ?? null,
    meaning_ko: row.meaning_ko ?? null,
    meaning_en: row.meaning_en ?? null,
  }
}

// 쉼표가 있으면 첫 번째 부분만 사용 (데이터 정제)
function cleanMeaning(text: string | null): string {
  if (!text) return ''
  return text.includes(',') ? text.split(',')[0].trim() : text
}

// 클라우드 단어장 카테고리
const CLOUD_CATEGORIES = ['모든 단어', '입문', '초급', '중급', '고급', '여행', '비즈니스', '쇼핑', '위기탈출']

// 카테고리 스와힐리어 번역
const CATEGORY_TRANSLATIONS: Record<string, string> = {
  '모든 단어': 'Maneno Yote',
  '입문': 'Utangulizi',
  '초급': 'Mwanzo',
  '중급': 'Kati',
  '고급': 'Juu',
  '여행': 'Safari',
  '비즈니스': 'Biashara',
  '쇼핑': 'Ununuzi',
  '위기탈출': 'Dharura',
}

function translateCategory(cat: string, lang: 'sw' | 'ko'): string {
  if (lang === 'sw' && CATEGORY_TRANSLATIONS[cat]) {
    return CATEGORY_TRANSLATIONS[cat]
  }
  return cat
}

function meaningOf(item: VocabItem, lang: 'sw' | 'ko') {
  // sw = 스와힐리어 사람용 → 영어로 표시
  // ko = 한국 사람용 → 한국어로 표시
  if (lang === 'sw') {
    const en = item.en?.trim()
    if (en) return applyEnOverride(en, item.sw) ?? en
    return item.ko
  }
  return item.ko
}

// 퀴즈 문제로 표시할 텍스트 (단어) - 이제 pickCloudOptionsWithDirection에서 처리
// function cloudQuestionOf(word: CloudWord, lang: 'sw' | 'ko') {
//   if (lang === 'sw') return word.word
//   return word.meaning_ko || word.meaning_en || ''
// }

// 퀴즈 보기로 표시할 텍스트 (뜻) - pickCloudOptionsWithDirection으로 대체됨
// function cloudAnswerOf(word: CloudWord, lang: 'sw' | 'ko') {
//   if (lang === 'sw') return word.meaning_ko || word.meaning_en || ''
//   return word.word
// }

// 기존 함수 (호환성 유지) - 이제 pickCloudOptionsWithDirection에서 처리
// function cloudMeaningOf(word: CloudWord, lang: 'sw' | 'ko') {
//   if (lang === 'sw') return word.meaning_sw || word.meaning_en || ''
//   return word.meaning_ko || word.meaning_en || ''
// }

function pickOptions(pool: VocabItem[], correct: VocabItem, lang: 'sw' | 'ko', cloudPool?: CloudWord[]) {
  const correctText = meaningOf(correct, lang)
  
  // 클라우드 단어 풀이 있으면 클라우드에서 보기 생성, 없으면 기존 pool에서 생성
  let candidates: string[]
  if (cloudPool && cloudPool.length > 0) {
    candidates = cloudPool
      .map((x) => {
        if (lang === 'sw') {
          const raw = cleanMeaning(x.meaning_en || x.meaning_ko)
          return applyEnOverride(raw, x.word) ?? raw
        }
        const raw = cleanMeaning(x.meaning_ko || x.meaning_en)
        return applyKoOverride(x.word, raw) ?? raw
      })
      .filter((t) => t && t !== correctText)
  } else {
    candidates = pool
      .map((x) => meaningOf(x, lang))
      .filter((t) => t && t !== correctText)
  }

  const uniq = Array.from(new Set(candidates))
  const opts: string[] = [correctText]

  while (opts.length < 4 && uniq.length) {
    const idx = Math.floor(Math.random() * uniq.length)
    const [picked] = uniq.splice(idx, 1)
    if (picked) opts.push(picked)
  }

  while (opts.length < 4) opts.push('—')

  // shuffle
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  return { correctText, options: opts }
}

// 한글이 포함되어 있는지 확인
function containsKorean(str: string | null | undefined) {
  if (!str) return false;
  return /[가-힣]/.test(str);
}

// 스와힐리어 단어 추출: word가 스와힐리어(한글 없음)면 word, 아니면 meaning_sw
function getSwahiliWord(item: CloudWord) {
  if (item.word && !containsKorean(item.word)) {
    const override = WORD_DISPLAY_OVERRIDE[item.word];
    return cleanMeaning(override?.word ?? item.word);
  }
  const rawSw = cleanMeaning(item.meaning_sw);
  if (rawSw) return applySwOverride(item.word, rawSw) ?? rawSw;
  return cleanMeaning(item.meaning_en) || '';
}

// 한국어 뜻 추출: word가 한국어면 word, 아니면 meaning_ko (단어장과 동일하게)
function getKoreanWord(item: CloudWord) {
  if (item.word && containsKorean(item.word)) {
    const override = WORD_DISPLAY_OVERRIDE[item.word];
    const w = override?.word ?? item.word;
    const raw = w.includes(',') ? w.split(',')[0].trim() : w;
    return applyKoOverride(item.word, raw) ?? raw;
  }
  const rawMeaning = item.meaning_ko || item.meaning_en || '';
  const trimmed = rawMeaning.includes(',') ? rawMeaning.split(',')[0].trim() : rawMeaning;
  return applyKoOverride(item.word, trimmed) ?? trimmed;
}

// isSwToKo: true = 스와힐리어 문제 → 한국어 보기, false = 한국어 문제 → 스와힐리어 보기
function pickCloudOptionsWithDirection(pool: CloudWord[], correct: CloudWord, isSwToKo: boolean) {
  // isSwToKo = true: 문제는 스와힐리어, 보기는 한국어
  // isSwToKo = false: 문제는 한국어, 보기는 스와힐리어
  const correctText = isSwToKo 
    ? getKoreanWord(correct)   // 스와힐리어 문제 → 한국어가 정답
    : getSwahiliWord(correct)  // 한국어 문제 → 스와힐리어가 정답
  
  
  const candidates = pool
    .map((x) => isSwToKo ? getKoreanWord(x) : getSwahiliWord(x))
    .filter((t) => t && t !== correctText)

  const uniq = Array.from(new Set(candidates))
  const opts: string[] = [correctText]

  while (opts.length < 4 && uniq.length) {
    const idx = Math.floor(Math.random() * uniq.length)
    const [picked] = uniq.splice(idx, 1)
    if (picked) opts.push(picked)
  }

  while (opts.length < 4) opts.push('—')

  // shuffle
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  return { correctText, options: opts }
}

// pickCloudOptionsWithDirection으로 대체됨
// function pickCloudOptions(pool: CloudWord[], correct: CloudWord, lang: 'sw' | 'ko') {
//   const correctText = cloudAnswerOf(correct, lang)
//   const candidates = pool
//     .map((x) => cloudAnswerOf(x, lang))
//     .filter((t) => t && t !== correctText)
//   const uniq = Array.from(new Set(candidates))
//   const opts: string[] = [correctText]
//   while (opts.length < 4 && uniq.length) {
//     const idx = Math.floor(Math.random() * uniq.length)
//     const [picked] = uniq.splice(idx, 1)
//     if (picked) opts.push(picked)
//   }
//   while (opts.length < 4) opts.push('—')
//   for (let i = opts.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1))
//     ;[opts[i], opts[j]] = [opts[j], opts[i]]
//   }
//   return { correctText, options: opts }
// }

export function QuizScreen({
  decks,
  items,
  wrong,
  now,
  dueOnly,
  meaningLang,
  quizCount,
  quizSource,
  dispatch,
  lang,
}: {
  decks: Deck[]
  items: VocabItem[]
  wrong: WrongNoteItem[]
  now: number
  dueOnly: boolean
  meaningLang: 'sw' | 'ko'
  quizCount: 5 | 10 | 20 | 50
  quizSource: QuizSource
  dispatch: (a: Action) => void
  lang: Lang
}) {
  const [phase, setPhaseState] = useState<'setup' | 'play' | 'result'>('setup')
  // 'all'은 이전 버전 호환성 - 클라우드 '모든 단어'로 변환
  const initialSource: QuizSource = quizSource === 'all' ? { cloud: '모든 단어' } : quizSource
  const [source, setSource] = useState<QuizSource>(initialSource)
  const [count, setCount] = useState<5 | 10 | 20 | 50>(quizCount)
  
  // 광고 관련 상태
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

  // 뒤로가기로 setup으로 돌아가는 wrapper (popstate에서 직접 처리)
  // const goToSetup = () => setPhaseState('setup')

  // phase를 play나 result로 변경할 때 history 추가
  const setPhase = (newPhase: 'setup' | 'play' | 'result') => {
    if (newPhase === 'play' || newPhase === 'result') {
      window.history.pushState({ quizPhase: newPhase }, '')
    }
    setPhaseState(newPhase)
  }

  // 뒤로가기 핸들러
  useEffect(() => {
    const handlePopState = () => {
      // 광고 모달이 열려있으면 모달만 닫기
      if (showAdModal) {
        setShowAdModal(false)
        return
      }
      // 현재 play나 result 상태면 setup으로
      setPhaseState((current) => {
        if (current === 'play' || current === 'result') {
          return 'setup'
        }
        return current
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [showAdModal])
  
  // 클라우드 단어 (cloudWords는 향후 확장을 위해 유지)
  const [_cloudWords, setCloudWords] = useState<CloudWord[]>([])
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudPool, setCloudPool] = useState<CloudWord[]>([])
  const [allCloudWords, setAllCloudWords] = useState<CloudWord[]>([]) // 전체 단어 (보기용)
  const [allCloudWordsLoading, setAllCloudWordsLoading] = useState(true) // 전체 단어 로딩 상태
  const [wrongAnswerVersion, setWrongAnswerVersion] = useState(0)
  const [online, setOnline] = useState(isOnline())

  // 오답노트 변경 이벤트 수신
  useEffect(() => {
    const handleWrongAnswersUpdated = () => {
      setWrongAnswerVersion((v) => v + 1)
    }
    window.addEventListener(WRONG_ANSWERS_UPDATED_EVENT, handleWrongAnswersUpdated)
    return () => window.removeEventListener(WRONG_ANSWERS_UPDATED_EVENT, handleWrongAnswersUpdated)
  }, [])

  // 온라인 상태 감지
  useEffect(() => {
    const unsubscribe = onOnlineStatusChange(setOnline)
    return unsubscribe
  }, [])

  const wrongIds = useMemo(() => new Set(wrong.map((w) => w.id)), [wrong])

  // 전체 클라우드 단어 가져오기 (보기용) - 모든 단어에서 보기 생성
  useEffect(() => {
    const fetchAllCloudWords = async () => {
      setAllCloudWordsLoading(true)
      const mode = lang === 'sw' ? 'sw' : 'ko'
      
      if (online && supabase) {
        // 온라인: 서버에서 가져오기
        const allData: CloudWord[] = []
        const pageSize = 1000
        let page = 0
        let hasMore = true
        
        while (hasMore) {
          const from = page * pageSize
          const to = from + pageSize - 1
          const { data } = await supabase
            .from('generated_vocab')
            .select('id, word, word_audio_url, meaning_ko_audio_url, meaning_sw, meaning_ko, meaning_en')
            .eq('mode', mode)
            .range(from, to)
          
          if (data && data.length > 0) {
            allData.push(...(data as CloudWord[]))
            page++
            hasMore = data.length === pageSize
          } else {
            hasMore = false
          }
        }
        
        setAllCloudWords(allData)
      } else {
        // 오프라인: 캐시에서 가져오기
        try {
          const cached = await getVocabFromCache(mode)
          const mapped: CloudWord[] = cached.map(c => ({
            id: c.id,
            word: c.word,
            word_audio_url: c.word_audio_url ?? null,
            meaning_ko_audio_url: c.meaning_ko_audio_url ?? null,
            meaning_sw: c.meaning_sw ?? null,
            meaning_ko: c.meaning_ko ?? null,
            meaning_en: c.meaning_en ?? null,
          }))
          setAllCloudWords(mapped)
        } catch {
          setAllCloudWords([])
        }
      }
      setAllCloudWordsLoading(false)
    }
    void fetchAllCloudWords()
  }, [lang, online])

  // 선택한 단어장의 클라우드 단어 가져오기 (문제용)
  useEffect(() => {
    let cancelled = false
    const fetchCloudWords = async () => {
      // 클라우드 소스인지 확인
      if (typeof source === 'object' && 'cloud' in source) {
        setCloudLoading(true)
        const mode = lang === 'sw' ? 'sw' : 'ko'
        const category = source.cloud !== '모든 단어' ? source.cloud : undefined
        
        if (online && supabase) {
          // 온라인: 서버에서 가져오기
          const allData: CloudWord[] = []
          const pageSize = 1000
          let page = 0
          let hasMore = true
          
          while (hasMore) {
            if (cancelled) return
            const from = page * pageSize
            const to = from + pageSize - 1
            
            let query = supabase
              .from('generated_vocab')
              .select('id, word, word_audio_url, meaning_ko_audio_url, meaning_sw, meaning_ko, meaning_en')
              .eq('mode', mode)
            
            if (category) {
              query = query.eq('category', category)
            }
            
            const { data } = await query.range(from, to)
            
            if (data && data.length > 0) {
              allData.push(...(data as CloudWord[]))
              page++
              hasMore = data.length === pageSize
            } else {
              hasMore = false
            }
          }
          
          if (cancelled) return
          const filtered = allData.filter((w) => !GLOBAL_WORD_EXCLUSIONS.includes(w.word ?? ''))
          setCloudWords(filtered)
          setCloudPool(filtered)
        } else {
          // 오프라인: 캐시에서 가져오기
          try {
            const cached = await getVocabFromCache(mode, category)
            const mapped: CloudWord[] = cached
              .map(c => ({
                id: c.id,
                word: c.word,
                word_audio_url: c.word_audio_url ?? null,
                meaning_ko_audio_url: c.meaning_ko_audio_url ?? null,
                meaning_sw: c.meaning_sw ?? null,
                meaning_ko: c.meaning_ko ?? null,
                meaning_en: c.meaning_en ?? null,
              }))
              .filter((w) => !GLOBAL_WORD_EXCLUSIONS.includes(w.word ?? ''))
            if (cancelled) return
            setCloudWords(mapped)
            setCloudPool(mapped)
          } catch {
            if (cancelled) return
            setCloudWords([])
            setCloudPool([])
          }
        }
        setCloudLoading(false)
        return
      }

      if (source === 'wrong') {
        // 현재 언어의 오답노트만 가져오기
        const wrongAnswerIds = getWrongAnswerIds(meaningLang)
        if (wrongAnswerIds.length === 0) {
          setCloudWords([])
          setCloudPool([])
          setCloudLoading(false)
          return
        }

        setCloudLoading(true)
        
        // 사용자 단어(items)에서 오답노트에 있는 단어 찾기
        const itemsMap = new Map(items.map((x) => [x.id, x]))
        const userWrongWords: CloudWord[] = []
        const cloudIdsToFetch: string[] = []
        
        for (const id of wrongAnswerIds) {
          const item = itemsMap.get(id)
          if (item) {
            // 사용자 단어 → CloudWord 형태로 변환
            userWrongWords.push({
              id: item.id,
              word: item.sw,
              word_audio_url: null,
              meaning_ko_audio_url: null,
              meaning_sw: null,
              meaning_ko: item.ko,
              meaning_en: item.en || null,
            })
          } else {
            cloudIdsToFetch.push(id)
          }
        }
        
        let fetched: CloudWord[] = []
        let hasFetchError = false

        if (cloudIdsToFetch.length > 0) {
          if (online && supabase) {
            // 온라인: 서버에서 가져오기
            const chunkSize = 500
            for (let i = 0; i < cloudIdsToFetch.length; i += chunkSize) {
              const chunk = cloudIdsToFetch.slice(i, i + chunkSize)
              const { data, error } = await supabase
                .from('generated_vocab')
                .select('id, word, word_audio_url, meaning_ko_audio_url, meaning_sw, meaning_ko, meaning_en')
                .in('id', chunk)
              if (error) {
                console.error('오답노트 퀴즈 불러오기 실패:', error)
                hasFetchError = true
              } else {
                fetched.push(...((data ?? []) as CloudWord[]))
              }
            }
          } else {
            // 오프라인: 캐시에서 가져오기
            try {
              const cachedRows = await getVocabByIds(cloudIdsToFetch)
              fetched = cachedRows.map(mapCachedToCloud)
            } catch {
              hasFetchError = true
            }
          }
        }

        const fetchedIds = new Set(fetched.map((w) => w.id))
        const missingIds = cloudIdsToFetch.filter((id) => !fetchedIds.has(id))
        let cached: CloudWord[] = []

        if (missingIds.length > 0) {
          try {
            const cachedRows = await getVocabByIds(missingIds)
            cached = cachedRows.map(mapCachedToCloud)
          } catch (error) {
            console.error('오답노트 캐시 로딩 실패:', error)
          }
        }

        // 클라우드 단어 + 캐시 단어 + 사용자 단어 합치기
        const merged = [...fetched, ...cached, ...userWrongWords]

        if (cancelled) return
        setCloudWords(merged)
        setCloudPool(merged)
        setCloudLoading(false)

        // 유효한 ID만 localStorage에 저장 (언어별)
        const mergedIds = new Set(merged.map((w) => w.id))
        const validIds = wrongAnswerIds.filter((id) => mergedIds.has(id) || itemsMap.has(id))
        if (validIds.length !== wrongAnswerIds.length || hasFetchError) {
          const updated = wrongAnswerIds.filter((id) => mergedIds.has(id))
          try {
            localStorage.setItem(getWrongAnswersKey(meaningLang), JSON.stringify(updated))
            if (updated.length !== wrongAnswerIds.length) {
              window.dispatchEvent(new Event(WRONG_ANSWERS_UPDATED_EVENT))
            }
          } catch {
            // ignore
          }
        }
        return
      }

      setCloudWords([])
      setCloudPool([])
      setCloudLoading(false)
    }
    void fetchCloudWords()
    return () => {
      cancelled = true
    }
  }, [source, lang, wrongAnswerVersion, online])

  // 사용자 단어장(deckId) 퀴즈에서는 dueOnly 무시 (퀴즈 중 SRS 업데이트로 단어가 사라지는 문제 방지)
  const isUserDeckSource = typeof source === 'object' && 'deckId' in source
  
  const pool = useMemo(() => {
    let base = items
    // 사용자 단어장 퀴즈에서는 dueOnly 필터 무시
    if (dueOnly && !isUserDeckSource) {
      base = base.filter((x) => x.srs.dueAt <= now)
    }
    if (source === 'all') return base
    if (source === 'wrong') return base.filter((x) => wrongIds.has(x.id))
    if (isUserDeckSource) {
      return base.filter((x) => x.deckId === source.deckId)
    }
    return []
  }, [dueOnly, items, source, wrongIds, now, isUserDeckSource])

  const isCloudSource = typeof source === 'object' && 'cloud' in source
  const isWrongSource = source === 'wrong'

  const deckName = useMemo(() => {
    if (source === 'all') return t('all', lang)
    if (source === 'wrong') return t('wrongNote', lang)
    if (typeof source === 'object' && 'cloud' in source) {
      return source.cloud
    }
    if (typeof source === 'object' && 'deckId' in source) {
      return decks.find((d) => d.id === source.deckId)?.name ?? t('wordbook', lang)
    }
    return t('wordbook', lang)
  }, [decks, source, lang])

  const [order, setOrder] = useState<VocabItem[]>([])
  const [cloudOrder, setCloudOrder] = useState<CloudWord[]>([])
  const [questionDirections, setQuestionDirections] = useState<boolean[]>([]) // true = 스와힐리어→한국어, false = 한국어→스와힐리어
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [correctText, setCorrectText] = useState<string>('')
  const [options, setOptions] = useState<string[]>([])
  const [removedFromWrong, setRemovedFromWrong] = useState(false) // 오답노트에서 제거됨

  const current = order[idx] ?? null
  const currentCloud = cloudOrder[idx] ?? null
  const currentDirection = questionDirections[idx] ?? true // true = 스와힐리어 문제, false = 한국어 문제

  // 실제 퀴즈 시작 로직
  const startQuizInternal = useCallback(() => {
    if (isCloudSource || isWrongSource) {
      // 클라우드 퀴즈
      const base = cloudPool.slice()
      // shuffle
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[base[i], base[j]] = [base[j], base[i]]
      }
      const q = base.slice(0, Math.min(count, base.length))
      
      // 각 문제의 방향을 랜덤하게 설정 (50% 스와힐리어→한국어, 50% 한국어→스와힐리어)
      const directions = q.map(() => Math.random() < 0.5)
      setQuestionDirections(directions)
      
      setCloudOrder(q)
      setOrder([])
      setIdx(0)
      setScore(0)
      setSelected(null)
      setRemovedFromWrong(false)
      setPhase('play')
      if (q[0]) {
        // 보기는 전체 단어(allCloudWords)에서 가져옴
        const optionsPool = allCloudWords.length > 0 ? allCloudWords : cloudPool
        const built = pickCloudOptionsWithDirection(optionsPool, q[0], directions[0])
        setCorrectText(built.correctText)
        setOptions(built.options)
      } else {
        setCorrectText('')
        setOptions([])
      }
    } else {
      // 로컬 퀴즈
      const base = pool.slice()
      // shuffle
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[base[i], base[j]] = [base[j], base[i]]
      }
      const q = base.slice(0, Math.min(count, base.length))
      setOrder(q)
      setCloudOrder([])
      setQuestionDirections([])
      setIdx(0)
      setScore(0)
      setSelected(null)
      setRemovedFromWrong(false)
      setPhase('play')
      if (q[0]) {
        // 보기는 전체 클라우드 단어에서 가져옴
        const built = pickOptions(pool, q[0], meaningLang, allCloudWords)
        setCorrectText(built.correctText)
        setOptions(built.options)
      } else {
        setCorrectText('')
        setOptions([])
      }
    }
    // 설정 기본값 저장
    dispatch({ type: 'settings', patch: { quizCount: count, quizSource: source } })
  }, [isCloudSource, isWrongSource, cloudPool, count, allCloudWords, pool, meaningLang, dispatch, source])

  // 퀴즈 시작 (광고 체크 포함)
  const start = () => {
    // 클라우드/오답 퀴즈는 보상형 광고 시청 필요
    if (isCloudSource || isWrongSource) {
      if (canAccessQuiz()) {
        // 권한 있음 - 바로 시작
        startQuizInternal()
      } else {
        // 권한 없음 - 광고 모달 표시
        window.history.pushState({ adModal: true }, '')
        setShowAdModal(true)
      }
    } else {
      // 로컬 퀴즈는 바로 시작
      startQuizInternal()
    }
  }

  // 광고 시청 후 퀴즈 시작
  const handleWatchAd = async () => {
    setAdLoading(true)
    try {
      const success = await showRewardedAd()
      if (success) {
        // 모달 히스토리 제거
        window.history.back()
        setQuizAccessRemaining(getQuizAccessRemainingTime())
        // 약간의 딜레이 후 퀴즈 시작 (광고 닫힘 애니메이션 대기)
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

  const answer = (text: string) => {
    if (selected) return
    setSelected(text)
    const ok = text === correctText
    if (ok) setScore((s) => s + 1)
    
    if (current) {
      dispatch({ type: 'quizAnswer', id: current.id, correct: ok })
      // 사용자 단어 오답 시 오답노트에 추가 (언어별)
      if (!ok) {
        addToWrongAnswers(current.id, meaningLang)
      }
    }
    
    // 클라우드 단어 오답 시 오답노트에 추가 (언어별)
    if (currentCloud && !ok) {
      addToWrongAnswers(currentCloud.id, meaningLang)
    }
  }

  const next = () => {
    const orderList = cloudOrder.length > 0 ? cloudOrder : order
    const nextIdx = idx + 1
    if (nextIdx >= orderList.length) {
      setPhase('result')
      return
    }
    setIdx(nextIdx)
    setSelected(null)
    setRemovedFromWrong(false)
    
    if (cloudOrder.length > 0) {
      // 보기는 전체 단어(allCloudWords)에서 가져옴
      const optionsPool = allCloudWords.length > 0 ? allCloudWords : cloudPool
      const nextDirection = questionDirections[nextIdx] ?? true
      const built = pickCloudOptionsWithDirection(optionsPool, cloudOrder[nextIdx], nextDirection)
      setCorrectText(built.correctText)
      setOptions(built.options)
    } else {
      // 보기는 전체 클라우드 단어에서 가져옴
      const built = pickOptions(pool, order[nextIdx], meaningLang, allCloudWords)
      setCorrectText(built.correctText)
      setOptions(built.options)
    }
  }

  // 모든 퀴즈에서 allCloudWords가 로드되어야 보기를 제대로 생성할 수 있음
  const canStart = (isCloudSource || isWrongSource) 
    ? cloudPool.length > 0 && (allCloudWords.length > 0 || !allCloudWordsLoading)
    : pool.length > 0 && (allCloudWords.length > 0 || !allCloudWordsLoading)
  const totalWords = (isCloudSource || isWrongSource) ? cloudPool.length : pool.length
  const isLoadingOptions = allCloudWordsLoading

  // 오프라인인데 캐시된 단어가 없는 경우 - 사용 불가 안내
  const isOfflineWithNoData = !online && !allCloudWordsLoading && allCloudWords.length === 0

  if (isOfflineWithNoData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        {/* 아이콘 영역 */}
        <div className="relative mb-8">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 border-2 border-orange-400/30 flex items-center justify-center">
            <div className="text-5xl sm:text-6xl">🧠</div>
          </div>
          <div className="absolute -bottom-2 -right-2 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/30 border-2 border-red-400/40 flex items-center justify-center">
            <span className="text-xl sm:text-2xl">📴</span>
          </div>
        </div>

        {/* 메인 메시지 */}
        <div className="text-center space-y-4 max-w-sm">
          <h2 className="text-xl sm:text-2xl font-extrabold text-white">
            {lang === 'sw' ? 'Jaribio Halipatikani' : '퀴즈를 사용할 수 없습니다'}
          </h2>
          
          <p className="text-sm sm:text-base text-white/80 leading-relaxed">
            {lang === 'sw' 
              ? 'Unahitaji kupakua data kwanza ili uweze kufanya majaribio bila mtandao.'
              : '오프라인에서 퀴즈를 풀려면 먼저 데이터를 다운로드해야 합니다.'}
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
              <div className="text-xs text-white/60 leading-relaxed">
                {lang === 'sw'
                  ? '1. Unganisha na mtandao\n2. Nenda kwenye ukurasa wa nyumbani\n3. Bonyeza "📥 Pakua Yote"\n4. Baada ya pakua kukamilika, unaweza kufanya majaribio bila mtandao!'
                  : '1. 인터넷에 연결해주세요\n2. 홈 화면으로 이동\n3. "📥 전체 다운로드" 버튼을 눌러주세요\n4. 다운로드 완료 후 오프라인에서도 퀴즈를 풀 수 있습니다!'}
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
    )
  }

  if (phase === 'setup') {
    const wordsLabel = lang === 'sw' ? 'maneno' : '단어'
    const noWordsMsg = lang === 'sw' ? 'Hakuna maneno katika eneo lililochaguliwa.' : '선택한 범위에 단어가 없어요.'
    const loadingMsg = lang === 'sw' ? 'Inapakia...' : '불러오는 중...'

    // 현재 선택된 값
    const getCurrentValue = () => {
      if (source === 'all') return 'all'
      if (source === 'wrong') return 'wrong'
      if (typeof source === 'object' && 'cloud' in source) return `cloud_${source.cloud}`
      if (typeof source === 'object' && 'deckId' in source) return source.deckId
      return 'all'
    }

    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="rounded-3xl p-4 sm:p-6 app-banner backdrop-blur">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-white">{t('quizTitle', lang)}</div>
            <div className="rounded-full bg-[rgb(var(--green))]/20 px-3 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-extrabold text-[rgb(var(--green))]">
              {totalWords.toLocaleString()} {wordsLabel}
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
                else if (v.startsWith('cloud_')) setSource({ cloud: v.replace('cloud_', '') })
                else setSource({ deckId: v })
              }}
            >
              {CLOUD_CATEGORIES.map((cat) => (
                <option key={cat} value={`cloud_${cat}`}>
                  {translateCategory(cat, lang)}
                </option>
              ))}
              {decks.filter(d => !CLOUD_CATEGORIES.includes(d.name)).map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
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
              {cloudLoading ? (
                <div className="h-14 sm:h-18 w-full rounded-3xl bg-white/10 flex items-center justify-center">
                  <span className="text-white/70 text-sm sm:text-base">{loadingMsg}</span>
                </div>
              ) : (
                <Button
                  variant="success"
                  className={cn(
                    'h-14 sm:h-18 w-full rounded-3xl shadow-[0_8px_32px_rgba(34,197,94,0.5)] ring-2 sm:ring-4 ring-green-400 transition touch-target',
                    !canStart ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98] hover:shadow-[0_12px_40px_rgba(34,197,94,0.6)]',
                  )}
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                  disabled={!canStart}
                  onClick={start}
                >
                  <span className="text-xl sm:text-2xl font-black tracking-wide text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 2px rgba(0,0,0,0.3)' }}>
                    {lang === 'sw' ? '▶ ANZA KUIS' : '▶ 퀴즈 시작'}
                  </span>
                </Button>
              )}
              {!canStart && !cloudLoading && !isLoadingOptions ? (
                <div className="rounded-2xl border border-[rgb(var(--orange))]/40 bg-[rgb(var(--orange))]/10 p-2.5 sm:p-3 text-xs sm:text-sm text-white">
                  {noWordsMsg}
                </div>
              ) : null}
              {isLoadingOptions ? (
                <div className="rounded-2xl border border-white/20 bg-white/5 p-2.5 sm:p-3 text-xs sm:text-sm text-white/70 text-center">
                  {lang === 'sw' ? 'Inapakia maneno...' : '보기 단어 로딩 중...'}
                </div>
              ) : null}
              
              {/* 퀴즈 접근 권한 남은 시간 표시 */}
              {(isCloudSource || isWrongSource) && quizAccessRemaining > 0 && (
                <div className="mt-2 rounded-2xl border border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/10 p-2.5 sm:p-3 text-xs sm:text-sm text-white/90 text-center">
                  <span className="text-[rgb(var(--green))]">✓</span>{' '}
                  {lang === 'sw' 
                    ? `Muda wa kuis bila tangazo: ${Math.ceil(quizAccessRemaining / 60000)} dakika`
                    : `광고 없이 퀴즈 가능: ${Math.ceil(quizAccessRemaining / 60000)}분 남음`}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* 보상형 광고 모달 */}
        {showAdModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
            <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 shadow-2xl border border-white/20">
              <div className="text-center">
                <div className="text-6xl mb-4 animate-bounce">🎬</div>
                <h3 className="text-2xl font-extrabold text-white mb-3">
                  {lang === 'sw' ? 'Tazama Tangazo' : '광고 시청'}
                </h3>
                <p className="text-sm text-white/80 mb-6 leading-relaxed">
                  {lang === 'sw' 
                    ? 'Tazama tangazo fupi kupata dakika 30 za kuis bila vikwazo!'
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
                      adLoading && 'opacity-70 cursor-wait'
                    )}
                    onClick={handleWatchAd}
                    disabled={adLoading}
                    style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                  >
                    {adLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span>
                        {lang === 'sw' ? 'Inapakia...' : '로딩 중...'}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span className="text-2xl">▶</span>
                        {lang === 'sw' ? 'Tazama Tangazo' : '광고 보기'}
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
                    {lang === 'sw' ? 'Ghairi' : '취소'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (phase === 'result') {
    const resultTotal = cloudOrder.length > 0 ? cloudOrder.length : order.length
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

  // 클라우드 또는 로컬 단어
  const currentWord = currentCloud ?? current
  if (!currentWord) {
    return null
  }

  const orderList = cloudOrder.length > 0 ? cloudOrder : order
  const progress = `${idx + 1} / ${orderList.length}`
  const ok = selected ? selected === correctText : null
  const correctLabel = t('correct', lang)
  const wrongLabel = lang === 'sw' ? `Kosa · Jibu: ${correctText}` : `오답 · 정답: ${correctText}`

  // 문제 표시 (방향에 따라 다른 언어)
  // currentDirection = true: 스와힐리어가 문제
  // currentDirection = false: 한국어가 문제
  const displayWord = currentCloud 
    ? (currentDirection ? getSwahiliWord(currentCloud) : getKoreanWord(currentCloud))
    : current?.sw

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
            <div className="text-[10px] sm:text-xs font-semibold text-white/70 truncate">{deckName}</div>
            <div className="text-sm sm:text-base font-extrabold text-white">{t('quiz', lang)} · {progress}</div>
          </div>
        </div>
        <div className="text-xs sm:text-sm font-extrabold text-white/90 shrink-0">{t('score', lang)} {score}</div>
      </div>

      <div className="rounded-3xl p-3 sm:p-5 app-card backdrop-blur">
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-extrabold text-white break-words">{displayWord}</div>
          {/* TTS 버튼 표시 조건:
              - 한국어 사용자(ko): 스와힐리어 문제일 때만 (currentDirection=true, word가 스와힐리어) → word_audio_url
              - 스와힐리어 사용자(sw): 한국어 문제일 때만 (currentDirection=false) → word가 한국어면 word_audio_url, 아니면 meaning_ko_audio_url
          */}
          {meaningLang === 'ko' && currentDirection && currentCloud?.word_audio_url && !containsKorean(currentCloud.word) && (
            <button
              onClick={() => {
                const a = new Audio(currentCloud.word_audio_url!)
                void a.play()
              }}
              className="mt-1.5 sm:mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base hover:bg-white/20 active:scale-95 transition touch-target"
            >
              🔊
            </button>
          )}
          {meaningLang === 'sw' && !currentDirection && (
            // word가 한국어면 word_audio_url 사용, 아니면 meaning_ko_audio_url 사용
            (containsKorean(currentCloud?.word || '') ? currentCloud?.word_audio_url : currentCloud?.meaning_ko_audio_url) && (
            <button
              onClick={() => {
                const audioUrl = containsKorean(currentCloud?.word || '') ? currentCloud?.word_audio_url : currentCloud?.meaning_ko_audio_url
                const a = new Audio(audioUrl!)
                void a.play()
              }}
              className="mt-1.5 sm:mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base hover:bg-white/20 active:scale-95 transition touch-target"
            >
              🔊
            </button>
          ))}
        </div>
        <div className="mt-3 sm:mt-4 grid gap-1 sm:gap-1.5">
          {options.map((opt, i) => {
            const disabled = !opt || opt === '—'
            const state =
              selected && opt === correctText
                ? 'border-[rgb(var(--green))]/45 bg-[rgb(var(--green))]/16'
                : selected && opt === selected
                  ? 'border-[rgb(var(--orange))]/55 bg-[rgb(var(--orange))]/16'
                  : 'border-white/10 bg-slate-950/25 hover:bg-white/5'
            return (
              <button
                key={`${i}_${opt}`}
                className={cn(
                  'rounded-xl sm:rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-3 text-left text-sm sm:text-base font-extrabold text-white transition active:scale-[0.99] touch-target',
                  disabled ? 'opacity-40' : state,
                )}
                onClick={() => (disabled ? null : answer(opt))}
                disabled={disabled}
              >
                {opt}
              </button>
            )
          })}
        </div>

        {selected ? (
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
              <Button onClick={next} className="shrink-0">{t('next', lang)}</Button>
            </div>
            {/* 오답노트 퀴즈에서 정답 시 오답노트 제거 버튼 (언어별) */}
            {isWrongSource && ok && currentCloud && (
              <button
                onClick={() => {
                  removeFromWrongAnswers(currentCloud.id, meaningLang)
                  setRemovedFromWrong(true)
                }}
                disabled={removedFromWrong}
                className={cn(
                  "w-full py-1.5 px-3 rounded-xl text-xs font-semibold transition",
                  removedFromWrong
                    ? "bg-white/10 border border-white/20 text-white/50"
                    : "bg-[rgb(var(--green))]/20 border border-[rgb(var(--green))]/30 text-[rgb(var(--green))] hover:bg-[rgb(var(--green))]/30 active:scale-[0.98]"
                )}
              >
                {removedFromWrong 
                  ? (lang === 'sw' ? '✓ Imeondolewa' : '✓ 제거됨')
                  : (lang === 'sw' ? '✅ Ondoa kwenye orodha ya makosa' : '✅ 오답노트에서 제거')
                }
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 sm:mt-4 text-center text-[10px] sm:text-xs font-semibold text-white/60">{t('selectAnswer', lang)}</div>
        )}
      </div>
    </div>
  )
}


