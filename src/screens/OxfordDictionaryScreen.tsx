import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Deck, TargetLang, VocabItem } from '../lib/types'
import type { Action } from '../app/state'
import { Button } from '../components/Button'
import { CorrectedAudioBtn } from '../components/CorrectedAudioBtn'
import {
  PREFER_CLIENT_KO_TTS_WORDS,
  WORD_DISPLAY_OVERRIDE,
  applyEnOverride,
  applyKoOverride,
} from '../lib/displayOverrides'
import { VocabImage } from '../components/VocabImage'
import { t, type Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { isKoEnOxford, queryOxfordKoEn } from '../lib/oxfordApi'
import { wikiSearchTitlesFromMeaningEn } from '../lib/wikiThumbnail'
import { romanizeKoreanText } from '../lib/koreanRomanization'
import {
  translate,
  hasGeminiApi,
  canTranslate,
  getTranslateUsage,
  grantTranslateBonus,
  warmupTranslate,
  type TranslationResult,
} from '../lib/translate'
import {
  showRewardedAd,
  canAccessDictionary,
  grantDictionaryAccess,
  getDictionaryAccessRemainingTime,
} from '../lib/admob'
import type { OxfordRow } from './OxfordCloudScreen'

const DICTIONARY_DECK_NAME = '사전'

const HANGUL_RE = /[\uAC00-\uD7AF\u3130-\u318F]/
const ENGLISH_COMMON_RE = /^[a-zA-Z\s'-]+$/

/** Oxford 사전 입력에서 EN/KO 만 구분 (스와힐리어는 Oxford 범주 외이므로 EN 으로 폴백). */
function detectInputLang(text: string): 'ko' | 'en' {
  const trimmed = text.trim()
  if (HANGUL_RE.test(trimmed)) return 'ko'
  if (ENGLISH_COMMON_RE.test(trimmed)) return 'en'
  return 'en'
}

/** AI(Gemini) 사전 결과 표시 카드. */
function AiResultCard({
  result,
  lang,
  saved,
  onSave,
}: {
  result: TranslationResult
  lang: Lang
  saved: boolean
  onSave?: () => void
}) {
  const koMeaning = result.meanings.find((m) => m.lang === 'ko')?.text
  const enMeaning = result.meanings.find((m) => m.lang === 'en')?.text
  const swMeaning = result.meanings.find((m) => m.lang === 'sw')?.text

  return (
    <div className="rounded-2xl p-4 app-card backdrop-blur space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(var(--purple),0.2)] px-2 py-0.5 text-[10px] font-bold text-[rgb(var(--purple))]">
          AI
        </span>
        <div className="text-lg font-extrabold text-white break-words">{result.word}</div>
        {result.pos && (
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/65">
            {result.pos}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {koMeaning && (
          <div className="text-sm text-white/85">
            <span className="text-white/50 mr-1">KO:</span>
            {koMeaning}
          </div>
        )}
        {enMeaning && (
          <div className="text-sm text-white/85">
            <span className="text-white/50 mr-1">EN:</span>
            {enMeaning}
          </div>
        )}
        {swMeaning && (
          <div className="text-sm text-white/85">
            <span className="text-white/50 mr-1">SW:</span>
            {swMeaning}
          </div>
        )}
      </div>
      {result.examples && result.examples.length > 0 && (
        <div className="border-t border-white/10 pt-3 space-y-2">
          {result.examples.slice(0, 2).map((ex, i) => (
            <div key={i} className="text-xs text-white/80 space-y-0.5">
              <div className="font-semibold text-purple-300 break-words">{ex.sentence}</div>
              {ex.translation && (
                <div className="text-white/55 break-words">{ex.translation}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {result.note && (
        <div className="text-[11px] text-white/45 italic break-words border-t border-white/10 pt-3">
          {result.note}
        </div>
      )}
      {onSave && (
        <button
          onClick={onSave}
          disabled={saved}
          className={
            'w-full rounded-xl py-2 text-sm font-bold transition ' +
            (saved
              ? 'bg-[rgba(var(--green),0.15)] text-[rgb(var(--green))] cursor-default'
              : 'bg-[rgba(var(--purple),0.25)] text-[rgb(var(--purple))] hover:bg-[rgba(var(--purple),0.35)]')
          }
        >
          {saved
            ? lang === 'sw'
              ? '✅ Imehifadhiwa'
              : lang === 'en'
                ? '✅ Saved to wordbook'
                : '✅ 단어장에 저장됨'
            : lang === 'sw'
              ? '📥 Hifadhi kwenye Kamusi'
              : lang === 'en'
                ? '📥 Save to dictionary'
                : '📥 사전 단어장에 저장'}
        </button>
      )}
    </div>
  )
}

function aiResultToVocabPayload(
  result: TranslationResult,
  deckId: string,
  koreanIsTarget: boolean,
): Omit<VocabItem, 'id' | 'createdAt' | 'updatedAt' | 'srs'> {
  const koMeaning = result.meanings.find((m) => m.lang === 'ko')?.text ?? ''
  const enMeaning = result.meanings.find((m) => m.lang === 'en')?.text ?? ''
  const koWord = result.from === 'ko' ? result.word : koMeaning
  const enWord = result.from === 'en' ? result.word : enMeaning
  const ex = result.examples?.[0]
  const exampleKo = ex?.ko ?? (result.from === 'ko' ? ex?.sentence : ex?.translation)
  const exampleEn = ex?.en ?? (result.from === 'en' ? ex?.sentence : ex?.translation)
  const sw = koreanIsTarget ? koWord || result.word : enWord || result.word
  return {
    deckId,
    sw,
    ko: koWord,
    en: enWord,
    pos: result.pos || undefined,
    tags: ['ai'],
    example: koreanIsTarget ? exampleKo : exampleEn,
    exampleKo: exampleKo || undefined,
    exampleEn: exampleEn || undefined,
    note: undefined,
  }
}

function aiSavedKey(result: TranslationResult): string {
  return `ai:${result.from}:${result.word.trim().toLowerCase()}`
}

function rowToVocabPayload(
  r: OxfordRow,
  deckId: string,
  koreanIsTarget: boolean,
): Omit<VocabItem, 'id' | 'createdAt' | 'updatedAt' | 'srs'> {
  // koreanIsTarget=true → 한국어 학습자 (en-ko): 학습 대상 = 한국어, 모국어 = 영어
  // koreanIsTarget=false → 영어 학습자 (ko-en): 학습 대상 = 영어, 모국어 = 한국어
  const sw = koreanIsTarget ? r.korean_meaning : r.word
  const ko = r.korean_meaning
  const en = r.word
  return {
    deckId,
    sw,
    ko,
    en,
    pos: undefined,
    tags: r.category ? [r.category] : [],
    example: koreanIsTarget ? r.korean_example ?? undefined : r.english_example ?? undefined,
    exampleKo: r.korean_example ?? undefined,
    exampleEn: r.english_example ?? undefined,
    note: undefined,
  }
}

export function OxfordDictionaryScreen({
  lang,
  targetLang,
  decks,
  items,
  dispatch,
}: {
  lang: Lang
  targetLang: TargetLang
  decks?: Deck[]
  items?: VocabItem[]
  dispatch?: (a: Action) => void
}) {
  const koreanIsTarget = targetLang === 'ko'
  const safeDecks = useMemo(() => (Array.isArray(decks) ? decks : []), [decks])
  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OxfordRow[]>([])
  const [aiResult, setAiResult] = useState<TranslationResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiUsage, setAiUsage] = useState(() => getTranslateUsage())
  const [showAdPrompt, setShowAdPrompt] = useState(false)
  const [adLoading, setAdLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savedAiKeys, setSavedAiKeys] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  // 사전 접근 게이트: 보상형 광고 시청 후 30분간 접근 가능
  const [hasAccess, setHasAccess] = useState(() => canAccessDictionary())
  const [accessAdLoading, setAccessAdLoading] = useState(false)
  const [accessAdError, setAccessAdError] = useState<string | null>(null)
  const [accessRemaining, setAccessRemaining] = useState(getDictionaryAccessRemainingTime())

  // Edge Function 콜드 스타트 워밍업 (사전 진입 직후 1회).
  useEffect(() => {
    if (!hasAccess) return
    warmupTranslate()
  }, [hasAccess])

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
        window.setTimeout(() => inputRef.current?.focus(), 100)
      } else {
        setAccessAdError(
          lang === 'sw'
            ? 'Tangazo halikupakuliwa. Tafadhali jaribu tena baadaye.'
            : lang === 'en'
              ? 'Ad failed to load. Please try again later.'
              : '광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
        )
      }
    } catch (err) {
      console.error('[OxfordDictionary] 접근 광고 표시 실패:', err)
      setAccessAdError(
        lang === 'sw'
          ? 'Hitilafu wakati wa kuonyesha tangazo.'
          : lang === 'en'
            ? 'An error occurred while showing the ad.'
            : '광고 표시 중 오류가 발생했어요.',
      )
    } finally {
      setAccessAdLoading(false)
    }
  }, [lang])

  const dictionaryDeck = useMemo(
    () => safeDecks.find((d) => d.name === DICTIONARY_DECK_NAME),
    [safeDecks],
  )

  // 이미 저장된 단어 표시
  useEffect(() => {
    if (!dictionaryDeck) return
    const saved = new Set<string>()
    const savedAi = new Set<string>()
    for (const it of safeItems) {
      if (it.deckId !== dictionaryDeck.id) continue
      const tag = (it.tags ?? [])[0]
      if (tag && tag.startsWith('oxford:')) {
        saved.add(tag.slice('oxford:'.length))
      } else if (tag && tag.startsWith('ai:')) {
        savedAi.add(tag)
      }
    }
    setSavedIds(saved)
    setSavedAiKeys(savedAi)
  }, [dictionaryDeck, safeItems])

  useEffect(() => {
    if (!hasAccess) return
    inputRef.current?.focus()
  }, [hasAccess])

  const runAiSearch = useCallback(
    async (q: string) => {
      if (!hasGeminiApi()) return
      if (!canTranslate()) {
        setShowAdPrompt(true)
        return
      }
      setAiLoading(true)
      try {
        const fromLang = detectInputLang(q)
        const res = await translate(q, fromLang)
        setAiResult(res)
        setAiUsage(getTranslateUsage())
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === 'LIMIT_REACHED') {
          setShowAdPrompt(true)
        } else {
          setError(
            lang === 'en'
              ? `AI search failed: ${msg}`
              : lang === 'sw'
                ? `Utafutaji wa AI umeshindwa: ${msg}`
                : `AI 검색 실패: ${msg}`,
          )
        }
      } finally {
        setAiLoading(false)
      }
    },
    [lang],
  )

  const handleWatchAd = useCallback(async () => {
    setAdLoading(true)
    try {
      const success = await showRewardedAd()
      if (success) {
        grantTranslateBonus()
        setAiUsage(getTranslateUsage())
        setShowAdPrompt(false)
        const q = query.trim()
        if (q) await runAiSearch(q)
      } else {
        setError(
          lang === 'en'
            ? 'Ad failed to load. Please try again.'
            : lang === 'sw'
              ? 'Tangazo halikupakuliwa. Tafadhali jaribu tena.'
              : '광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdLoading(false)
    }
  }, [lang, query, runAiSearch])

  const onSearch = async () => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setAiResult(null)
      setShowAdPrompt(false)
      return
    }
    setShowAdPrompt(false)
    if (isKoEnOxford(targetLang)) {
      setLoading(true)
      setError(null)
      setAiResult(null)
      try {
        const { rows } = await queryOxfordKoEn({ search: q, limit: 50 })
        setResults(rows)
        if (rows.length === 0) {
          await runAiSearch(q)
        }
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
    setAiResult(null)
    try {
      const { data, error: e } = await supabase
        .from('oxford_vocab')
        .select('*')
        .or(`word.ilike.%${q}%,korean_meaning.ilike.%${q}%`)
        .limit(50)
      if (e) throw e
      const rows = (data ?? []) as OxfordRow[]
      setResults(rows)
      // Oxford DB 에 결과가 없으면 AI 사전으로 폴백 (모든 단어 검색 가능).
      if (rows.length === 0) {
        await runAiSearch(q)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const ensureDictionaryDeckId = useCallback((): string => {
    if (!dispatch) return ''
    if (dictionaryDeck) return dictionaryDeck.id
    dispatch({ type: 'deckAdd', name: DICTIONARY_DECK_NAME })
    const updated = safeDecks.find((d) => d.name === DICTIONARY_DECK_NAME)
    return updated?.id ?? ''
  }, [dictionaryDeck, dispatch, safeDecks])

  const onSave = useCallback(
    (r: OxfordRow) => {
      const deckId = ensureDictionaryDeckId()
      if (!deckId || !dispatch) return
      if (savedIds.has(String(r.id))) return
      const payload = rowToVocabPayload(r, deckId, koreanIsTarget)
      // tags[0] = 'oxford:<id>' 로 중복 저장 방지 식별자 추가
      const finalPayload = {
        ...payload,
        tags: [`oxford:${r.id}`, ...(payload.tags ?? [])],
      }
      dispatch({ type: 'add', item: finalPayload })
      setSavedIds((prev) => new Set(prev).add(String(r.id)))
    },
    [ensureDictionaryDeckId, dispatch, koreanIsTarget, savedIds],
  )

  const onSaveAi = useCallback(
    (result: TranslationResult) => {
      const deckId = ensureDictionaryDeckId()
      if (!deckId || !dispatch) return
      const key = aiSavedKey(result)
      if (savedAiKeys.has(key)) return
      const payload = aiResultToVocabPayload(result, deckId, koreanIsTarget)
      const finalPayload = {
        ...payload,
        tags: [key, ...(payload.tags ?? []).filter((t) => t !== 'ai')],
      }
      dispatch({ type: 'add', item: finalPayload })
      setSavedAiKeys((prev) => new Set(prev).add(key))
    },
    [ensureDictionaryDeckId, dispatch, koreanIsTarget, savedAiKeys],
  )

  const placeholder =
    lang === 'sw'
      ? 'hello, food, 사과...'
      : lang === 'en'
        ? 'hello, food, 사과...'
        : 'hello, food, 사과...'

  // ─── 사전 접근 게이트 ──────────────────────────────
  if (!hasAccess) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-white">{t('dictionaryTitle', lang)}</h2>
            <p className="text-xs text-white/50">
              {lang === 'sw'
                ? 'Tafuta neno la Oxford 5000'
                : lang === 'en'
                  ? 'Search Oxford 5000 words'
                  : 'Oxford 5000 단어를 검색하세요'}
            </p>
          </div>
        </div>

        <div className="app-card rounded-3xl p-6 text-center space-y-4">
          <div className="text-5xl animate-bounce">🎬</div>
          <h3 className="text-xl font-extrabold text-white">
            {lang === 'sw'
              ? 'Tazama tangazo ili kutumia kamusi'
              : lang === 'en'
                ? 'Watch an ad to use the dictionary'
                : '사전을 사용하려면 광고를 시청하세요'}
          </h3>
          <p className="text-sm text-white/70 leading-relaxed">
            {lang === 'sw'
              ? 'Tazama tangazo fupi ili kutumia kamusi bila vikwazo kwa dakika 30.'
              : lang === 'en'
                ? 'Watch a short rewarded ad to use the dictionary freely for 30 minutes.'
                : '짧은 보상형 광고를 시청하면 30분간 사전 기능을 자유롭게 사용할 수 있어요.'}
          </p>

          {accessAdError && (
            <div className="rounded-xl bg-[rgba(var(--orange),0.15)] p-3 text-xs text-[rgb(var(--orange))]">
              {accessAdError}
            </div>
          )}

          <button
            onClick={handleWatchAccessAd}
            disabled={accessAdLoading}
            className={
              'w-full h-14 rounded-2xl font-black text-lg tracking-wide text-white transition-all ' +
              'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 ' +
              'shadow-[0_8px_32px_rgba(34,197,94,0.5)] ring-2 ring-green-400/50 ' +
              'hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(34,197,94,0.6)] ' +
              'active:scale-[0.98] ' +
              (accessAdLoading ? 'opacity-70 cursor-wait' : '')
            }
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
          >
            {accessAdLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                {lang === 'sw' ? 'Inapakia...' : lang === 'en' ? 'Loading...' : '로딩 중...'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">▶</span>
                {lang === 'sw'
                  ? 'Tazama na uanze'
                  : lang === 'en'
                    ? 'Watch ad and start'
                    : '광고 보고 시작'}
              </span>
            )}
          </button>

          <p className="text-[11px] text-white/40 leading-relaxed">
            {lang === 'sw'
              ? 'Baada ya tangazo, unaweza kutumia kamusi kwa dakika 30. Baada ya muda huo utahitaji kutazama tangazo tena.'
              : lang === 'en'
                ? 'After watching the ad, you can use the dictionary for 30 minutes. After that, you will need to watch another ad.'
                : '광고 시청 후 30분간 사전을 자유롭게 이용할 수 있어요. 시간이 지나면 다시 광고를 시청해야 해요.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 — SW-KO DictionaryScreen 과 동일 스타일 */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-white">{t('dictionaryTitle', lang)}</h2>
          <p className="text-xs text-white/50">
            {lang === 'sw'
              ? 'Tafuta neno la Oxford 5000'
              : lang === 'en'
                ? 'Search Oxford 5000 words'
                : 'Oxford 5000 단어를 검색하세요'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-[rgba(var(--green),0.15)] text-[rgb(var(--green))]">
            <span>📖</span>
            <span>Oxford 5000</span>
          </div>
          {hasGeminiApi() && (
            <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[10px] font-bold bg-[rgba(var(--purple),0.18)] text-[rgb(var(--purple))]">
              <span>🤖</span>
              <span>AI {Math.max(0, aiUsage.limit - aiUsage.used)}/{aiUsage.limit}</span>
            </div>
          )}
        </div>
      </div>

      {/* 사전 접근 권한 남은 시간 */}
      {accessRemaining > 0 && (
        <div className="rounded-xl border border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/10 px-3 py-2 text-xs text-white/80 text-center">
          <span className="text-[rgb(var(--green))]">✓</span>{' '}
          {lang === 'sw'
            ? `Muda wa kamusi bila tangazo: ${Math.ceil(accessRemaining / 60000)} dakika`
            : lang === 'en'
              ? `Ad-free dictionary access: ${Math.ceil(accessRemaining / 60000)} min left`
              : `광고 없이 사전 사용 가능: ${Math.ceil(accessRemaining / 60000)}분 남음`}
        </div>
      )}

      {/* 검색 입력 */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSearch()
            }}
            placeholder={placeholder}
            className="h-11 w-full rounded-xl bg-white/10 pl-3 pr-10 text-sm text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-[rgb(var(--purple))]/60 transition"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query && (
              <button
                className="rounded-full p-1 text-white/40 hover:text-white/70 transition"
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setAiResult(null)
                  setShowAdPrompt(false)
                  setError(null)
                  inputRef.current?.focus()
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <Button onClick={onSearch} disabled={loading || !query.trim()} className="shrink-0">
          {loading ? <span className="inline-block animate-spin">⏳</span> : <span>🔍</span>}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-[rgba(var(--orange),0.15)] p-3 text-xs text-[rgb(var(--orange))]">
          {error}
        </div>
      )}

      {showAdPrompt && (
        <div className="app-card rounded-2xl p-4 text-center space-y-3">
          <p className="text-3xl">🎬</p>
          <p className="text-sm font-bold text-white">
            {lang === 'sw'
              ? 'Umetumia tafsiri zote za bure za leo'
              : lang === 'en'
                ? "You've used all of today's free AI searches"
                : '오늘의 무료 AI 검색을 모두 사용했어요'}
          </p>
          <p className="text-xs text-white/50">
            {lang === 'sw'
              ? `Tazama tangazo ili kurudisha matumizi kuwa 0/${aiUsage.limit}`
              : lang === 'en'
                ? `Watch an ad to reset usage to 0/${aiUsage.limit}`
                : `광고를 시청하면 사용량이 0/${aiUsage.limit}로 초기화됩니다`}
          </p>
          <Button onClick={handleWatchAd} disabled={adLoading} className="w-full">
            {adLoading ? (
              <span className="inline-block animate-spin">⏳</span>
            ) : lang === 'sw' ? (
              '🎬 Tazama na urudishe'
            ) : lang === 'en' ? (
              '🎬 Watch ad and reset'
            ) : (
              '🎬 광고 보고 초기화'
            )}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl p-6 text-center app-card backdrop-blur">
          <div className="text-sm font-semibold text-white/70">
            {lang === 'sw' ? 'Inapakia...' : lang === 'en' ? 'Loading...' : '불러오는 중...'}
          </div>
        </div>
      ) : aiLoading ? (
        <div className="rounded-3xl p-6 text-center app-card backdrop-blur">
          <div className="text-sm font-semibold text-white/70">
            {lang === 'sw'
              ? '🤖 AI inatafuta...'
              : lang === 'en'
                ? '🤖 AI is searching...'
                : '🤖 AI가 검색 중...'}
          </div>
        </div>
      ) : aiResult ? (
        <AiResultCard
          result={aiResult}
          lang={lang}
          saved={savedAiKeys.has(aiSavedKey(aiResult))}
          onSave={dispatch ? () => onSaveAi(aiResult) : undefined}
        />
      ) : results.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-4xl">📖</p>
          <p className="text-sm text-white/40">
            {query.trim() ? t('noResults', lang) : t('searchHint', lang)}
          </p>
          {!query.trim() && (
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {['hello', 'water', 'food', '사과', '학교', '시간'].map((w) => (
                <button
                  key={w}
                  className="rounded-lg bg-white/8 px-3 py-1.5 text-xs text-white/50 hover:bg-white/14 transition active:scale-95"
                  onClick={() => {
                    setQuery(w)
                    setTimeout(() => void onSearch(), 0)
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {results.map((r) => {
            const koOverride = WORD_DISPLAY_OVERRIDE[r.korean_meaning]
            const displayKorean = koOverride?.word ?? r.korean_meaning
            const displayKoreanPron = koOverride?.pron ?? null
            const targetText = koreanIsTarget ? displayKorean : r.word
            const meaningText = koreanIsTarget
              ? (applyEnOverride(r.word, r.korean_meaning) ?? r.word)
              : (applyKoOverride(r.word, displayKorean) ?? displayKorean)
            const targetAudio = koreanIsTarget ? r.meaning_audio_url : r.word_audio_url
            const targetTtsLang: 'sw' | 'ko' | 'en' = koreanIsTarget ? 'ko' : 'en'
            const meaningAudio = koreanIsTarget ? r.word_audio_url : r.meaning_audio_url
            const meaningTtsLang: 'sw' | 'ko' | 'en' = koreanIsTarget ? 'en' : 'ko'
            const wikiTerms = wikiSearchTitlesFromMeaningEn(r.word, r.word)
            const isSaved = savedIds.has(String(r.id))
            return (
              <div key={r.id} className="rounded-2xl p-4 app-card backdrop-blur space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-lg font-extrabold text-white break-words">
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
                        variant="small"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-white/80 break-words">
                        {meaningText}
                      </div>
                      <CorrectedAudioBtn
                        url={meaningAudio}
                        displayText={meaningText}
                        dbText={koreanIsTarget ? r.word : r.korean_meaning}
                        lang={meaningTtsLang}
                        variant="small"
                      />
                    </div>
                    {r.category ? (
                      <span className="inline-block self-start rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/65">
                        {r.category}
                      </span>
                    ) : null}
                  </div>
                  <div className="w-20 h-20 shrink-0">
                    <VocabImage
                      url={r.image_url}
                      alt={r.word}
                      wikiSearchTerms={wikiTerms}
                      className="w-20 h-20 rounded-xl border border-white/10 object-cover"
                    />
                  </div>
                </div>

                {dispatch && (
                  <button
                    onClick={() => onSave(r)}
                    disabled={isSaved}
                    className={
                      'w-full rounded-xl py-2 text-sm font-bold transition ' +
                      (isSaved
                        ? 'bg-[rgba(var(--green),0.15)] text-[rgb(var(--green))] cursor-default'
                        : 'bg-[rgba(var(--purple),0.25)] text-[rgb(var(--purple))] hover:bg-[rgba(var(--purple),0.35)]')
                    }
                  >
                    {isSaved
                      ? lang === 'sw'
                        ? '✅ Imehifadhiwa'
                        : lang === 'en'
                          ? '✅ Saved to wordbook'
                          : '✅ 단어장에 저장됨'
                      : lang === 'sw'
                        ? '📥 Hifadhi kwenye Kamusi'
                        : lang === 'en'
                          ? '📥 Save to dictionary'
                          : '📥 사전 단어장에 저장'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
