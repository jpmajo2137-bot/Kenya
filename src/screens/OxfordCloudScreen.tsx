import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { VocabImage } from '../components/VocabImage'
import { CorrectedAudioBtn } from '../components/CorrectedAudioBtn'
import { wikiSearchTitlesFromMeaningEn } from '../lib/wikiThumbnail'
import { hasOpenAI } from '../lib/env'
import { generateWordImage } from '../lib/openai'
import type { Lang } from '../lib/i18n'
import type { NativeLang, TargetLang } from '../lib/types'
import { supabase } from '../lib/supabase'
import { isKoEnOxford, queryOxfordKoEn } from '../lib/oxfordApi'
import {
  getOxfordFromCache,
  getOxfordCacheCount,
  isOnline,
  onOnlineStatusChange,
} from '../lib/offlineCache'
import {
  parseOxfordFilter,
  getOxfordWordsByTopic,
  getOrderedOxfordWords,
  dedupRowsByKoreanMeaning,
  dedupRowsByEnglishWord,
} from '../lib/oxfordFilterUtils'
import { romanizeKoreanText } from '../lib/koreanRomanization'
import {
  PREFER_CLIENT_KO_TTS_WORDS,
  applyEnOverride,
  applyKoOverride,
  WORD_DISPLAY_OVERRIDE,
  EXAMPLE_DISPLAY_OVERRIDE,
  EXAMPLE_TRANSLATION_EN_OVERRIDE,
  EXAMPLE_TRANSLATION_KO_OVERRIDE,
} from '../lib/displayOverrides'

export type OxfordRow = {
  id: string
  word: string
  korean_meaning: string
  level: string | null
  pos: string | null
  english_example: string | null
  korean_example: string | null
  word_audio_url: string | null
  meaning_audio_url: string | null
  english_example_audio_url: string | null
  korean_example_audio_url: string | null
  image_url: string | null
  order_index: number | null
  category: string | null
  difficulty: number | null
  // KO-EN 화면에서 영어 단어 아래 표시할 한글 발음 가이드 (예: one→"원").
  // 현재 숫자 단어 한정으로 채워져 있고, 다른 단어는 null.
  word_pron_ko: string | null
  created_at: string
}

/** 발음 표기: [대괄호] 스타일 (CloudAllWordsScreen 과 동일) */
function Pron({ value }: { value: string | null }) {
  if (!value) return null
  return (
    <span className="text-[13px] font-bold text-cyan-400 tracking-tight">
      [{value}]
    </span>
  )
}

const CLOUD_IMG_STORAGE_KEY = 'kenya_vocab_cloud_imgUrl'

