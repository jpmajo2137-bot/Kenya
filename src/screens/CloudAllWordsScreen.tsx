import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/Button'
import type { Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { generateWordImage } from '../lib/openai'
import { 
  getVocabFromCache, 
  getCacheCount, 
  isOnline, 
  onOnlineStatusChange
} from '../lib/offlineCache'

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

/** 스피커 아이콘 버튼 (스피커 + 음파) */
function AudioBtn({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <button
      type="button"
      onClick={() => {
        const a = new Audio(url)
        void a.play()
      }}
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
        {/* 스피커 본체 */}
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#5ad4e6" stroke="none" />
        {/* 음파 1 */}
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        {/* 음파 2 */}
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    </button>
  )
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
  const [online, setOnline] = useState(isOnline())
  const [usingCache, setUsingCache] = useState(false)

  // 온라인 상태 감지
  useEffect(() => {
    const unsubscribe = onOnlineStatusChange(setOnline)
    return unsubscribe
  }, [])

  // 카테고리 이름 스와힐리어 번역
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

  const translatedLevel = lang === 'sw' && levelFilter 
    ? (categoryTranslations[levelFilter] || levelFilter)
    : levelFilter

  const title = levelFilter 
    ? (lang === 'sw' ? translatedLevel : levelFilter)
    : (lang === 'sw' ? 'Maneno Yote' : '모든 단어')

  const handleGenerateImage = async (row: CloudRow) => {
    setImgError((prev) => ({ ...prev, [row.id]: '' }))
    setImgLoading((prev) => ({ ...prev, [row.id]: true }))
    try {
      const mainMeaning = mode === 'sw' ? row.meaning_sw || row.meaning_en || '' : row.meaning_ko || row.meaning_en || ''
      const url = await generateWordImage(row.word, mainMeaning)
      setImgUrl((prev) => ({ ...prev, [row.id]: url ?? '' }))
    } catch (e) {
      setImgError((prev) => ({ ...prev, [row.id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setImgLoading((prev) => ({ ...prev, [row.id]: false }))
    }
  }

  // 오프라인 캐시에서 데이터 가져오기
  const fetchFromCache = async () => {
    setLoading(true)
    setError(null)
    setUsingCache(true)
    try {
      const count = await getCacheCount(mode, levelFilter || undefined)
      setTotalCount(count)

      const data = await getVocabFromCache(mode, levelFilter || undefined, dayNumber, wordsPerDay)
      const cleaned = data.filter((r) => !r.word?.startsWith('__deleted__'))
      setRows(cleaned as CloudRow[])
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
      // 전체 개수 가져오기
      let countQuery = supabase
        .from('generated_vocab')
        .select('*', { count: 'exact', head: true })
        .eq('mode', mode)
      if (levelFilter) {
        countQuery = countQuery.eq('category', levelFilter)
      }
      const { count } = await countQuery
      setTotalCount(count ?? 0)

      // 데이터 가져오기
      let dataQuery = supabase
        .from('generated_vocab')
        .select('*')
        .eq('mode', mode)
      if (levelFilter) {
        dataQuery = dataQuery.eq('category', levelFilter)
      }
      
      // Day 번호가 있으면 해당 범위만 가져오기
      if (dayNumber) {
        const startIdx = (dayNumber - 1) * wordsPerDay
        const endIdx = startIdx + wordsPerDay - 1
        const { data, error: e } = await dataQuery
          .order('created_at', { ascending: true })
          .range(startIdx, endIdx)
        if (e) throw e
        const cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
        setRows(cleaned)
      } else {
        const { data, error: e } = await dataQuery
          .order('created_at', { ascending: false })
          .limit(500)
        if (e) throw e
        const cleaned = ((data ?? []) as CloudRow[]).filter((r) => !r.word?.startsWith('__deleted__'))
        setRows(cleaned)
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
        {rows.map((r) => {
          const mainMeaning = mode === 'sw' ? r.meaning_sw : r.meaning_ko

          return (
            <div key={r.id} className="rounded-3xl p-5 app-card backdrop-blur">
              {/* 단어/뜻/영어 가로 나열 */}
              <div className={`grid gap-4 ${showEnglish ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {/* 단어 */}
                <div className="flex flex-col">
                  <span className="text-xl font-extrabold text-white">{r.word}</span>
                  {/* 학습 대상 언어(단어)에는 발음 표기 */}
                  <Pron value={r.word_pronunciation} />
                  <AudioBtn url={r.word_audio_url} />
                  {/* 이미지 표시 */}
                  {(r.image_url || imgUrl[r.id]) ? (
                    <div className="mt-2">
                      <img
                        src={r.image_url || imgUrl[r.id]}
                        alt={r.word}
                        className="w-full max-h-48 rounded-2xl border border-white/10 object-cover"
                      />
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
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
                    </div>
                  )}
                </div>

                {/* 뜻 (메인) - 모국어이므로 TTS/발음 불필요 */}
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-white/90">{mainMeaning ?? '—'}</span>
                </div>

                {/* 영어 */}
                {showEnglish ? (
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-white/80">{r.meaning_en ?? '—'}</span>
                    <AudioBtn url={r.meaning_en_audio_url} />
                  </div>
                ) : null}
              </div>

              {/* 예문 */}
              {r.example ? (
                <div className="mt-4 rounded-2xl bg-white/5 p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-purple-300">{r.example}</span>
                      <AudioBtn url={r.example_audio_url} />
                    </div>
                    <Pron value={r.example_pronunciation} />
                  </div>
                  {/* 예문 번역: SW모드는 스와힐리어, KO모드는 한국어 */}
                  {(() => {
                    const mainTranslation = mode === 'sw' ? r.example_translation_sw : r.example_translation_ko
                    const mainLabel = mode === 'sw' ? 'SW' : 'KO'
                    return (mainTranslation || (showEnglish && r.example_translation_en)) ? (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        {mainTranslation ? (
                          <div className="text-sm font-semibold text-white/80">
                            <span className="text-white/50">{mainLabel}:</span> {mainTranslation}
                          </div>
                        ) : null}
                        {showEnglish && r.example_translation_en ? (
                          <div className="mt-1 text-sm font-semibold text-white/70">
                            <span className="text-white/50">EN:</span> {r.example_translation_en}
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


