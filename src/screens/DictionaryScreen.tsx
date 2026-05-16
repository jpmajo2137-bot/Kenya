import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '../components/Button'
import { cn } from '../components/cn'
import { t, type Lang } from '../lib/i18n'
import {
  translate,
  getTranslateUsage,
  canTranslate,
  grantTranslateBonus,
  hasGeminiApi,
  warmupTranslate,
  type TranslationResult,
} from '../lib/translate'
import {
  showRewardedAd,
  canAccessDictionary,
  grantDictionaryAccess,
  getDictionaryAccessRemainingTime,
} from '../lib/admob'
import { hasCachedTts, speakWithFreeFallback } from '../lib/ttsCache'
import { englishGlossLineForTts } from '../lib/meaningEnTts'
import type { Action } from '../app/state'
import type { Deck, VocabItem } from '../lib/types'

function isCapacitorNative(): boolean {
  return (
    typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor.isNativePlatform?.() === true
  )
}

const HANGUL_RE = /[\uAC00-\uD7AF\u3130-\u318F]/
const ENGLISH_COMMON = /^[a-zA-Z\s'-]+$/
const SW_MARKERS = /(?:^[mn](?=[a-z]))|(?:wa|na|ya|za|ki|vi|ku|ni|li|zi|sh|ch|ng|mb|nd|nj|ny)/i

function detectLang(text: string): 'sw' | 'ko' | 'en' {
  const trimmed = text.trim()
  if (HANGUL_RE.test(trimmed)) return 'ko'
  if (!ENGLISH_COMMON.test(trimmed)) return 'sw'
  if (SW_MARKERS.test(trimmed)) return 'sw'
  return 'en'
}

function UsageBadge({ lang }: { lang: Lang }) {
  const { used, limit } = getTranslateUsage()
  const remaining = Math.max(0, limit - used)
  const isLow = remaining <= 2

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
        isLow
          ? 'bg-[rgba(var(--orange),0.2)] text-[rgb(var(--orange))]'
          : 'bg-[rgba(var(--green),0.15)] text-[rgb(var(--green))]',
      )}
    >
      <span>🔍</span>
      <span>
        {used}/{limit} {lang === 'ko' ? '사용' : 'zimetumika'}
      </span>
    </div>
  )
}

function DetectedLangBadge({ text, lang }: { text: string; lang: Lang }) {
  if (!text.trim()) return null
  const detected = detectLang(text)
  const labels: Record<string, Record<Lang, string>> = {
    sw: { ko: '🇰🇪 스와힐리어', sw: '🇰🇪 Kiswahili', en: '🇰🇪 Swahili' },
    ko: { ko: '🇰🇷 한국어', sw: '🇰🇷 Kikorea', en: '🇰🇷 Korean' },
    en: { ko: '🇬🇧 영어', sw: '🇬🇧 Kiingereza', en: '🇬🇧 English' },
  }
  return (
    <span className="text-[10px] font-bold text-white/30">
      {labels[detected][lang]}
    </span>
  )
}

function TTSButton({ text, ttsLang }: { text: string; ttsLang: 'sw' | 'ko' | 'en' }) {
  const [playing, setPlaying] = useState(false)

  if (!hasCachedTts() || !text) return null

  const handlePlay = async () => {
    if (playing) return
    setPlaying(true)
    try {
      const ttsText = ttsLang === 'en' ? englishGlossLineForTts(text) : text
      await speakWithFreeFallback(ttsText, ttsLang)
      window.setTimeout(() => setPlaying(false), Math.max(1500, ttsText.length * 90))
    } catch {
      setPlaying(false)
    }
  }

  return (
    <button
      onClick={handlePlay}
      disabled={playing}
      className={cn(
        'inline-flex items-center justify-center rounded-full w-7 h-7 text-xs transition active:scale-90',
        playing
          ? 'bg-[rgba(var(--purple),0.4)] text-white/60'
          : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/80',
      )}
      title="Play"
    >
      {playing ? '⏳' : '🔊'}
    </button>
  )
}

const DICTIONARY_DECK_NAME = '사전'

