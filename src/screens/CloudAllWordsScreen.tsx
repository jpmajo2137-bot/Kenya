import { useEffect, useMemo, useState, useRef } from 'react'
import { Button } from '../components/Button'
import { VocabImage } from '../components/VocabImage'
import { wikiSearchTitlesFromMeaningEn } from '../lib/wikiThumbnail'
import { hasOpenAI } from '../lib/env'
import type { Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { generateWordImage } from '../lib/openai'
import {
  KO_DISPLAY_OVERRIDE,
  KO_DISPLAY_OVERRIDE_BY_WORD,
  EN_DISPLAY_OVERRIDE,
  EN_DISPLAY_OVERRIDE_BY_WORD,
  SW_DISPLAY_OVERRIDE_BY_WORD,
  SW_DISPLAY_OVERRIDE,
  EXAMPLE_DISPLAY_OVERRIDE,
  EXAMPLE_TRANSLATION_KO_OVERRIDE,
  EXAMPLE_TRANSLATION_EN_OVERRIDE,
  EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD,
  WORD_DISPLAY_OVERRIDE,
  EN_DISPLAY_OVERRIDE_BY_EXAMPLE,
  MUTE_MEANING_EN_AUDIO_BY_WORD,
} from '../lib/displayOverrides'
import { 
  getVocabFromCache, 
  getCacheCount, 
  isOnline, 
  onOnlineStatusChange,
  getMediaFromCache
} from '../lib/offlineCache'
import { parseLevelFilter, buildTopicOrCondition, matchesTopicFilter, getClassifiedWordIds, isWordInClassifiedTopic, getOrderedWordIds, ORDERED_WORD_EXCLUSIONS, CLASSIFIED_WORD_EXCLUSIONS, getClassifiedInclusions, CLASSIFIED_EXTRA_WORDS, getClassifiedDay1Inclusions, CLASSIFIED_DAY1_EXCLUSIONS, getClassifiedDayNExclusions, getClassifiedDayNExclusionsMap, CLASSIFIED_DAYN_EXCLUDE_PREV_DAY, CLASSIFIED_DEDUPLICATE_TOPICS, CLASSIFIED_DEDUPLICATE_BY_WORD_ONLY, getWordsFromPreviousDay, deduplicateClassifiedRows, isRowExcludedByDayN, GLOBAL_WORD_EXCLUSIONS, CATEGORY_WORD_EXCLUSIONS, POS_WORD_EXCLUSIONS, POS_DAYN_EXCLUSIONS_BY_MODE, sortClassifiedRowsByWordOrder, getAllWordsNumberTailIds } from '../lib/filterUtils'

type Mode = 'sw' | 'ko'

type CloudRow = {
  id: string
  mode: Mode
  word: string
  word_pronunciation: string | null
  word_audio_url: string | null
  image_url: string | null

  meaning_sw: string | null
  meaning_sw_pronunciation: string | null
  meaning_sw_audio_url: string | null

  meaning_ko: string | null
  meaning_ko_pronunciation: string | null
  meaning_ko_audio_url: string | null

  meaning_en: string | null
  meaning_en_pronunciation: string | null
  meaning_en_audio_url: string | null

  example: string | null
  example_pronunciation: string | null
  example_audio_url: string | null
  example_translation_sw: string | null
  example_translation_ko: string | null
  example_translation_en: string | null

  pos: string | null
  category: string | null
  difficulty: number | null

  created_at: string
}

/** 발음 표기: [대괄호] 스타일 */
function Pron({ value }: { value: string | null }) {
  if (!value) return null
  return (
    <span className="text-[13px] font-bold text-cyan-400 tracking-tight">
      [{value}]
    </span>
  )
}

/** 스피커 아이콘 버튼 (스피커 + 음파) - 오프라인 지원 */
function AudioBtn({ url, muted }: { url: string | null; muted?: boolean }) {
  const blobUrlRef = useRef<string | null>(null)

  if (!url) return null

  const playAudio = async () => {
    if (muted) return
    let urlToPlay = url

    // 오프라인이면 캐시에서 가져오기
    if (!isOnline()) {
      try {
        const blob = await getMediaFromCache(url)
        if (blob) {
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

  return (
    <button
      type="button"
      onClick={playAudio}
      className="mt-1 flex h-11 w-11 items-center justify-center rounded-xl bg-[#1a1f3c] border border-white/10 transition hover:bg-[#252b4a]"
      aria-label="Play audio"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#5ad4e6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#5ad4e6" stroke="none" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    </button>
  )
}


/** -하다 동사 중 'to be X'가 아닌 'to + 동사' 형태로 써야 하는 단어 (서빙하다 → to serve 등) */
const KO_VERB_EN_INFINITIVE_OVERRIDE: Record<string, string> = {
  서빙하다: 'to serve',
  재배하다: 'to cultivate',
  '씩 웃다': 'to grin',
  선택하다: 'to choose',
  교육하다: 'to educate',
}

/** 영어에서 'to be + 형용사'만 허용할 단어 (이 외는 'to + 동사원형'으로 표기해 문법 맞춤) */
const TO_BE_ADJECTIVES = new Set([
  'important', 'necessary', 'possible', 'impossible', 'sure', 'certain', 'likely', 'available', 'able',
  'afraid', 'aware', 'careful', 'happy', 'sad', 'ready', 'wrong', 'right', 'true', 'false', 'clear', 'obvious',
  'glad', 'sorry', 'pleased', 'surprised', 'interested', 'excited', 'worried', 'annoyed', 'confident', 'proud',
  'grateful', 'thankful', 'faithful', 'honest', 'patient', 'nervous', 'anxious', 'curious', 'jealous', 'embarrassed',
  'ashamed', 'satisfied', 'content', 'comfortable', 'uncomfortable', 'familiar', 'strange', 'similar', 'different',
  'useful', 'harmful', 'helpful', 'successful', 'famous', 'popular', 'essential', 'vital', 'critical', 'significant',
])

/** 영어 뜻에 섞인 한글(예: necessarily; 반드시) 제거 */
function stripKoreanFromEnDisplay(text: string): string {
  if (!text.trim()) return text
  const segments = text.split(';').map((s) => s.trim()).filter(Boolean)
  const enOnly = segments.filter((s) => !/[\uAC00-\uD7A3]/.test(s))
  return enOnly.length ? enOnly.join('; ') : text
}

/** 영어 예문에서 'to + 동사원형' 추출 (예: "I need to choose one" → "choose") */
function getInfinitiveFromEnExample(exampleEn: string | null): string | null {
  if (!exampleEn?.trim()) return null
  const m = exampleEn.match(/\bto\s+([a-z]+)\b/i)
  return m ? m[1].toLowerCase() : null
}

export function CloudAllWordsScreen({
  lang,
  mode,
  showEnglish = true,
  levelFilter = '',
  dayNumber,
  wordsPerDay = 40,
}: {
  lang: Lang
  mode: Mode
  showEnglish?: boolean
  levelFilter?: string // '입문', '초급', '중급', '고급' 또는 '' (전체)
  dayNumber?: number // Day 번호 (1부터 시작)
  wordsPerDay?: number // Day당 단어 수
}) {
  const [rows, setRows] = useState<CloudRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState<Record<string, boolean>>({})
  const [imgUrl, setImgUrl] = useState<Record<string, string>>({})
  const [imgError, setImgError] = useState<Record<string, string>>({})
  /** DB URL은 있는데 만료·차단으로 <img> 실패한 경우 GPT 생성 노출 */
  const [imgLoadFailed, setImgLoadFailed] = useState<Record<string, boolean>>({})

  const CLOUD_IMG_STORAGE_KEY = 'kenya_vocab_cloud_imgUrl'
  const [online, setOnline] = useState(isOnline())
  const [usingCache, setUsingCache] = useState(false)

  // 온라인 상태 감지
  useEffect(() => {
    const unsubscribe = onOnlineStatusChange(setOnline)
    return unsubscribe
  }, [])

  const categoryTranslations: Record<string, string> = {
    '입문': 'Utangulizi',
    '초급': 'Mwanzo',
    '중급': 'Kati',
    '고급': 'Juu',
    '여행': 'Safari',
    '비즈니스': 'Biashara',
    '쇼핑': 'Ununuzi',
    '위기탈출': 'Dharura',
    '명사': 'Nomino',
    '동사': 'Kitenzi',
    '형용사': 'Kivumishi',
    '부사': 'Kielezi',
    '구/표현': 'Msemo',
    '숫자1-50': 'Namba',
    '숫자/수량': 'Namba / Kiasi',
    '음식/음료': 'Chakula/Vinywaji',
    '가족/관계': 'Familia/Uhusiano',
    '자연/동물': 'Asili/Wanyama',
    '집/생활용품': 'Nyumba/Vifaa',
    '신체/건강': 'Mwili/Afya',
    '시간/날짜': 'Wakati/Tarehe',
    '색상/외모': 'Rangi/Sura',
    '교통/이동': 'Usafiri/Msogeo',
    '일상생활': 'Maisha ya Kila Siku',
  }

  const posDisplayNames: Record<string, { ko: string; sw: string }> = {
    noun: { ko: '명사', sw: 'Nomino' },
    verb: { ko: '동사', sw: 'Kitenzi' },
    adjective: { ko: '형용사', sw: 'Kivumishi' },
    adverb: { ko: '부사', sw: 'Kielezi' },
    phrase: { ko: '구/표현', sw: 'Msemo' },
  }

  const displayLabelRaw = levelFilter?.startsWith('ordered:')
    ? levelFilter.slice(8)
    : levelFilter?.startsWith('classified:')
    ? levelFilter.slice(11)
    : levelFilter?.startsWith('pos:')
    ? (posDisplayNames[levelFilter.slice(4)]?.[lang === 'sw' ? 'sw' : 'ko'] ?? levelFilter.slice(4))
    : levelFilter

  const labelOverrides: Record<string, { ko: string; sw: string }> = {
    '인사/기본표현': { ko: '인사', sw: 'Salamu' },
    '색상/외모': { ko: '색상/외모', sw: 'Rangi/Sura' },
    '교통/이동': { ko: '교통/이동', sw: 'Usafiri/Msogeo' },
    '일상생활': { ko: '일상생활', sw: 'Maisha ya Kila Siku' },
    '숫자1-50': { ko: '숫자', sw: 'Namba' },
  }

  const displayLabel = labelOverrides[displayLabelRaw ?? '']
    ? labelOverrides[displayLabelRaw!][lang === 'sw' ? 'sw' : 'ko']
    : displayLabelRaw

  const translatedLevel = lang === 'sw' && displayLabelRaw
    ? (displayLabelRaw === '인사/기본표현' ? 'Salamu' : (categoryTranslations[displayLabelRaw] || displayLabelRaw))
    : displayLabelRaw

  const title = levelFilter
    ? (lang === 'sw' ? translatedLevel : displayLabel)
    : (lang === 'sw' ? 'Maneno Yote' : '모든 단어')

  const handleGenerateImage = async (row: CloudRow) => {
    setImgError((prev) => ({ ...prev, [row.id]: '' }))
    setImgLoading((prev) => ({ ...prev, [row.id]: true }))
    try {
      const mainMeaning = mode === 'sw' ? row.meaning_sw || row.meaning_en || '' : row.meaning_ko || row.meaning_en || ''
      const url = await generateWordImage(row.word, mainMeaning)
      const nextUrl = url ?? ''
      setImgUrl((prev) => ({ ...prev, [row.id]: nextUrl }))
      setImgLoadFailed((prev) => ({ ...prev, [row.id]: false }))
      if (nextUrl) {
        try {
          const stored = JSON.parse(localStorage.getItem(CLOUD_IMG_STORAGE_KEY) || '{}') as Record<string, string>
          stored[row.id] = nextUrl
          localStorage.setItem(CLOUD_IMG_STORAGE_KEY, JSON.stringify(stored))
        } catch { /* ignore */ }
      }
    } catch (e) {
      setImgError((prev) => ({ ...prev, [row.id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setImgLoading((prev) => ({ ...prev, [row.id]: false }))
    }
  }

  // 저장해 둔 생성 이미지 URL 복원 (DB에 image_url 없는 카드)
  useEffect(() => {
    if (rows.length === 0) return
    try {
      const stored = JSON.parse(localStorage.getItem(CLOUD_IMG_STORAGE_KEY) || '{}') as Record<string, string>
      const toRestore: Record<string, string> = {}
      for (const r of rows) {
        if (!r.image_url && stored[r.id]) toRestore[r.id] = stored[r.id]
      }
      if (Object.keys(toRestore).length > 0) {
        setImgUrl((prev) => ({ ...prev, ...toRestore }))
      }
    } catch { /* ignore */ }
  }, [rows])

  // 오프라인 캐시에서 데이터 가져오기
  const fetchFromCache = async () => {
    setLoading(true)
    setError(null)
    setUsingCache(true)
    try {
      const pf = parseLevelFilter(levelFilter)

      if (pf.disabled) {
        setTotalCount(0)
        setRows([])
        setLoading(false)
        return
      }

      if (pf.ordered) {
        const orderedIds = getOrderedWordIds(pf.ordered, mode)
        if (orderedIds.length === 0) { setRows([]); setTotalCount(0); setLoading(false); return }
        const allData = await getVocabFromCache(mode)
        const idMap = new Map(allData.map((r) => [r.id, r]))
        const sorted = orderedIds.map((id) => idMap.get(id)).filter(Boolean) as CloudRow[]
        const exclusions = ORDERED_WORD_EXCLUSIONS[pf.ordered]
        let filtered = exclusions?.length
          ? sorted.filter((r) => !exclusions.includes(r.word ?? ''))
          : sorted
        filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
        setTotalCount(filtered.length)
        const targetRows = dayNumber
          ? filtered.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
          : filtered
        setRows(targetRows)
        setLoading(false)
        return
      }

      if (pf.classified) {
        const inclusions = getClassifiedInclusions(pf.classified, mode)
        const allData = await getVocabFromCache(mode)
        let filtered: typeof allData
        if (inclusions?.length) {
          filtered = allData.filter((r) =>
            !r.word?.startsWith('__deleted__') && inclusions.includes(r.word ?? '')
          )
        } else {
          filtered = allData.filter((r) =>
            !r.word?.startsWith('__deleted__') &&
            isWordInClassifiedTopic(r.id, pf.classified!)
          )
          const exclusions = CLASSIFIED_WORD_EXCLUSIONS[pf.classified]
          if (exclusions?.length) {
            filtered = filtered.filter((r) => !exclusions.includes(r.word ?? ''))
          }
        }
        filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
        const extraWords = CLASSIFIED_EXTRA_WORDS[pf.classified!]
        if (extraWords?.length) {
          const existingIds = new Set(filtered.map((r) => r.id))
          const extras = allData.filter((r) =>
            !r.word?.startsWith('__deleted__') &&
            extraWords.includes(r.word ?? '') &&
            !existingIds.has(r.id)
          )
          filtered = [...filtered, ...extras]
        }
        if (CLASSIFIED_DEDUPLICATE_TOPICS.includes(pf.classified!)) {
          filtered = deduplicateClassifiedRows(filtered, CLASSIFIED_DEDUPLICATE_BY_WORD_ONLY.includes(pf.classified!))
        }
        filtered = sortClassifiedRowsByWordOrder(filtered, pf.classified!)
        const day1Incl = getClassifiedDay1Inclusions(pf.classified!, mode)
        if (day1Incl?.length) {
          const day1Set = new Set(day1Incl)
          const day1Excl = new Set(CLASSIFIED_DAY1_EXCLUSIONS[pf.classified] ?? [])
          const day1Rows = filtered.filter((r) => day1Set.has(r.word ?? ''))
          const rest = filtered.filter((r) => !day1Set.has(r.word ?? ''))
          const ordered = [...day1Rows, ...rest]
          const filteredOutExcl = day1Excl.size ? ordered.filter((r) => !day1Excl.has(r.word ?? '')) : ordered
          const total = filteredOutExcl.length
          if (dayNumber) {
            const dayNExcl = getClassifiedDayNExclusions(pf.classified!, dayNumber, mode)
            const dayNExclSet = dayNExcl?.length ? new Set(dayNExcl) : null
            let rows: CloudRow[]
            if (dayNExclSet) {
              let idx = (dayNumber - 1) * wordsPerDay
              rows = []
              while (rows.length < wordsPerDay && idx < filteredOutExcl.length) {
                const r = filteredOutExcl[idx++]
                if (!isRowExcludedByDayN(r, dayNExclSet)) rows.push(r)
              }
            } else {
              const start = (dayNumber - 1) * wordsPerDay
              rows = filteredOutExcl.slice(start, start + wordsPerDay) as CloudRow[]
            }
            setTotalCount(total)
            setRows(rows)
          } else {
            setTotalCount(total)
            setRows(filteredOutExcl.slice(0, 500) as CloudRow[])
          }
        } else {
          setTotalCount(filtered.length)
          if (dayNumber) {
            let dayNExclSet = new Set(getClassifiedDayNExclusions(pf.classified!, dayNumber, mode))
            const excludePrevDays = CLASSIFIED_DAYN_EXCLUDE_PREV_DAY[pf.classified]
            if (excludePrevDays?.includes(dayNumber)) {
              const prevDay = dayNumber - 1
              const prevWords = getWordsFromPreviousDay(filtered, prevDay, wordsPerDay, getClassifiedDayNExclusionsMap(pf.classified!, mode))
              prevWords.forEach((w) => dayNExclSet.add(w))
            }
            let targetRows: CloudRow[]
            if (dayNExclSet.size) {
              let idx = (dayNumber - 1) * wordsPerDay
              targetRows = []
              while (targetRows.length < wordsPerDay && idx < filtered.length) {
                const r = filtered[idx++]
                if (!isRowExcludedByDayN(r, dayNExclSet)) targetRows.push(r)
              }
            } else {
              const start = (dayNumber - 1) * wordsPerDay
              targetRows = filtered.slice(start, start + wordsPerDay) as CloudRow[]
            }
            setRows(targetRows)
          } else {
            setRows(filtered.slice(0, 500) as CloudRow[])
          }
        }
        setLoading(false)
        return
      }

      if (pf.topic) {
        const allData = await getVocabFromCache(mode)
        let filtered = allData.filter((r) =>
          !r.word?.startsWith('__deleted__') &&
          matchesTopicFilter(r as unknown as Record<string, unknown>, pf.topic!, mode)
        )
        filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
        setTotalCount(filtered.length)
        if (dayNumber) {
          const start = (dayNumber - 1) * wordsPerDay
          setRows(filtered.slice(start, start + wordsPerDay) as CloudRow[])
        } else {
          setRows(filtered.slice(0, 500) as CloudRow[])
        }
      } else {
        const catExcl = pf.category ? CATEGORY_WORD_EXCLUSIONS[pf.category] : null
        const posExcl = pf.pos ? POS_WORD_EXCLUSIONS[pf.pos] : null
        const posDayExcl = (pf.pos && dayNumber) ? POS_DAYN_EXCLUSIONS_BY_MODE[pf.pos]?.[mode]?.[dayNumber] ?? null : null
        const needFullFetch = !!(catExcl?.length || posExcl?.length || posDayExcl?.length)
        const isAllWords = !pf.category && !pf.pos && !pf.topic
        const numberTailIds = isAllWords ? getAllWordsNumberTailIds(mode) : []
        const needNumberTail = numberTailIds.length > 0

        if (needNumberTail) {
          const allData = await getVocabFromCache(mode)
          let cleaned = allData.filter((r) => !r.word?.startsWith('__deleted__'))
          cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          const numberIdSet = new Set(numberTailIds)
          const nonNumber = cleaned.filter((r) => !numberIdSet.has(r.id))
          const numberIdMap = new Map(cleaned.map((r) => [r.id, r]))
          const numberRows = numberTailIds.map((id) => numberIdMap.get(id)).filter(Boolean) as typeof cleaned
          const reordered = [...nonNumber, ...numberRows]
          setTotalCount(reordered.length)
          if (dayNumber) {
            const start = (dayNumber - 1) * wordsPerDay
            setRows(reordered.slice(start, start + wordsPerDay) as CloudRow[])
          } else {
            setRows(reordered.slice(0, 500) as CloudRow[])
          }
        } else {
          const data = await getVocabFromCache(mode, pf.category, needFullFetch ? undefined : dayNumber, wordsPerDay, pf.pos)
          let cleaned = data.filter((r) => !r.word?.startsWith('__deleted__'))
          cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          if (catExcl?.length) {
            const exclSet = new Set(catExcl)
            cleaned = cleaned.filter((r) => !exclSet.has(r.word ?? ''))
          }
          if (posExcl?.length) {
            const exclSet = new Set(posExcl)
            cleaned = cleaned.filter((r) => !exclSet.has(r.word ?? ''))
          }
          setTotalCount(needFullFetch ? cleaned.length : await getCacheCount(mode, pf.category, pf.pos))
          if (needFullFetch) {
            if (dayNumber) {
              if (posDayExcl?.length) {
                const dayExclSet = new Set(posDayExcl)
                let idx = (dayNumber - 1) * wordsPerDay
                const targetRows: typeof cleaned = []
                while (targetRows.length < wordsPerDay && idx < cleaned.length) {
                  const r = cleaned[idx++]
                  if (!isRowExcludedByDayN(r, dayExclSet)) targetRows.push(r)
                }
                setRows(targetRows as CloudRow[])
              } else {
                const start = (dayNumber - 1) * wordsPerDay
                setRows(cleaned.slice(start, start + wordsPerDay) as CloudRow[])
              }
            } else {
              setRows(cleaned.slice(0, 500) as CloudRow[])
            }
          } else {
            setRows(cleaned as CloudRow[])
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // 온라인에서 데이터 가져오기
  const fetchFromCloud = async () => {
    if (!supabase) {
      setError(lang === 'sw' ? 'Supabase haijawekwa.' : 'Supabase 설정이 없습니다.')
      return
    }
    setLoading(true)
    setError(null)
    setUsingCache(false)
    try {
      const pf = parseLevelFilter(levelFilter)

      if (pf.disabled) {
        setTotalCount(0)
        setRows([])
        setLoading(false)
        return
      }

      if (pf.ordered) {
        const orderedIds = getOrderedWordIds(pf.ordered, mode)
        if (orderedIds.length === 0) { setRows([]); setTotalCount(0); setLoading(false); return }
        const { data, error: e } = await supabase
          .from('generated_vocab')
          .select('*')
          .in('id', orderedIds)
        if (e) throw e
        const dataMap = new Map((data ?? []).map((r: CloudRow) => [r.id, r]))
        const sorted = orderedIds.map((id) => dataMap.get(id)).filter(Boolean) as CloudRow[]
        let cleaned = sorted.filter((r) => !r.word?.startsWith('__deleted__'))
        const exclusions = ORDERED_WORD_EXCLUSIONS[pf.ordered]
        let filtered = exclusions?.length
          ? cleaned.filter((r) => !exclusions.includes(r.word ?? ''))
          : cleaned
        filtered = filtered.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
        setTotalCount(filtered.length)
        const targetRows = dayNumber
          ? filtered.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
          : filtered
        setRows(targetRows)
        setLoading(false)
        return
      }

      if (pf.classified) {
        const inclusions = getClassifiedInclusions(pf.classified, mode)
        if (inclusions?.length) {
          const { data, error: e } = await supabase
            .from('generated_vocab')
            .select('*')
            .eq('mode', mode)
            .in('word', inclusions)
            .order('created_at', { ascending: true })
          if (e) throw e
          let cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
          cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          cleaned = sortClassifiedRowsByWordOrder(cleaned, pf.classified)
          setTotalCount(cleaned.length)
          const targetRows = dayNumber
            ? cleaned.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay)
            : cleaned.slice(0, 500)
          setRows(targetRows)
          setLoading(false)
          return
        }
        const ids = getClassifiedWordIds(pf.classified, mode)
        if (ids.length === 0) { setRows([]); setTotalCount(0); setLoading(false); return }
        const BATCH = 100
        let allData: CloudRow[] = []
        for (let i = 0; i < ids.length; i += BATCH) {
          const chunk = ids.slice(i, i + BATCH)
          const { data, error: e } = await supabase
            .from('generated_vocab')
            .select('*')
            .eq('mode', mode)
            .in('id', chunk)
            .order('created_at', { ascending: true })
          if (e) throw e
          allData = allData.concat((data ?? []) as CloudRow[])
        }
        let cleaned = allData.filter((r) => !r.word?.startsWith('__deleted__'))
        const exclusions = CLASSIFIED_WORD_EXCLUSIONS[pf.classified]
        if (exclusions?.length) {
          cleaned = cleaned.filter((r) => !exclusions.includes(r.word ?? ''))
        }
        cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
        const extraWords = CLASSIFIED_EXTRA_WORDS[pf.classified]
        if (extraWords?.length && supabase) {
          const existingWords = new Set(cleaned.map((r) => r.word))
          const missing = extraWords.filter((w) => !existingWords.has(w))
          if (missing.length) {
            const { data: extraData } = await supabase
              .from('generated_vocab')
              .select('*')
              .eq('mode', mode)
              .in('word', missing)
            if (extraData?.length) {
              cleaned = [...cleaned, ...(extraData as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))]
            }
          }
        }
        if (CLASSIFIED_DEDUPLICATE_TOPICS.includes(pf.classified)) {
          cleaned = deduplicateClassifiedRows(cleaned, CLASSIFIED_DEDUPLICATE_BY_WORD_ONLY.includes(pf.classified))
        }
        cleaned = sortClassifiedRowsByWordOrder(cleaned, pf.classified)
        const day1Incl = getClassifiedDay1Inclusions(pf.classified!, mode)
        if (day1Incl?.length) {
          const day1Set = new Set(day1Incl)
          const day1Excl = new Set(CLASSIFIED_DAY1_EXCLUSIONS[pf.classified] ?? [])
          const day1Rows = cleaned.filter((r) => day1Set.has(r.word ?? ''))
          const rest = cleaned.filter((r) => !day1Set.has(r.word ?? ''))
          const ordered = [...day1Rows, ...rest]
          const filteredOutExcl = day1Excl.size ? ordered.filter((r) => !day1Excl.has(r.word ?? '')) : ordered
          const total = filteredOutExcl.length
          if (dayNumber) {
            const dayNExcl = getClassifiedDayNExclusions(pf.classified!, dayNumber, mode)
            const dayNExclSet = dayNExcl?.length ? new Set(dayNExcl) : null
            let rows: CloudRow[]
            if (dayNExclSet) {
              let idx = (dayNumber - 1) * wordsPerDay
              rows = []
              while (rows.length < wordsPerDay && idx < filteredOutExcl.length) {
                const r = filteredOutExcl[idx++]
                if (!isRowExcludedByDayN(r, dayNExclSet)) rows.push(r)
              }
            } else {
              const start = (dayNumber - 1) * wordsPerDay
              rows = filteredOutExcl.slice(start, start + wordsPerDay)
            }
            setTotalCount(total)
            setRows(rows)
          } else {
            setTotalCount(total)
            setRows(filteredOutExcl.slice(0, 500))
          }
        } else {
          setTotalCount(cleaned.length)
          if (dayNumber) {
            let dayNExclSet = new Set(getClassifiedDayNExclusions(pf.classified!, dayNumber, mode))
            const excludePrevDays = CLASSIFIED_DAYN_EXCLUDE_PREV_DAY[pf.classified]
            if (excludePrevDays?.includes(dayNumber)) {
              const prevDay = dayNumber - 1
              const prevWords = getWordsFromPreviousDay(cleaned, prevDay, wordsPerDay, getClassifiedDayNExclusionsMap(pf.classified!, mode))
              prevWords.forEach((w) => dayNExclSet.add(w))
            }
            let targetRows: CloudRow[]
            if (dayNExclSet.size) {
              let idx = (dayNumber - 1) * wordsPerDay
              targetRows = []
              while (targetRows.length < wordsPerDay && idx < cleaned.length) {
                const r = cleaned[idx++]
                if (!isRowExcludedByDayN(r, dayNExclSet)) targetRows.push(r)
              }
            } else {
              targetRows = cleaned.slice((dayNumber - 1) * wordsPerDay, (dayNumber - 1) * wordsPerDay + wordsPerDay) as CloudRow[]
            }
            setRows(targetRows)
          } else {
            setRows(cleaned.slice(0, 500) as CloudRow[])
          }
        }
        setLoading(false)
        return
      }

      const catExcl = pf.category ? CATEGORY_WORD_EXCLUSIONS[pf.category] : null
      const posExcl = pf.pos ? POS_WORD_EXCLUSIONS[pf.pos] : null
      const needFullFetchForCategory = !!(catExcl?.length || posExcl?.length)

      if (needFullFetchForCategory) {
        let catQuery = supabase
          .from('generated_vocab')
          .select('*')
          .eq('mode', mode)
        if (pf.category) catQuery = catQuery.eq('category', pf.category)
        if (pf.pos) catQuery = catQuery.eq('pos', pf.pos)
        const { data, error: e } = await catQuery
          .order('created_at', { ascending: true })
          .limit(2000)
        if (e) throw e
        let cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
        cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
        if (catExcl?.length) {
          const exclSet = new Set(catExcl)
          cleaned = cleaned.filter((r) => !exclSet.has(r.word ?? ''))
        }
        if (posExcl?.length) {
          const exclSet = new Set(posExcl)
          cleaned = cleaned.filter((r) => !exclSet.has(r.word ?? ''))
        }
        setTotalCount(cleaned.length)
        if (dayNumber) {
          const posDayExcl = pf.pos ? POS_DAYN_EXCLUSIONS_BY_MODE[pf.pos]?.[mode]?.[dayNumber] : null
          if (posDayExcl?.length) {
            const dayExclSet = new Set(posDayExcl)
            let idx = (dayNumber - 1) * wordsPerDay
            const targetRows: CloudRow[] = []
            while (targetRows.length < wordsPerDay && idx < cleaned.length) {
              const r = cleaned[idx++]
              if (!isRowExcludedByDayN(r, dayExclSet)) targetRows.push(r)
            }
            setRows(targetRows)
          } else {
            const start = (dayNumber - 1) * wordsPerDay
            setRows(cleaned.slice(start, start + wordsPerDay))
          }
        } else {
          setRows(cleaned.slice(0, 500))
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
          setTotalCount(nonNumberCount + numberTailIds.length)
          const nonNumberDays = Math.ceil(nonNumberCount / wordsPerDay)

          if (dayNumber <= nonNumberDays) {
            const startIdx = (dayNumber - 1) * wordsPerDay
            const endIdx = startIdx + wordsPerDay - 1
            const { data, error: e } = await supabase
              .from('generated_vocab')
              .select('*')
              .eq('mode', mode)
              .not('id', 'in', numberIdFilter)
              .order('created_at', { ascending: true })
              .range(startIdx, endIdx)
            if (e) throw e
            let cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
            cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
            setRows(cleaned)
          } else {
            const numOffset = (dayNumber - nonNumberDays - 1) * wordsPerDay
            const targetIds = numberTailIds.slice(numOffset, numOffset + wordsPerDay)
            if (targetIds.length === 0) { setRows([]); setLoading(false); return }
            const { data, error: e } = await supabase
              .from('generated_vocab')
              .select('*')
              .in('id', targetIds)
            if (e) throw e
            const idOrder = new Map(targetIds.map((id, i) => [id, i]))
            let sorted = ((data ?? []) as CloudRow[]).sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
            sorted = sorted.filter((r) => !r.word?.startsWith('__deleted__'))
            setRows(sorted)
          }
        } else if (needNumberTail && !dayNumber) {
          const { count } = await supabase
            .from('generated_vocab')
            .select('*', { count: 'exact', head: true })
            .eq('mode', mode)
          setTotalCount(count ?? 0)
          const { data, error: e } = await supabase
            .from('generated_vocab')
            .select('*')
            .eq('mode', mode)
            .not('id', 'in', `(${numberTailIds.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(500)
          if (e) throw e
          let cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
          cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
          setRows(cleaned)
        } else {
          let countQuery = supabase
            .from('generated_vocab')
            .select('*', { count: 'exact', head: true })
            .eq('mode', mode)
          if (pf.category) countQuery = countQuery.eq('category', pf.category)
          if (pf.pos) countQuery = countQuery.eq('pos', pf.pos)
          if (pf.topic) {
            const orCond = buildTopicOrCondition(pf.topic, mode)
            if (orCond) countQuery = countQuery.or(orCond)
          }
          const { count } = await countQuery
          setTotalCount(count ?? 0)

          let dataQuery = supabase
            .from('generated_vocab')
            .select('*')
            .eq('mode', mode)
          if (pf.category) dataQuery = dataQuery.eq('category', pf.category)
          if (pf.pos) dataQuery = dataQuery.eq('pos', pf.pos)
          if (pf.topic) {
            const orCond = buildTopicOrCondition(pf.topic, mode)
            if (orCond) dataQuery = dataQuery.or(orCond)
          }

          if (dayNumber) {
            const startIdx = (dayNumber - 1) * wordsPerDay
            const endIdx = startIdx + wordsPerDay - 1
            const { data, error: e } = await dataQuery
              .order('created_at', { ascending: true })
              .range(startIdx, endIdx)
            if (e) throw e
            let cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
            cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
            setRows(cleaned)
          } else {
            const { data, error: e } = await dataQuery
              .order('created_at', { ascending: false })
              .limit(500)
            if (e) throw e
            let cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
            cleaned = cleaned.filter((r) => !GLOBAL_WORD_EXCLUSIONS.includes(r.word ?? ''))
            setRows(cleaned)
          }
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // 데이터 가져오기 (온라인/오프라인 자동 전환)
  const fetchRows = async () => {
    if (online && supabase) {
      await fetchFromCloud()
    } else {
      // 오프라인이거나 Supabase 없으면 캐시에서 가져오기
      await fetchFromCache()
    }
  }

  useEffect(() => {
    void fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, levelFilter, dayNumber, online])

  const modeLabel = useMemo(() => {
    if (lang === 'sw') return mode === 'sw' ? 'SW (Kikorea)' : 'KO (Kiswahili)'
    return mode === 'sw' ? 'SW(한국어 단어)' : 'KO(스와힐리어 단어)'
  }, [lang, mode])

  const displayRows = rows

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold text-white">{title}</div>
            <div className="mt-1 text-xs font-semibold text-white/60">
              {modeLabel} · {totalCount.toLocaleString()} {lang === 'sw' ? 'maneno' : '개'}
            </div>
            {/* 온라인/오프라인 상태 표시 */}
            <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${
              online 
                ? 'bg-[rgb(var(--green))]/20 text-[rgb(var(--green))]' 
                : usingCache
                ? 'bg-[rgb(var(--purple))]/20 text-[rgb(var(--purple))]'
                : 'bg-[rgb(var(--orange))]/20 text-[rgb(var(--orange))]'
            }`}>
              {online 
                ? (lang === 'sw' ? '☁️ Mtandaoni' : '☁️ 온라인')
                : usingCache
                ? (lang === 'sw' ? '📱 Nje ya Mtandao' : '📱 오프라인')
                : (lang === 'sw' ? '⚠️ Hakuna Data' : '⚠️ 데이터 없음')
              }
            </div>
          </div>
          <Button variant="secondary" onClick={fetchRows} disabled={loading}>
            {lang === 'sw' ? 'Sasisha' : '새로고침'}
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-2xl border border-[rgb(var(--orange))]/25 bg-[rgb(var(--orange))]/10 p-3 text-sm font-semibold text-white/85">
            {error}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-3xl p-6 text-center app-card backdrop-blur">
          <div className="text-sm font-semibold text-white/70">{lang === 'sw' ? 'Inapakia...' : '불러오는 중...'}</div>
        </div>
      ) : null}

      <div className="grid gap-4">
        {displayRows.map((r) => {
          // 쉼표가 있으면 첫 번째 부분만 사용 (데이터 정제)
          let rawMeaning = mode === 'sw' ? r.meaning_sw : r.meaning_ko
          rawMeaning = rawMeaning?.includes(',') ? rawMeaning.split(',')[0].trim() : rawMeaning ?? null

          // 한국어 -하다 동사인데 뜻이 형용사형이면 표시만 동사형으로 교정 (SW: kuwa ~, EN: to be ~)
          const isKoreanVerbHada = mode === 'sw' && /하다$/.test(r.word ?? '')
          let displaySw =
            isKoreanVerbHada && rawMeaning && !/^kuwa\s+/i.test(rawMeaning)
              ? `kuwa ${rawMeaning.trim()}`
              : rawMeaning
          // 스와힐리어 뜻 오버라이드 적용
          if (mode === 'sw' && r.word && SW_DISPLAY_OVERRIDE_BY_WORD[r.word]) {
            displaySw = SW_DISPLAY_OVERRIDE_BY_WORD[r.word]
          } else if (mode === 'sw' && rawMeaning && SW_DISPLAY_OVERRIDE[rawMeaning]) {
            displaySw = SW_DISPLAY_OVERRIDE[rawMeaning]
          }
          const displayKo = (mode === 'ko' && r.word && KO_DISPLAY_OVERRIDE_BY_WORD[r.word]) ? KO_DISPLAY_OVERRIDE_BY_WORD[r.word] : (mode === 'ko' && rawMeaning && KO_DISPLAY_OVERRIDE[rawMeaning]) ? KO_DISPLAY_OVERRIDE[rawMeaning] : rawMeaning
          let displayEn = r.meaning_en ?? null
          if (isKoreanVerbHada && displayEn && !/^to\s+(be\s+)?/i.test(displayEn)) {
            if (r.word && KO_VERB_EN_INFINITIVE_OVERRIDE[r.word]) {
              displayEn = KO_VERB_EN_INFINITIVE_OVERRIDE[r.word]
            } else {
              const parts = displayEn.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
              const part = (parts.length > 1 ? parts[parts.length - 1] : parts[0])?.toLowerCase() ?? ''
              if (part) {
                if (TO_BE_ADJECTIVES.has(part)) {
                  displayEn = `to be ${part}`
                } else {
                  const fromExample = getInfinitiveFromEnExample(r.example_translation_en ?? null)
                  displayEn = fromExample ? `to ${fromExample}` : `to ${part}`
                }
              }
            }
          }
          displayEn = EN_DISPLAY_OVERRIDE[displayEn ?? ''] ?? displayEn
          if (r.word && EN_DISPLAY_OVERRIDE_BY_WORD[r.word]) displayEn = EN_DISPLAY_OVERRIDE_BY_WORD[r.word]
          if (r.example && EN_DISPLAY_OVERRIDE_BY_EXAMPLE[r.example]) displayEn = EN_DISPLAY_OVERRIDE_BY_EXAMPLE[r.example]

          const mainMeaning = mode === 'sw' ? displaySw : displayKo

          return (
            <div key={r.id} className="rounded-3xl p-5 app-card backdrop-blur">
              {/* 단어/뜻/영어 가로 나열 */}
              <div className={`grid gap-4 ${showEnglish ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {/* 단어 */}
                <div className="flex flex-col min-w-0">
                  {(() => {
                    const override = WORD_DISPLAY_OVERRIDE[r.word]
                    const displayWord = override?.word ?? r.word
                    const displayPron = override?.pron ?? r.word_pronunciation
                    return (
                      <>
                        <span className="text-xl font-extrabold text-white break-words">{displayWord}</span>
                        <Pron value={displayPron} />
                        <AudioBtn url={r.word_audio_url} />
                      </>
                    )
                  })()}
                  {/* 이미지: URL 없음/로드 실패 시 플레이스홀더 + (가능하면) GPT 생성 */}
                  <div className="mt-2 space-y-2">
                    <VocabImage
                      url={r.image_url || imgUrl[r.id]}
                      alt={r.word}
                      wikiSearchTerms={wikiSearchTitlesFromMeaningEn(
                        stripKoreanFromEnDisplay(displayEn ?? '') || displayEn,
                        r.word,
                      )}
                      className="min-h-[9rem] w-full max-h-48 rounded-2xl border border-white/10 object-cover"
                      onImageError={() => setImgLoadFailed((p) => ({ ...p, [r.id]: true }))}
                      onImageLoad={() => setImgLoadFailed((p) => ({ ...p, [r.id]: false }))}
                    />
                    {hasOpenAI() &&
                    (!(r.image_url || imgUrl[r.id])?.trim?.() || imgLoadFailed[r.id]) ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleGenerateImage(r)}
                          disabled={imgLoading[r.id]}
                          className="w-full"
                        >
                          {imgLoading[r.id]
                            ? (lang === 'sw' ? 'Inaunda...' : '생성 중...')
                            : (lang === 'sw' ? 'Picha (GPT-Image)' : '🖼️ 그림 생성')}
                        </Button>
                        {imgError[r.id] ? (
                          <div className="text-xs text-[rgb(var(--orange))]">{imgError[r.id]}</div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                {/* 뜻 (메인) - 모국어이므로 TTS/발음 불필요 */}
                <div className="flex flex-col min-w-0">
                  <span className="text-lg font-bold text-white/90 break-words">{mainMeaning ?? '—'}</span>
                </div>

                {/* 영어 */}
                {showEnglish ? (
                  (() => {
                    const rawV = (mode === 'sw' ? displayEn : r.meaning_en) ?? ''
                    const finalEn = stripKoreanFromEnDisplay(EN_DISPLAY_OVERRIDE[rawV] ?? rawV) || '—'
                    return (
                      <div className="flex flex-col min-w-0">
                        <span className="text-base font-semibold text-white/80 break-words">{finalEn}</span>
                        <AudioBtn url={r.meaning_en_audio_url} muted={MUTE_MEANING_EN_AUDIO_BY_WORD.has(r.word ?? '')} />
                      </div>
                    )
                  })()
                ) : null}
              </div>

              {/* 예문 */}
              {r.example ? (
                <div className="mt-4 rounded-2xl bg-white/5 p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-purple-300">{EXAMPLE_DISPLAY_OVERRIDE[r.example]?.text ?? r.example}</span>
                      <AudioBtn url={r.example_audio_url} />
                    </div>
                    <Pron value={EXAMPLE_DISPLAY_OVERRIDE[r.example]?.pron ?? r.example_pronunciation} />
                  </div>
                  {/* 예문 번역: SW모드는 스와힐리어, KO모드는 한국어 */}
                  {(() => {
                    const trOverride = r.word ? EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD[r.word] : undefined
                    const mainTranslation =
                      mode === 'sw'
                        ? (trOverride?.sw ?? r.example_translation_sw)
                        : (trOverride?.ko ?? EXAMPLE_TRANSLATION_KO_OVERRIDE[r.example_translation_ko ?? ''] ?? r.example_translation_ko)
                    const mainPron = mode === 'ko' ? trOverride?.koPron : undefined
                    const enTranslation = trOverride?.en ?? (EXAMPLE_TRANSLATION_EN_OVERRIDE[r.example_translation_en ?? ''] ?? r.example_translation_en)
                    const mainLabel = mode === 'sw' ? 'SW' : 'KO'
                    return (mainTranslation || (showEnglish && enTranslation)) ? (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        {mainTranslation ? (
                          <div className="text-sm font-semibold text-white/80">
                            <span className="text-white/50">{mainLabel}:</span> {mainTranslation}
                            {mainPron ? <> <Pron value={mainPron} /></> : null}
                          </div>
                        ) : null}
                        {showEnglish && enTranslation ? (
                          <div className="mt-1 text-sm font-semibold text-white/70">
                            <span className="text-white/50">EN:</span> {enTranslation}
                          </div>
                        ) : null}
                      </div>
                    ) : null
                  })()}
                </div>
              ) : null}

              {/* 카테고리/난이도 */}
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-white/50">
                <span>{r.category ?? '—'}</span>
                <span>·</span>
                <span>Lv.{r.difficulty ?? '?'}</span>
              </div>
            </div>
          )
        })}

        {!loading && rows.length === 0 ? (
          <div className="rounded-3xl p-8 text-center app-card backdrop-blur">
            <div className="text-sm font-semibold text-white/70">
              {lang === 'sw' ? 'Hakuna data kwenye cloud.' : '클라우드에 데이터가 없습니다.'}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}