export function OxfordCloudScreen({
  lang,
  nativeLang,
  targetLang,
  showEnglish: _showEnglish = true,
  levelFilter = '',
  categoryFilter = '',
  // prefix 형식 필터: 'classified:음식/음료', 'pos:noun', 'ordered:숫자1-50', 'category:여행'.
  // 지정되면 categoryFilter 보다 우선.
  filter = '',
  dayNumber,
  wordsPerDay = 40,
  title: titleProp,
}: {
  lang: Lang
  nativeLang: NativeLang
  targetLang: TargetLang
  showEnglish?: boolean
  levelFilter?: string
  categoryFilter?: string
  filter?: string
  dayNumber?: number
  wordsPerDay?: number
  title?: string
}) {
  void _showEnglish // Oxford 는 영어가 이미 학습 또는 모국어이므로 무시 (SW-KO 와의 prop 호환만 유지)
  const [rows, setRows] = useState<OxfordRow[]>([])
  // 헤더 카운트는 화면에 보이는 dedup 행 수를 사용하므로 totalCount 는 더 이상 표시하지 않는다.
  // setTotalCount 는 fetch 흐름 호환을 위해 유지.
  const [, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(isOnline())
  const [usingCache, setUsingCache] = useState(false)

  // 이미지 GPT 생성 상태 (SW-KO 와 동일 동작)
  const [imgLoading, setImgLoading] = useState<Record<string, boolean>>({})
  const [imgUrl, setImgUrl] = useState<Record<string, string>>({})
  const [imgError, setImgError] = useState<Record<string, string>>({})
  const [imgLoadFailed, setImgLoadFailed] = useState<Record<string, boolean>>({})

  // targetLang === 'ko' (en-ko): 단어 = korean_meaning, 뜻 = word(영어)
  // targetLang === 'en' (ko-en): 단어 = word(영어), 뜻 = korean_meaning
  const koreanIsTarget = targetLang === 'ko'

  useEffect(() => onOnlineStatusChange(setOnline), [])

  // prefix 형식 필터(`filter`) 가 있으면 그것을 우선 사용해 효과적인 categoryFilter / pos / words 를 결정.
  const parsedFilter = parseOxfordFilter(filter)
  const effectiveCategory = parsedFilter.category ?? categoryFilter ?? ''
  const effectivePos = parsedFilter.pos ?? ''
  const wordWhitelist: string[] | null = parsedFilter.classified
    ? getOxfordWordsByTopic(parsedFilter.classified)
    : parsedFilter.ordered
      ? getOrderedOxfordWords(parsedFilter.ordered)
      : null

  const fetchFromCloud = async () => {
    const wordList = wordWhitelist
      ? wordWhitelist.length > 0
        ? wordWhitelist
        : ['__none__']
      : null

    if (isKoEnOxford(targetLang)) {
      setLoading(true)
      setError(null)
      setUsingCache(false)
      try {
        const start = dayNumber ? (dayNumber - 1) * wordsPerDay : 0
        const { rows, total } = await queryOxfordKoEn({
          level: levelFilter || undefined,
          category: effectiveCategory || undefined,
          pos: effectivePos || undefined,
          words: wordList,
          offset: dayNumber ? start : 0,
          limit: dayNumber ? wordsPerDay : 500,
        })
        setTotalCount(total)
        setRows(rows)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
      return
    }

    if (!supabase) {
      setError(
        lang === 'sw'
          ? 'Supabase haijawekwa.'
          : lang === 'en'
            ? 'Supabase is not configured.'
            : 'Supabase 설정이 없습니다.',
      )
      return
    }
    setLoading(true)
    setError(null)
    setUsingCache(false)
    try {
      let countQuery = supabase
        .from('oxford_vocab')
        .select('*', { count: 'exact', head: true })
      if (levelFilter) countQuery = countQuery.eq('level', levelFilter)
      if (effectiveCategory) countQuery = countQuery.eq('category', effectiveCategory)
      if (effectivePos) countQuery = countQuery.eq('pos', effectivePos)
      if (wordList) countQuery = countQuery.in('word', wordList)
      const { count } = await countQuery
      setTotalCount(count ?? 0)

      let dataQuery = supabase
        .from('oxford_vocab')
        .select('*')
        .order('order_index', { ascending: true })
      if (levelFilter) dataQuery = dataQuery.eq('level', levelFilter)
      if (effectiveCategory) dataQuery = dataQuery.eq('category', effectiveCategory)
      if (effectivePos) dataQuery = dataQuery.eq('pos', effectivePos)
      if (wordList) dataQuery = dataQuery.in('word', wordList)

      if (dayNumber) {
        const start = (dayNumber - 1) * wordsPerDay
        const end = start + wordsPerDay - 1
        const { data, error: e } = await dataQuery.range(start, end)
        if (e) throw e
        setRows((data ?? []) as OxfordRow[])
      } else {
        const { data, error: e } = await dataQuery.limit(500)
        if (e) throw e
        setRows((data ?? []) as OxfordRow[])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const fetchFromLocalCache = async () => {
    setLoading(true)
    setError(null)
    setUsingCache(true)
    try {
      // 오프라인 캐시는 word-list 기반(in-memory) 필터를 직접 지원하지 않으므로,
      // 캐시 전체를 가져온 뒤 클라이언트에서 한 번 더 필터링한다.
      let cached = await getOxfordFromCache(
        levelFilter || undefined,
        dayNumber,
        wordsPerDay,
        effectiveCategory || undefined,
      )
      if (effectivePos) {
        cached = cached.filter((r) => (r.pos ?? '').toLowerCase() === effectivePos.toLowerCase())
      }
      if (wordWhitelist) {
        const set = new Set(wordWhitelist.map((w) => w.toLowerCase().trim()))
        cached = cached.filter((r) => set.has((r.word ?? '').toLowerCase().trim()))
      }
      const totalBase = await getOxfordCacheCount(
        levelFilter || undefined,
        effectiveCategory || undefined,
      )
      setRows(cached as OxfordRow[])
      setTotalCount(wordWhitelist || effectivePos ? cached.length : totalBase)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isKoEnOxford(targetLang) || (online && supabase)) void fetchFromCloud()
    else void fetchFromLocalCache()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, levelFilter, categoryFilter, filter, dayNumber, nativeLang, targetLang])

  // 저장해 둔 GPT 생성 이미지 URL 복원
  useEffect(() => {
    if (rows.length === 0) return
    try {
      const stored = JSON.parse(
        localStorage.getItem(CLOUD_IMG_STORAGE_KEY) || '{}',
      ) as Record<string, string>
      const toRestore: Record<string, string> = {}
      for (const r of rows) {
        if (!r.image_url && stored[r.id]) toRestore[r.id] = stored[r.id]
      }
      if (Object.keys(toRestore).length > 0) {
        setImgUrl((prev) => ({ ...prev, ...toRestore }))
      }
    } catch {
      // ignore
    }
  }, [rows])

  const handleGenerateImage = async (row: OxfordRow) => {
    setImgError((prev) => ({ ...prev, [row.id]: '' }))
    setImgLoading((prev) => ({ ...prev, [row.id]: true }))
    try {
      const promptMeaning = koreanIsTarget ? row.word : row.korean_meaning
      const url = await generateWordImage(row.word, promptMeaning)
      const nextUrl = url ?? ''
      setImgUrl((prev) => ({ ...prev, [row.id]: nextUrl }))
      setImgLoadFailed((prev) => ({ ...prev, [row.id]: false }))
      if (nextUrl) {
        try {
          const stored = JSON.parse(
            localStorage.getItem(CLOUD_IMG_STORAGE_KEY) || '{}',
          ) as Record<string, string>
          stored[row.id] = nextUrl
          localStorage.setItem(CLOUD_IMG_STORAGE_KEY, JSON.stringify(stored))
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setImgError((prev) => ({
        ...prev,
        [row.id]: e instanceof Error ? e.message : String(e),
      }))
    } finally {
      setImgLoading((prev) => ({ ...prev, [row.id]: false }))
    }
  }

  const title = (() => {
    if (titleProp) return titleProp
    if (categoryFilter) return categoryFilter
    if (levelFilter) return levelFilter
    if (lang === 'sw') return 'Maneno Yote'
    if (lang === 'en') return 'All Words'
    return '모든 단어'
  })()

  // SW-KO modeLabel 과 같은 위치의 라벨 (Oxford 버전 표시)
  const modeLabel = useMemo(() => {
    if (koreanIsTarget) {
      // EN-KO: 영어 사용자가 한국어 학습
      return lang === 'sw'
        ? 'KO (Kiingereza)'
        : lang === 'en'
          ? 'KO (English)'
          : 'KO(영어 단어)'
    }
    // KO-EN: 한국어 사용자가 영어 학습
    return lang === 'sw'
      ? 'EN (Kikorea)'
      : lang === 'en'
        ? 'EN (Korean)'
        : 'EN(한국어 단어)'
  }, [lang, koreanIsTarget])

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold text-white">{title}</div>
            <div className="mt-1 text-xs font-semibold text-white/60">
              {modeLabel} · {(koreanIsTarget ? dedupRowsByKoreanMeaning(rows).length : dedupRowsByEnglishWord(rows).length).toLocaleString()}{' '}
              {lang === 'sw' ? 'maneno' : lang === 'en' ? 'words' : '개'}
            </div>
            <div
              className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${
                online
                  ? 'bg-[rgb(var(--green))]/20 text-[rgb(var(--green))]'
                  : usingCache
                    ? 'bg-[rgb(var(--purple))]/20 text-[rgb(var(--purple))]'
                    : 'bg-[rgb(var(--orange))]/20 text-[rgb(var(--orange))]'
              }`}
            >
              {online
                ? lang === 'sw'
                  ? '☁️ Mtandaoni'
                  : lang === 'en'
                    ? '☁️ Online'
                    : '☁️ 온라인'
                : usingCache
                  ? lang === 'sw'
                    ? '📱 Nje ya Mtandao'
                    : lang === 'en'
                      ? '📱 Offline'
                      : '📱 오프라인'
                  : lang === 'sw'
                    ? '⚠️ Hakuna Data'
                    : lang === 'en'
                      ? '⚠️ No Data'
                      : '⚠️ 데이터 없음'}
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => void (online ? fetchFromCloud() : fetchFromLocalCache())}
            disabled={loading}
          >
            {lang === 'sw' ? 'Sasisha' : lang === 'en' ? 'Refresh' : '새로고침'}
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
          <div className="text-sm font-semibold text-white/70">
            {lang === 'sw' ? 'Inapakia...' : lang === 'en' ? 'Loading...' : '불러오는 중...'}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4">
        {(koreanIsTarget ? dedupRowsByKoreanMeaning(rows) : dedupRowsByEnglishWord(rows)).map((r) => {
          const koOverride = WORD_DISPLAY_OVERRIDE[r.korean_meaning]
          const displayKorean = koOverride?.word ?? r.korean_meaning
          const displayKoreanPron = koOverride?.pron ?? null
          const targetText = koreanIsTarget ? displayKorean : r.word
          const meaningText = koreanIsTarget
            ? applyEnOverride(r.word, r.korean_meaning)
            : applyKoOverride(r.word, displayKorean)
          const targetAudio = koreanIsTarget ? r.meaning_audio_url : r.word_audio_url
          const targetTtsLang: 'sw' | 'ko' | 'en' = koreanIsTarget ? 'ko' : 'en'

          const koExampleOverride = r.korean_example
            ? EXAMPLE_DISPLAY_OVERRIDE[r.korean_example]
            : undefined
          const displayKoExample = koExampleOverride?.text ?? r.korean_example
          const displayKoExamplePron = koExampleOverride?.pron ?? null
          const displayEnExample = r.english_example
            ? (EXAMPLE_TRANSLATION_EN_OVERRIDE[r.english_example] ?? r.english_example)
            : r.english_example
          const displayKoExampleTrans = r.korean_example
            ? (EXAMPLE_TRANSLATION_KO_OVERRIDE[r.korean_example] ?? displayKoExample)
            : r.korean_example
          const exampleText = koreanIsTarget ? displayKoExample : displayEnExample
          const exampleTransText = koreanIsTarget ? displayEnExample : displayKoExampleTrans
          const exampleAudio = koreanIsTarget
            ? r.korean_example_audio_url
            : r.english_example_audio_url
          const exampleTtsLang: 'sw' | 'ko' | 'en' = koreanIsTarget ? 'ko' : 'en'

          // SW-KO 와 동일하게 영어 단어 기반으로 wiki 검색
          const wikiTerms = wikiSearchTitlesFromMeaningEn(r.word, r.word)
          // 메인 번역 라벨: SW-KO 는 'SW' / 'KO' 사용. Oxford 는 'EN' / 'KO' (모국어 기준).
          const mainLabel = koreanIsTarget ? 'EN' : 'KO'

          return (
            <div key={r.id} className="rounded-3xl p-5 app-card backdrop-blur">
              {/* 단어/뜻 — SW-KO showEnglish=false 와 동일한 2-col 레이아웃 */}
              <div className="grid gap-4 grid-cols-2">
                {/* 단어 */}
                <div className="flex flex-col min-w-0">
                  <span className="text-xl font-extrabold text-white break-words">
                    {targetText}
                  </span>
                  <Pron value={koreanIsTarget ? (displayKoreanPron ?? romanizeKoreanText(targetText)) : (r.word_pron_ko ?? null)} />
                  <CorrectedAudioBtn
                    url={targetAudio}
                    displayText={targetText}
                    dbText={koreanIsTarget ? r.korean_meaning : r.word}
                    lang={targetTtsLang}
                    preferClientTts={koreanIsTarget && (PREFER_CLIENT_KO_TTS_WORDS.has(targetText) || !!koOverride)}
                    variant="cloudList"
                  />
                  {/* 이미지 + GPT 생성 버튼 (SW-KO 와 동일) */}
                  <div className="mt-2 space-y-2">
                    <VocabImage
                      url={r.image_url || imgUrl[r.id]}
                      alt={r.word}
                      wikiSearchTerms={wikiTerms}
                      className="min-h-[9rem] w-full max-h-48 rounded-2xl border border-white/10 object-cover"
                      onImageError={() =>
                        setImgLoadFailed((p) => ({ ...p, [r.id]: true }))
                      }
                      onImageLoad={() =>
                        setImgLoadFailed((p) => ({ ...p, [r.id]: false }))
                      }
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
                            ? lang === 'sw'
                              ? 'Inaunda...'
                              : lang === 'en'
                                ? 'Creating...'
                                : '생성 중...'
                            : lang === 'sw'
                              ? 'Picha (GPT-Image)'
                              : lang === 'en'
                                ? '🖼️ Generate image'
                                : '🖼️ 그림 생성'}
                        </Button>
                        {imgError[r.id] ? (
                          <div className="text-xs text-[rgb(var(--orange))]">
                            {imgError[r.id]}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                {/* 뜻 (메인) — 모국어이므로 TTS/발음 불필요 */}
                <div className="flex flex-col min-w-0">
                  <span className="text-lg font-bold text-white/90 break-words">
                    {meaningText ?? '—'}
                  </span>
                </div>
              </div>

              {/* 예문 — SW-KO 와 동일 스타일 */}
              {exampleText ? (
                <div className="mt-4 rounded-2xl bg-white/5 p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-purple-300">
                        {exampleText}
                      </span>
                      {koreanIsTarget && exampleText && (displayKoExamplePron || romanizeKoreanText(exampleText)) ? (
                        <span className="text-[12px] font-bold text-cyan-400 tracking-tight">
                          [{displayKoExamplePron ?? romanizeKoreanText(exampleText)}]
                        </span>
                      ) : null}
                      <CorrectedAudioBtn
                        url={exampleAudio}
                        displayText={exampleText}
                        dbText={koreanIsTarget ? r.korean_example : r.english_example}
                        lang={exampleTtsLang}
                        variant="cloudList"
                      />
                    </div>
                  </div>
                  {exampleTransText ? (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="text-sm font-semibold text-white/80">
                        <span className="text-white/50">{mainLabel}:</span>{' '}
                        {exampleTransText}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* 카테고리/난이도 — SW-KO 와 동일 */}
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
              {lang === 'sw'
                ? 'Hakuna data kwenye cloud.'
                : lang === 'en'
                  ? 'No data in the cloud yet.'
                  : '클라우드에 데이터가 없습니다.'}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
