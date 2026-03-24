import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '../components/Button'
import { cn } from '../components/cn'
import { t, type Lang } from '../lib/i18n'
import {
  translate,
  getTranslateUsage,
  canTranslate,
  canWatchTranslateAd,
  grantTranslateBonus,
  hasGeminiApi,
  type TranslationResult,
} from '../lib/translate'
import { showRewardedAd } from '../lib/admob'
import { azureSynthesizeSpeech, hasAzureTts } from '../lib/azureTts'
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
        {remaining}/{limit} {lang === 'ko' ? '남음' : 'zimebaki'}
      </span>
    </div>
  )
}

function DetectedLangBadge({ text, lang }: { text: string; lang: Lang }) {
  if (!text.trim()) return null
  const detected = detectLang(text)
  const labels: Record<string, Record<Lang, string>> = {
    sw: { ko: '🇰🇪 스와힐리어', sw: '🇰🇪 Kiswahili' },
    ko: { ko: '🇰🇷 한국어', sw: '🇰🇷 Kikorea' },
    en: { ko: '🇬🇧 영어', sw: '🇬🇧 Kiingereza' },
  }
  return (
    <span className="text-[10px] font-bold text-white/30">
      {labels[detected][lang]}
    </span>
  )
}

function TTSButton({ text, ttsLang }: { text: string; ttsLang: 'sw' | 'ko' | 'en' }) {
  const [playing, setPlaying] = useState(false)

  if (!hasAzureTts() || !text) return null

  const handlePlay = async () => {
    if (playing) return
    setPlaying(true)
    try {
      const buf = await azureSynthesizeSpeech(text, ttsLang)
      const blob = new Blob([buf], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        setPlaying(false)
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setPlaying(false)
        URL.revokeObjectURL(url)
      }
      await audio.play()
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

async function searchDB(word: string, fromLang: 'sw' | 'ko' | 'en'): Promise<TranslationResult | null> {
  if (!supabase) return null
  const trimmed = word.trim().toLowerCase()

  const allModes: ('ko' | 'sw')[] = ['sw', 'ko']

  // 1) word 컬럼에서 정확 매치
  for (const mode of allModes) {
    const { data } = await supabase
      .from('generated_vocab')
      .select('*')
      .eq('mode', mode)
      .ilike('word', trimmed)
      .limit(1)
    if (data?.length) return dbRowToResult(data[0], fromLang)
  }

  // 2) meaning 컬럼에서 정확 매치
  for (const mode of allModes) {
    const meaningCol = fromLang === 'ko' ? 'meaning_ko' : fromLang === 'en' ? 'meaning_en' : 'meaning_ko'
    const { data } = await supabase
      .from('generated_vocab')
      .select('*')
      .eq('mode', mode)
      .ilike(meaningCol, trimmed)
      .limit(1)
    if (data?.length) return dbRowToResult(data[0], fromLang)
  }

  // 3) meaning 컬럼에서 쉼표 구분 항목 매치 (예: "애정, 사랑"에서 "사랑" 매치)
  for (const mode of allModes) {
    const meaningCol = fromLang === 'ko' ? 'meaning_ko' : fromLang === 'en' ? 'meaning_en' : 'meaning_ko'
    const { data } = await supabase
      .from('generated_vocab')
      .select('*')
      .eq('mode', mode)
      .ilike(meaningCol, `%${trimmed}%`)
      .limit(10)
    if (data?.length) {
      const itemMatch = data.find(r => {
        const meaning = (r[meaningCol] ?? '') as string
        return meaning.split(/[,،/]/).some(s => s.trim().toLowerCase() === trimmed)
      })
      if (itemMatch) return dbRowToResult(itemMatch, fromLang)
    }
  }

  // 4) word 컬럼에서 부분 매치
  for (const mode of allModes) {
    const { data } = await supabase
      .from('generated_vocab')
      .select('*')
      .eq('mode', mode)
      .ilike('word', `%${trimmed}%`)
      .limit(5)
    if (data?.length) {
      const exact = data.find(r => (r.word ?? '').toLowerCase() === trimmed)
      return dbRowToResult(exact ?? data[0], fromLang)
    }
  }

  // 5) meaning 컬럼에서 부분 매치
  for (const mode of allModes) {
    const meaningCol = fromLang === 'ko' ? 'meaning_ko' : fromLang === 'en' ? 'meaning_en' : 'meaning_ko'
    const { data } = await supabase
      .from('generated_vocab')
      .select('*')
      .eq('mode', mode)
      .ilike(meaningCol, `%${trimmed}%`)
      .limit(5)
    if (data?.length) return dbRowToResult(data[0], fromLang)
  }

  return null
}

function dbRowToResult(r: any, fromLang: 'sw' | 'ko' | 'en'): TranslationResult {
  const sw = r.mode === 'ko' ? r.word : r.meaning_sw ?? ''
  const ko = r.mode === 'ko' ? (r.meaning_ko ?? '') : r.word
  const en = r.meaning_en ?? ''

  const wordMap: Record<string, string> = { sw, ko, en }
  const word = wordMap[fromLang] || sw || ko

  const meanings: TranslationResult['meanings'] = []
  if (fromLang !== 'sw' && sw) meanings.push({ lang: 'sw', text: sw })
  if (fromLang !== 'ko' && ko) meanings.push({ lang: 'ko', text: ko })
  if (fromLang !== 'en' && en) meanings.push({ lang: 'en', text: en })

  const examples: TranslationResult['examples'] = []
  if (r.example) {
    const isKoMode = r.mode === 'ko'
    const swEx = isKoMode ? (r.example ?? '') : (r.example_translation_sw ?? '')
    const koEx = isKoMode ? (r.example_translation_ko ?? '') : (r.example ?? '')
    const enEx = r.example_translation_en ?? ''
    const translation = fromLang === 'ko' ? (koEx || enEx) : fromLang === 'en' ? (enEx || koEx) : (koEx || enEx)
    examples.push({ sentence: r.example, translation, sw: swEx, ko: koEx, en: enEx })
  }

  const posMap: Record<string, string> = {
    'n.': 'noun', 'v.': 'verb', 'adj.': 'adjective', 'adv.': 'adverb',
    noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'adverb', phrase: 'phrase',
  }

  return {
    word,
    from: fromLang,
    pos: posMap[r.pos ?? ''] ?? r.pos ?? '',
    meanings,
    examples,
    synonyms: [],
    note: '',
  }
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
    noun: { ko: '명사', sw: 'Nomino' },
    verb: { ko: '동사', sw: 'Kitenzi' },
    adjective: { ko: '형용사', sw: 'Kivumishi' },
    adverb: { ko: '부사', sw: 'Kielezi' },
    phrase: { ko: '구문', sw: 'Kifungu' },
    other: { ko: '기타', sw: 'Nyingine' },
  }

  const langBadgeColors: Record<string, string> = {
    sw: 'bg-emerald-500/20 text-emerald-400',
    ko: 'bg-sky-500/20 text-sky-400',
    en: 'bg-amber-500/20 text-amber-400',
  }
  const langCodes: Record<string, Record<Lang, string>> = {
    sw: { ko: 'SW', sw: 'KSW' },
    ko: { ko: 'KO', sw: 'KKO' },
    en: { ko: 'EN', sw: 'EN' },
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
    inputRef.current?.focus()
  }, [])

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
        setError(
          lang === 'ko'
            ? `번역 실패: ${err.message}`
            : `Tafsiri imeshindwa: ${err.message}`,
        )
      }
    } finally {
      setLoading(false)
    }
  }, [query, lang])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch()
  }

  const handleWatchAd = async () => {
    if (!canWatchTranslateAd()) {
      setError(
        lang === 'ko'
          ? '오늘 광고 시청 가능 횟수를 모두 사용했습니다.'
          : 'Umetumia fursa zote za kutazama matangazo leo.',
      )
      return
    }

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
              ? '광고를 시청하면 10회 추가 번역이 가능합니다'
              : 'Tazama tangazo kupata tafsiri 10 zaidi'}
          </p>
          {canWatchTranslateAd() ? (
            <Button onClick={handleWatchAd} variant="success" className="w-full">
              {lang === 'ko' ? '🎬 광고 보고 10회 충전' : '🎬 Tazama na upate 10 zaidi'}
            </Button>
          ) : (
            <p className="text-xs text-white/40">
              {lang === 'ko'
                ? '오늘 광고 시청 가능 횟수를 모두 사용했습니다. 내일 다시 이용하세요!'
                : 'Umetumia fursa zote za leo. Rudi kesho!'}
            </p>
          )}
          {!isCapacitorNative() && (
            <button
              className="text-xs text-white/30 underline"
              onClick={() => {
                grantTranslateBonus()
                setShowAdPrompt(false)
                setRefresh((n) => n + 1)
              }}
            >
              {lang === 'ko' ? '(웹 테스트: 무료 충전)' : '(Web test: free charge)'}
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
              const codes: Record<string, Record<'ko' | 'sw', string>> = {
                sw: { ko: 'SW', sw: 'KSW' },
                ko: { ko: 'KO', sw: 'KKO' },
                en: { ko: 'EN', sw: 'EN' },
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