function resultToVocabPayload(
  result: TranslationResult,
  deckId: string,
): Omit<VocabItem, 'id' | 'createdAt' | 'updatedAt' | 'srs'> {
  const getMeaning = (lang: string) =>
    result.meanings.find((m) => m.lang === lang)?.text ?? ''

  const sw = result.from === 'sw' ? result.word : getMeaning('sw')
  const ko = result.from === 'ko' ? result.word : getMeaning('ko')
  const en = result.from === 'en' ? result.word : getMeaning('en')

  const ex = result.examples[0]

  return {
    deckId,
    sw,
    ko,
    en: en || undefined,
    pos: result.pos || undefined,
    tags: result.synonyms ?? [],
    example: ex?.sentence,
    exampleKo: result.from !== 'ko' ? ex?.translation : ex?.sentence,
    exampleEn: result.from === 'en' ? ex?.sentence : undefined,
    note: result.note || undefined,
  }
}

function ResultCard({
  result,
  lang,
  onSave,
  isSaved,
}: {
  result: TranslationResult
  lang: Lang
  onSave?: () => void
  isSaved?: boolean
}) {
  const posLabels: Record<string, Record<Lang, string>> = {
    noun: { ko: '명사', sw: 'Nomino', en: 'Noun' },
    verb: { ko: '동사', sw: 'Kitenzi', en: 'Verb' },
    adjective: { ko: '형용사', sw: 'Kivumishi', en: 'Adjective' },
    adverb: { ko: '부사', sw: 'Kielezi', en: 'Adverb' },
    phrase: { ko: '구문', sw: 'Kifungu', en: 'Phrase' },
    other: { ko: '기타', sw: 'Nyingine', en: 'Other' },
  }

  const langBadgeColors: Record<string, string> = {
    sw: 'bg-emerald-500/20 text-emerald-400',
    ko: 'bg-sky-500/20 text-sky-400',
    en: 'bg-amber-500/20 text-amber-400',
  }
  const langCodes: Record<string, Record<Lang, string>> = {
    sw: { ko: 'SW', sw: 'KSW', en: 'SW' },
    ko: { ko: 'KO', sw: 'KKO', en: 'KO' },
    en: { ko: 'EN', sw: 'EN', en: 'EN' },
  }

  function LangBadge({ code }: { code: string }) {
    return (
      <span className={cn('inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide', langBadgeColors[code] ?? 'bg-white/10 text-white/60')}>
        {langCodes[code]?.[lang] ?? code.toUpperCase()}
      </span>
    )
  }

  return (
    <div className="app-card rounded-2xl p-4 space-y-4">
      {/* 단어 + 품사 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <LangBadge code={result.from} />
          <h3 className="text-xl font-extrabold text-white">{result.word}</h3>
          <TTSButton text={result.word} ttsLang={result.from} />
        </div>
        {result.pos && (
          <span className="shrink-0 rounded-lg bg-[rgba(var(--purple),0.3)] px-2 py-0.5 text-xs font-bold text-[rgb(var(--purple))]">
            {posLabels[result.pos]?.[lang] ?? result.pos}
          </span>
        )}
      </div>

      {/* 번역 */}
      <div className="space-y-2">
        {result.meanings
          .filter((m) => m.lang !== result.from)
          .sort((a, b) => {
            const order = lang === 'sw' ? ['sw', 'ko', 'en'] : ['ko', 'sw', 'en']
            return order.indexOf(a.lang) - order.indexOf(b.lang)
          })
          .map((m) => (
              <div key={m.lang} className="flex items-start gap-2">
                <span className="mt-1 shrink-0"><LangBadge code={m.lang} /></span>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-white/90 leading-relaxed font-medium">{m.text}</p>
                    <TTSButton text={m.text} ttsLang={m.lang as 'sw' | 'ko' | 'en'} />
                  </div>
                </div>
              </div>
          ))}
      </div>

      {/* 예문 */}
      {result.examples.length > 0 && (
        <div className="border-t border-white/10 pt-3 space-y-2">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wider">
            {lang === 'ko' ? '예문' : 'Mfano'}
          </p>
          {result.examples.map((ex, i) => {
            const hasTri = ex.sw || ex.ko || ex.en
            const exOrder: { key: 'sw' | 'ko' | 'en'; ttsLang: 'sw' | 'ko' | 'en' }[] =
              lang === 'sw'
                ? [{ key: 'sw', ttsLang: 'sw' }, { key: 'ko', ttsLang: 'ko' }, { key: 'en', ttsLang: 'en' }]
                : [{ key: 'ko', ttsLang: 'ko' }, { key: 'sw', ttsLang: 'sw' }, { key: 'en', ttsLang: 'en' }]
            return (
              <div key={i} className="space-y-1.5">
                {hasTri ? (
                  <>
                    {exOrder.map(({ key, ttsLang }, j) => {
                      const text = ex[key]
                      if (!text) return null
                      const isFirst = j === 0 || exOrder.slice(0, j).every(o => !ex[o.key])
                      return (
                        <div key={key} className="flex items-start gap-1.5">
                          <span className="mt-0.5 shrink-0"><LangBadge code={key} /></span>
                          <p className={cn('text-sm flex-1', isFirst ? 'text-white/85 italic' : j === 1 ? 'text-white/70' : 'text-white/60')}>
                            {isFirst ? `"${text}"` : text}
                          </p>
                          <TTSButton text={text} ttsLang={ttsLang} />
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-white/85 italic">"{ex.sentence}"</p>
                      <TTSButton text={ex.sentence} ttsLang={result.from} />
                    </div>
                    <p className="text-xs text-white/50">{ex.translation}</p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 동의어 */}
      {result.synonyms.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5">
            {lang === 'ko' ? '동의어' : 'Visawe'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.synonyms.map((s) => (
              <span
                key={s}
                className="rounded-lg bg-white/8 px-2 py-0.5 text-xs font-medium text-white/70"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 참고 */}
      {result.note && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-xs text-white/40 leading-relaxed">💡 {result.note}</p>
        </div>
      )}

      {/* 단어장 저장 */}
      {onSave && (
        <div className="border-t border-white/10 pt-3">
          <button
            onClick={onSave}
            disabled={isSaved}
            className={cn(
              'w-full rounded-xl py-2.5 text-sm font-bold transition active:scale-[0.98]',
              isSaved
                ? 'bg-[rgba(var(--green),0.15)] text-[rgb(var(--green))] cursor-default'
                : 'bg-[rgba(var(--purple),0.25)] text-[rgb(var(--purple))] hover:bg-[rgba(var(--purple),0.35)]',
            )}
          >
            {isSaved
              ? (lang === 'ko' ? '✅ 단어장에 저장됨' : '✅ Imehifadhiwa')
              : (lang === 'ko' ? '📥 사전 단어장에 저장' : '📥 Hifadhi kwenye Kamusi')}
          </button>
        </div>
      )}
    </div>
  )
}

export function DictionaryScreen({
  lang,
  decks,
  dispatch,
}: {
  lang: Lang
  decks: Deck[]
  dispatch: (a: Action) => void
  /** 라우팅용 (App.tsx에서 분기) - 본 컴포넌트는 사용하지 않음 */
  nativeLang?: 'sw' | 'ko' | 'en'
  targetLang?: 'sw' | 'ko' | 'en'
}) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [history, setHistory] = useState<TranslationResult[]>([])
  const [showAdPrompt, setShowAdPrompt] = useState(false)
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set())
  const [, setRefresh] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // 사전 접근 게이트: 보상형 광고 시청 후 30분간 접근 가능
  const [hasAccess, setHasAccess] = useState(() => canAccessDictionary())
  const [accessAdLoading, setAccessAdLoading] = useState(false)
  const [accessAdError, setAccessAdError] = useState<string | null>(null)
  const [accessRemaining, setAccessRemaining] = useState(getDictionaryAccessRemainingTime())

  const getDictionaryDeckId = useCallback((): string => {
    const existing = decks.find((d) => d.name === DICTIONARY_DECK_NAME)
    if (existing) return existing.id
    dispatch({ type: 'deckAdd', name: DICTIONARY_DECK_NAME })
    const updated = decks.find((d) => d.name === DICTIONARY_DECK_NAME)
    return updated?.id ?? ''
  }, [decks, dispatch])

  const handleSave = useCallback(() => {
    if (!result) return
    const deckId = getDictionaryDeckId()
    if (!deckId) return

    const key = `${result.from}:${result.word.toLowerCase()}`
    if (savedWords.has(key)) return

    const payload = resultToVocabPayload(result, deckId)
    dispatch({ type: 'add', item: payload })
    setSavedWords((prev) => new Set(prev).add(key))
  }, [result, getDictionaryDeckId, dispatch, savedWords])

  useEffect(() => {
    if (!hasAccess) return
    inputRef.current?.focus()
    // 사용자가 검색어를 타이핑하는 동안 백그라운드로 Edge Function 컨테이너를 깨워둔다.
    // (Gemini API 비호출, 사용량/한도 영향 없음)
    warmupTranslate()
  }, [hasAccess])

  // 입력이 시작되면 한 번 더 워밍업 시도 (TTL 만료 대비, 내부적으로 dedup 됨).
  useEffect(() => {
    if (!hasAccess) return
    if (query.trim().length >= 1) warmupTranslate()
  }, [query, hasAccess])

  // 접근 권한 남은 시간을 1분마다 갱신, 만료 시 게이트로 복귀
  useEffect(() => {
    if (!hasAccess) return
    const update = () => {
      const remaining = getDictionaryAccessRemainingTime()
      setAccessRemaining(remaining)
      if (remaining <= 0 && !canAccessDictionary()) {
        setHasAccess(false)
      }
    }
    update()
    const interval = window.setInterval(update, 60_000)
    return () => window.clearInterval(interval)
  }, [hasAccess])

  const handleWatchAccessAd = useCallback(async () => {
    setAccessAdLoading(true)
    setAccessAdError(null)
    try {
      const success = await showRewardedAd()
      if (success) {
        grantDictionaryAccess()
        setHasAccess(true)
        setAccessRemaining(getDictionaryAccessRemainingTime())
        // 진입 직후 입력창 포커스를 위해 한 프레임 뒤 호출
        window.setTimeout(() => inputRef.current?.focus(), 100)
      } else {
        setAccessAdError(
          lang === 'ko'
            ? '광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
            : 'Tangazo halikupakuliwa. Tafadhali jaribu tena baadaye.',
        )
      }
    } catch (err) {
      console.error('[Dictionary] 접근 광고 표시 실패:', err)
      setAccessAdError(
        lang === 'ko'
          ? '광고 표시 중 오류가 발생했어요.'
          : 'Hitilafu wakati wa kuonyesha tangazo.',
      )
    } finally {
      setAccessAdLoading(false)
    }
  }, [lang])

  const doSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    if (!hasGeminiApi()) {
      setError(lang === 'ko' ? 'Gemini API 키가 설정되지 않았습니다.' : 'Gemini API key haijawekwa.')
      return
    }

    if (!canTranslate()) {
      setShowAdPrompt(true)
      return
    }

    const fromLang = detectLang(trimmed)

    setLoading(true)
    setError(null)
    setShowAdPrompt(false)

    try {
      const res = await translate(trimmed, fromLang)
      setResult(res)
      setHistory((prev) => {
        const filtered = prev.filter(
          (h) => !(h.word.toLowerCase() === res.word.toLowerCase() && h.from === res.from),
        )
        return [res, ...filtered].slice(0, 20)
      })
      setRefresh((n) => n + 1)
    } catch (err: any) {
      if (err.message === 'LIMIT_REACHED') {
        setShowAdPrompt(true)
      } else {
        const msg = String(err?.message ?? '')
        const isOverloaded =
          err?.status === 503 ||
          err?.status === 429 ||
          /503|UNAVAILABLE|overloaded|high demand|429/i.test(msg)
        if (isOverloaded) {
          setError(
            lang === 'ko'
              ? '번역 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.'
              : 'Seva ya tafsiri ina msongamano kwa muda. Tafadhali jaribu tena baadaye.',
          )
        } else {
          setError(
            lang === 'ko'
              ? `번역 실패: ${msg}`
              : `Tafsiri imeshindwa: ${msg}`,
          )
        }
      }
    } finally {
      setLoading(false)
    }
  }, [query, lang])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch()
  }

  const handleWatchAd = async () => {
    const success = await showRewardedAd()
    if (success) {
      grantTranslateBonus()
      setShowAdPrompt(false)
      setRefresh((n) => n + 1)
      if (query.trim()) {
        doSearch()
      }
    }
  }

  const handleHistoryClick = (item: TranslationResult) => {
    setQuery(item.word)
    setResult(item)
  }

  // ─── 사전 접근 게이트 ──────────────────────────────
  if (!hasAccess) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-white">{t('dictionaryTitle', lang)}</h2>
            <p className="text-xs text-white/50">
              {lang === 'ko' ? '스와힐리어, 한국어, 영어 사전' : 'Kamusi ya Kiswahili, Kikorea, Kiingereza'}
            </p>
          </div>
        </div>

        <div className="app-card rounded-3xl p-6 text-center space-y-4">
          <div className="text-5xl animate-bounce">🎬</div>
          <h3 className="text-xl font-extrabold text-white">
            {lang === 'ko' ? '사전을 사용하려면 광고를 시청하세요' : 'Tazama tangazo ili kutumia kamusi'}
          </h3>
          <p className="text-sm text-white/70 leading-relaxed">
            {lang === 'ko'
              ? '짧은 보상형 광고를 시청하면 30분간 사전 기능을 자유롭게 사용할 수 있어요.'
              : 'Tazama tangazo fupi ili kutumia kamusi bila vikwazo kwa dakika 30.'}
          </p>

          {accessAdError && (
            <div className="rounded-xl bg-[rgba(var(--orange),0.15)] p-3 text-xs text-[rgb(var(--orange))]">
              {accessAdError}
            </div>
          )}

          <button
            onClick={handleWatchAccessAd}
            disabled={accessAdLoading}
            className={cn(
              'w-full h-14 rounded-2xl font-black text-lg tracking-wide text-white transition-all',
              'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500',
              'shadow-[0_8px_32px_rgba(34,197,94,0.5)] ring-2 ring-green-400/50',
              'hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(34,197,94,0.6)]',
              'active:scale-[0.98]',
              accessAdLoading && 'opacity-70 cursor-wait',
            )}
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
          >
            {accessAdLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                {lang === 'ko' ? '로딩 중...' : 'Inapakia...'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">▶</span>
                {lang === 'ko' ? '광고 보고 시작' : 'Tazama na uanze'}
              </span>
            )}
          </button>

          <p className="text-[11px] text-white/40 leading-relaxed">
            {lang === 'ko'
              ? '광고 시청 후 30분간 사전을 자유롭게 이용할 수 있어요. 시간이 지나면 다시 광고를 시청해야 해요.'
              : 'Baada ya tangazo, unaweza kutumia kamusi kwa dakika 30. Baada ya muda huo utahitaji kutazama tangazo tena.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-white">{t('dictionaryTitle', lang)}</h2>
          <p className="text-xs text-white/50">
            {lang === 'ko' ? '스와힐리어, 한국어, 영어를 입력하세요' : 'Andika Kiswahili, Kikorea au Kiingereza'}
          </p>
        </div>
        <UsageBadge lang={lang} />
      </div>

      {/* 사전 접근 권한 남은 시간 (네이티브 환경) */}
      {accessRemaining > 0 && (
        <div className="rounded-xl border border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/10 px-3 py-2 text-xs text-white/80 text-center">
          <span className="text-[rgb(var(--green))]">✓</span>{' '}
          {lang === 'ko'
            ? `광고 없이 사전 사용 가능: ${Math.ceil(accessRemaining / 60000)}분 남음`
            : `Muda wa kamusi bila tangazo: ${Math.ceil(accessRemaining / 60000)} dakika`}
        </div>
      )}

      {/* 검색 입력 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={lang === 'ko' ? 'habari, 안녕, hello...' : 'habari, 안녕, hello...'}
            className="h-11 w-full rounded-xl bg-white/10 pl-3 pr-10 text-sm text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-[rgb(var(--purple))]/60 transition"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query && (
              <>
                <DetectedLangBadge text={query} lang={lang} />
                <button
                  className="rounded-full p-1 text-white/40 hover:text-white/70 transition"
                  onClick={() => {
                    setQuery('')
                    setResult(null)
                    setError(null)
                    inputRef.current?.focus()
                  }}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
        <Button onClick={doSearch} disabled={loading || !query.trim()} className="shrink-0">
          {loading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : (
            <span>🔍</span>
          )}
        </Button>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-xl bg-[rgba(var(--orange),0.15)] p-3 text-xs text-[rgb(var(--orange))]">
          {error}
        </div>
      )}

      {/* 광고 프롬프트 */}
      {showAdPrompt && (
        <div className="app-card rounded-2xl p-4 text-center space-y-3">
          <p className="text-3xl">🎬</p>
          <p className="text-sm font-bold text-white">
            {lang === 'ko'
              ? '오늘의 무료 번역을 모두 사용했어요'
              : 'Umetumia tafsiri zote za bure za leo'}
          </p>
          <p className="text-xs text-white/50">
            {lang === 'ko'
              ? '광고를 시청하면 사용량이 0/5로 초기화됩니다'
              : 'Tazama tangazo ili kurudisha matumizi kuwa 0/5'}
          </p>
          <Button onClick={handleWatchAd} variant="success" className="w-full">
            {lang === 'ko' ? '🎬 광고 보고 초기화' : '🎬 Tazama na urudishe'}
          </Button>
          {!isCapacitorNative() && (
            <button
              className="text-xs text-white/30 underline"
              onClick={() => {
                grantTranslateBonus()
                setShowAdPrompt(false)
                setRefresh((n) => n + 1)
                if (query.trim()) doSearch()
              }}
            >
              {lang === 'ko' ? '(웹 테스트: 무료 초기화)' : '(Web test: rudisha bure)'}
            </button>
          )}
        </div>
      )}

      {/* 결과 */}
      {result && !showAdPrompt && (
        <ResultCard
          result={result}
          lang={lang}
          onSave={handleSave}
          isSaved={savedWords.has(`${result.from}:${result.word.toLowerCase()}`)}
        />
      )}

      {/* 검색 힌트 (결과 없을 때) */}
      {!result && !error && !showAdPrompt && !loading && (
        <div className="text-center py-8 space-y-3">
          <p className="text-4xl">📖</p>
          <p className="text-sm text-white/40">{t('searchHint', lang)}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {['habari', 'nyumba', 'hello', 'food', '안녕', '감사'].map((w) => (
              <button
                key={w}
                className="rounded-lg bg-white/8 px-3 py-1.5 text-xs text-white/50 hover:bg-white/14 transition active:scale-95"
                onClick={() => {
                  setQuery(w)
                  setTimeout(() => {
                    const fromLang = detectLang(w)
                    translate(w, fromLang).then((res) => {
                      setResult(res)
                      setHistory((prev) => [res, ...prev.filter((h) => h.word !== res.word)].slice(0, 20))
                      setRefresh((n) => n + 1)
                    }).catch(() => {})
                  }, 0)
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 검색 히스토리 */}
      {history.length > 0 && !loading && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider">
            {lang === 'ko' ? '최근 검색' : 'Utafutaji wa hivi karibuni'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {history.map((item) => {
              const codes: Record<string, Record<Lang, string>> = {
                sw: { ko: 'SW', sw: 'KSW', en: 'SW' },
                ko: { ko: 'KO', sw: 'KKO', en: 'KO' },
                en: { ko: 'EN', sw: 'EN', en: 'EN' },
              }
              return (
                <button
                  key={`${item.from}:${item.word}`}
                  className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1 text-xs text-white/60 hover:bg-white/14 transition active:scale-95"
                  onClick={() => handleHistoryClick(item)}
                >
                  <span className="text-[10px] font-bold text-white/40">{codes[item.from]?.[lang] ?? item.from.toUpperCase()}</span>
                  <span>{item.word}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
