import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Input } from '../components/TextField'
import { useToast } from '../components/Toast'
import { t, type Lang } from '../lib/i18n'
import type { NativeLang, TargetLang, Deck, VocabItem } from '../lib/types'
import type { Action } from '../app/state'
import { supabase } from '../lib/supabase'
import { isKoEnOxford, loadOxfordKoEnAll, queryOxfordKoEn, filterOxfordRows } from '../lib/oxfordApi'
import { OxfordCloudScreen, type OxfordRow } from './OxfordCloudScreen'
import {
  FlashcardScreen,
  WRONG_ANSWERS_UPDATED_EVENT,
  getWrongAnswersCount,
} from './FlashcardScreen'
import { WordbookScreen } from './WordbookScreen'
import { DictionaryDayList } from './DictionaryDayList'
import { oxfordRowsToUserWords } from '../lib/oxfordAdapter'
import { dedupRowsByKoreanMeaning, dedupRowsByEnglishWord } from '../lib/oxfordFilterUtils'
import {
  getOxfordCacheCount,
  getOxfordFromCache,
  isOnline,
  onOnlineStatusChange,
} from '../lib/offlineCache'
import { maybeShowInterstitialAd } from '../lib/admob'
import {
  getOxfordWordsByTopic,
  getOrderedOxfordWords,
  parseOxfordFilter,
  NUMBER_WORDS_1_50,
} from '../lib/oxfordFilterUtils'

const WORDS_PER_DAY = 40
const DICTIONARY_DECK_NAME = '사전'
const ALL_DECK_NAME = '모든 단어'

// 난이도 + 상황별 8개 카테고리는 DB `category` 컬럼으로 직접 매칭
type CatKey = '입문' | '초급' | '중급' | '고급' | '여행' | '비즈니스' | '쇼핑' | '위기탈출'

const LEVEL_DECK_NAMES: CatKey[] = ['입문', '초급', '중급', '고급']
const CATEGORY_DECK_NAMES: CatKey[] = ['여행', '비즈니스', '쇼핑', '위기탈출']
const BUILT_IN_NAMES = new Set<string>([
  ...LEVEL_DECK_NAMES,
  ...CATEGORY_DECK_NAMES,
  DICTIONARY_DECK_NAME,
  ALL_DECK_NAME,
])

type DeckInfo = {
  key: CatKey
  emoji: string
  label: Record<Lang, string>
}

const LEVEL_INFO: DeckInfo[] = [
  { key: '입문', emoji: '🌱', label: { sw: 'Utangulizi', ko: '입문', en: 'Beginner' } },
  { key: '초급', emoji: '📗', label: { sw: 'Mwanzo', ko: '초급', en: 'Elementary' } },
  { key: '중급', emoji: '📘', label: { sw: 'Kati', ko: '중급', en: 'Intermediate' } },
  { key: '고급', emoji: '📕', label: { sw: 'Juu', ko: '고급', en: 'Advanced' } },
]

// 카테고리별 단어장 — SW-KO `WordbookTab.tsx` `CATEGORY_INFO` 와 같은 형태.
// `filter` 는 다음 prefix 중 하나를 사용:
//   category:<name>     → DB `category` 컬럼
//   classified:<topic>  → `oxfordTopicClassification.ts` 의 토픽
//   pos:<pos>           → DB `pos` 컬럼 (noun|verb|adjective|adverb)
//   ordered:<key>       → 하드코딩된 단어 목록 (예: `숫자1-50`)
type CategoryEntry = {
  key: string
  emoji: string
  label: Record<Lang, string>
  filter: string
  group: 'situation' | 'subject' | 'pos'
}

const CATEGORY_INFO: CategoryEntry[] = [
  // 상황별 (SW-KO 와 동일)
  { key: 'cl:일상생활', emoji: '🏡', label: { sw: 'Maisha ya Kila Siku', ko: '일상생활', en: 'Daily Life' }, filter: 'classified:일상생활', group: 'situation' },
  { key: '여행', emoji: '✈️', label: { sw: 'Safari', ko: '여행', en: 'Travel' }, filter: 'category:여행', group: 'situation' },
  { key: '비즈니스', emoji: '💼', label: { sw: 'Biashara', ko: '비즈니스', en: 'Business' }, filter: 'category:비즈니스', group: 'situation' },
  { key: '쇼핑', emoji: '🛍️', label: { sw: 'Ununuzi', ko: '쇼핑', en: 'Shopping' }, filter: 'category:쇼핑', group: 'situation' },
  { key: '위기탈출', emoji: '🆘', label: { sw: 'Dharura', ko: '위기탈출', en: 'Emergency' }, filter: 'category:위기탈출', group: 'situation' },
  // 주제별 (분류 데이터 기반)
  { key: 'ord:숫자1-50', emoji: '🔢', label: { sw: 'Namba', ko: '숫자', en: 'Numbers' }, filter: 'ordered:숫자1-50', group: 'subject' },
  { key: 'cl:숫자/수량', emoji: '🔢', label: { sw: 'Namba / Kiasi', ko: '숫자/수량', en: 'Numbers / Quantity' }, filter: 'classified:숫자/수량', group: 'subject' },
  { key: 'cl:음식/음료', emoji: '🍽️', label: { sw: 'Chakula/Vinywaji', ko: '음식/음료', en: 'Food/Drinks' }, filter: 'classified:음식/음료', group: 'subject' },
  { key: 'cl:가족/관계', emoji: '👪', label: { sw: 'Familia/Uhusiano', ko: '가족/관계', en: 'Family/Relations' }, filter: 'classified:가족/관계', group: 'subject' },
  { key: 'cl:자연/동물', emoji: '🌿', label: { sw: 'Asili/Wanyama', ko: '자연/동물', en: 'Nature/Animals' }, filter: 'classified:자연/동물', group: 'subject' },
  { key: 'cl:집/생활용품', emoji: '🏠', label: { sw: 'Nyumba/Vifaa', ko: '집/생활용품', en: 'Home/Household' }, filter: 'classified:집/생활용품', group: 'subject' },
  { key: 'cl:인사/기본표현', emoji: '👋', label: { sw: 'Salamu', ko: '인사', en: 'Greetings' }, filter: 'classified:인사/기본표현', group: 'subject' },
  { key: 'cl:신체/건강', emoji: '💪', label: { sw: 'Mwili/Afya', ko: '신체/건강', en: 'Body/Health' }, filter: 'classified:신체/건강', group: 'subject' },
  { key: 'cl:시간/날짜', emoji: '⏰', label: { sw: 'Wakati/Tarehe', ko: '시간/날짜', en: 'Time/Date' }, filter: 'classified:시간/날짜', group: 'subject' },
  { key: 'cl:색상/외모', emoji: '🎨', label: { sw: 'Rangi/Sura', ko: '색상/외모', en: 'Colors/Appearance' }, filter: 'classified:색상/외모', group: 'subject' },
  { key: 'cl:교통/이동', emoji: '🚗', label: { sw: 'Usafiri/Msogeo', ko: '교통/이동', en: 'Transport' }, filter: 'classified:교통/이동', group: 'subject' },
  // 품사별 (DB `pos` 컬럼 기반)
  { key: 'pos:noun', emoji: '📝', label: { sw: 'Nomino', ko: '명사', en: 'Noun' }, filter: 'pos:noun', group: 'pos' },
  { key: 'pos:verb', emoji: '🏃', label: { sw: 'Kitenzi', ko: '동사', en: 'Verb' }, filter: 'pos:verb', group: 'pos' },
  { key: 'pos:adjective', emoji: '🎨', label: { sw: 'Kivumishi', ko: '형용사', en: 'Adjective' }, filter: 'pos:adjective', group: 'pos' },
  { key: 'pos:adverb', emoji: '⏩', label: { sw: 'Kielezi', ko: '부사', en: 'Adverb' }, filter: 'pos:adverb', group: 'pos' },
]

const DAY_LABEL: Record<Lang, string> = { sw: 'Siku', ko: 'Day', en: 'Day' }
const WORDS_LABEL: Record<Lang, string> = { sw: 'maneno', ko: '개 단어', en: 'words' }
const ALL_WORDS_LABEL: Record<Lang, string> = {
  sw: 'Maneno Yote',
  ko: '모든 단어',
  en: 'All Words',
}
const DICTIONARY_LABEL: Record<Lang, string> = {
  sw: 'Kamusi ya Maneno',
  ko: '사전 단어장',
  en: 'Dictionary',
}
const CATEGORY_GROUP_LABEL: Record<Lang, string> = {
  sw: 'Msamiati kwa Kundi',
  ko: '카테고리별 단어장',
  en: 'By Category',
}
const HANGEUL_LABEL: Record<Lang, string> = {
  sw: 'Jifunze Hangeul',
  ko: '한글 글자 공부',
  en: 'Learn Hangeul',
}
const HANGEUL_SUBLABEL: Record<Lang, string> = {
  sw: 'Konsonanti & Irabu',
  ko: '자음 & 모음',
  en: 'Consonants & Vowels',
}
const WRONG_NOTE_LABEL: Record<Lang, string> = {
  sw: 'Orodha ya Makosa',
  ko: '오답노트',
  en: 'Wrong Notes',
}
const WRONG_NOTE_DESC: Record<Lang, string> = {
  sw: 'maneno ya kurudia',
  ko: '개 단어 복습 필요',
  en: 'words to review',
}
// Selected view state.
// `category` 는 8개 DB 카테고리 중 하나 또는 빈 문자열(전체).
// `filter` 는 `CategoryEntry.filter` 와 같은 prefix 형태 (classified:/pos:/ordered:/category:) 로,
// 카테고리별 단어장에서 진입한 비-DB 카테고리(주제·POS·ordered) 를 표현한다.
type DeckSelection =
  | { kind: 'home' }
  | { kind: 'categories' }
  | { kind: 'days'; category: CatKey | ''; filter?: string; title?: string }
  | { kind: 'words'; category: CatKey | ''; filter?: string; title?: string; day: number }
  | { kind: 'userDeck'; deckId: string }
  | { kind: 'dictionaryDeck'; deckId: string }

export function OxfordAllWordsDayList({
  lang,
  nativeLang,
  targetLang,
  showEnglish = true,
  decks,
  items,
  dispatch,
}: {
  lang: Lang
  nativeLang: NativeLang
  targetLang: TargetLang
  showEnglish?: boolean
  decks: Deck[]
  items: VocabItem[]
  wrong?: { id: string }[]
  dispatch: (a: Action) => void
}) {
  const { toast } = useToast()
  const safeDecks = Array.isArray(decks) ? decks : []
  const safeItems = Array.isArray(items) ? items : []

  const [view, setView] = useState<DeckSelection>({ kind: 'home' })
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [totalCount, setTotalCount] = useState(0)
  const [isLoadingCounts, setIsLoadingCounts] = useState(true)
  const [online, setOnline] = useState(isOnline())

  // Flashcard for built-in deck day
  const [flashOpen, setFlashOpen] = useState(false)
  const [flashRows, setFlashRows] = useState<OxfordRow[]>([])
  const [flashDay, setFlashDay] = useState<number | null>(null)
  const [flashLoading, setFlashLoading] = useState(false)

  // 새 단어장 모달
  const [createOpen, setCreateOpen] = useState(false)
  const [deckName, setDeckName] = useState('')

  // 오답노트 카운트 (FlashcardScreen 의 wrong-answers 와 동기화)
  // koreanIsTarget=true → 'sw' key, false → 'ko' key (oxfordAdapter 와 일관)
  const koreanIsTarget = targetLang === 'ko'
  const wrongMode: 'sw' | 'ko' = koreanIsTarget ? 'sw' : 'ko'
  const [wrongCount, setWrongCount] = useState(0)
  useEffect(() => {
    setWrongCount(getWrongAnswersCount(wrongMode))
    const handle = () => setWrongCount(getWrongAnswersCount(wrongMode))
    window.addEventListener(WRONG_ANSWERS_UPDATED_EVENT, handle)
    return () => window.removeEventListener(WRONG_ANSWERS_UPDATED_EVENT, handle)
  }, [wrongMode])

  // 헤더 뒤로가기 / 안드로이드 뒤로가기 지원: 깊은 뷰로 진입 시 history.pushState 로 기록,
  // popstate 발생 시 destination state 로 뷰를 복원한다. (SW-KO WordbookTab 과 동일한 패턴)
  const pushView = (next: DeckSelection) => {
    if (next.kind !== 'home') {
      window.history.pushState({ screen: 'oxford-view', view: next }, '')
    }
    setView(next)
  }
  const openFlash = () => {
    window.history.pushState({ screen: 'oxford-flash' }, '')
    setFlashOpen(true)
  }
  useEffect(() => {
    const handlePop = (e: PopStateEvent) => {
      const st = e.state as { screen?: string; view?: DeckSelection } | null
      // 목적지가 oxford-flash 가 아니면 플래시카드는 무조건 닫는다.
      // (idempotent — 닫혀 있어도 no-op)
      if (st?.screen !== 'oxford-flash') {
        setFlashOpen(false)
        setFlashDay(null)
        setFlashRows([])
      }
      if (st?.screen === 'oxford-view' && st.view) {
        setView(st.view)
      } else if (st?.screen !== 'oxford-flash') {
        // App 의 tab state 등 oxford 가 아닌 상태로 돌아온 경우 → 홈으로
        setView({ kind: 'home' })
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  useEffect(() => onOnlineStatusChange(setOnline), [])

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoadingCounts(true)
      const next: Record<string, number> = {}
      const dbCats: CatKey[] = [...LEVEL_DECK_NAMES, ...CATEGORY_DECK_NAMES]

      // 주제별/POS/ordered 는 클라이언트/DB 혼합으로 카운트한다.
      const subjectEntries = CATEGORY_INFO.filter((c) => c.group === 'subject')
      const posEntries = CATEGORY_INFO.filter((c) => c.group === 'pos')

      try {
        if (isKoEnOxford(targetLang)) {
          const all = await loadOxfordKoEnAll()
          setTotalCount(all.length)
          for (const k of dbCats) {
            next[k] = all.filter((r) => r.category === k).length
          }
          await Promise.all(
            posEntries.map(async (entry) => {
              const posKey = entry.filter.slice('pos:'.length)
              next[entry.key] = all.filter((r) => (r.pos ?? '').toLowerCase() === posKey).length
            }),
          )
          const classifiedEntries = CATEGORY_INFO.filter((c) =>
            c.filter.startsWith('classified:'),
          )
          for (const entry of classifiedEntries) {
            const topic = entry.filter.slice('classified:'.length)
            const words = getOxfordWordsByTopic(topic)
            if (words.length === 0) {
              next[entry.key] = 0
              continue
            }
            next[entry.key] = filterOxfordRows(all, { words }).length
          }
          for (const entry of CATEGORY_INFO.filter((c) => c.filter.startsWith('ordered:'))) {
            const orderedKey = entry.filter.slice('ordered:'.length)
            const words = orderedKey === '숫자1-50' ? NUMBER_WORDS_1_50 : []
            if (words.length === 0) {
              next[entry.key] = 0
              continue
            }
            const matched = filterOxfordRows(all, { words })
            next[entry.key] = koreanIsTarget
              ? matched.length
              : new Set(matched.map((r) => (r.word ?? '').toLowerCase().trim()).filter(Boolean)).size
          }
        } else if (online && supabase) {
          const totalRes = await supabase
            .from('oxford_vocab')
            .select('*', { count: 'exact', head: true })
          setTotalCount(totalRes.count ?? 0)

          // 1) 8개 DB 카테고리
          await Promise.all(
            dbCats.map(async (k) => {
              try {
                const r = await supabase!
                  .from('oxford_vocab')
                  .select('*', { count: 'exact', head: true })
                  .eq('category', k)
                next[k] = r.count ?? 0
              } catch {
                next[k] = 0
              }
            }),
          )

          // 2) POS 카테고리 (DB pos 컬럼)
          await Promise.all(
            posEntries.map(async (entry) => {
              const posKey = entry.filter.slice('pos:'.length)
              try {
                const r = await supabase!
                  .from('oxford_vocab')
                  .select('*', { count: 'exact', head: true })
                  .eq('pos', posKey)
                next[entry.key] = r.count ?? 0
              } catch {
                next[entry.key] = 0
              }
            }),
          )

          // 3) classified: 카테고리 — 클라이언트 분류 데이터에서 단어 목록을 얻은 뒤
          //    DB 에 그 단어가 실제로 있는 행 수를 카운트한다.
          //    group(situation/subject) 무관하게 모든 `classified:` 카드를 한 번에 처리해야
          //    상황별에 들어 있는 `cl:일상생활` 등도 정상 카운트된다.
          const classifiedEntries = CATEGORY_INFO.filter((c) =>
            c.filter.startsWith('classified:'),
          )
          await Promise.all(
            classifiedEntries.map(async (entry) => {
              const topic = entry.filter.slice('classified:'.length)
              const words = getOxfordWordsByTopic(topic)
              if (words.length === 0) {
                next[entry.key] = 0
                return
              }
              try {
                // .in() 은 1000 개 한도가 있어 chunk 처리
                let total = 0
                const CHUNK = 500
                for (let i = 0; i < words.length; i += CHUNK) {
                  const slice = words.slice(i, i + CHUNK)
                  const r = await supabase!
                    .from('oxford_vocab')
                    .select('*', { count: 'exact', head: true })
                    .in('word', slice)
                  total += r.count ?? 0
                }
                next[entry.key] = total
              } catch {
                next[entry.key] = 0
              }
            }),
          )

          // 4) ordered:숫자1-50 — 정해진 단어 목록 중 DB 에 존재하는 행 수.
          //    KO-EN(한국어→영어) 학습자에게는 같은 영어 단어(예: one=일/하나) 2 행이 1 카드로
          //    합쳐지므로 distinct word 기준으로 카운팅 (헤더와 카드 표시가 화면 카드 수와 일치하게).
          for (const entry of CATEGORY_INFO.filter((c) => c.filter.startsWith('ordered:'))) {
            const orderedKey = entry.filter.slice('ordered:'.length)
            const words = orderedKey === '숫자1-50' ? NUMBER_WORDS_1_50 : []
            if (words.length === 0) {
              next[entry.key] = 0
              continue
            }
            try {
              if (koreanIsTarget) {
                const r = await supabase!
                  .from('oxford_vocab')
                  .select('*', { count: 'exact', head: true })
                  .in('word', words)
                next[entry.key] = r.count ?? 0
              } else {
                const r = await supabase!
                  .from('oxford_vocab')
                  .select('word')
                  .in('word', words)
                const set = new Set(
                  (r.data ?? [])
                    .map((x) => ((x as { word?: string | null }).word ?? '').toLowerCase().trim())
                    .filter(Boolean),
                )
                next[entry.key] = set.size
              }
            } catch {
              next[entry.key] = 0
            }
          }
        } else {
          // 오프라인: 캐시 카운트
          try {
            setTotalCount(await getOxfordCacheCount())
          } catch {
            setTotalCount(0)
          }
          await Promise.all(
            dbCats.map(async (k) => {
              try {
                next[k] = await getOxfordCacheCount(undefined, k)
              } catch {
                next[k] = 0
              }
            }),
          )
          // 오프라인에서는 POS/주제별 카운트 정확도가 떨어지므로 0 으로 둔다 (UI 가 카드는 표시한다).
          for (const e of [...subjectEntries, ...posEntries]) next[e.key] = 0
          for (const e of CATEGORY_INFO.filter((c) => c.filter.startsWith('ordered:'))) {
            next[e.key] = 0
          }
        }
      } catch {
        for (const k of dbCats) if (next[k] == null) next[k] = 0
      } finally {
        for (const k of dbCats) if (next[k] == null) next[k] = 0
        for (const e of CATEGORY_INFO) if (next[e.key] == null) next[e.key] = 0
        setCounts(next)
        setIsLoadingCounts(false)
      }
    }
    void fetchAll()
  }, [online, koreanIsTarget, targetLang])

  const wordsLabel = WORDS_LABEL[lang]
  const dayLabel = DAY_LABEL[lang]

  const activeCount = useMemo(() => {
    if (view.kind === 'home') return totalCount
    if (view.kind === 'categories') {
      return CATEGORY_INFO.reduce((s, c) => s + (counts[c.key] ?? 0), 0)
    }
    if (view.kind === 'days' || view.kind === 'words') {
      // 1) prefix 필터로 진입한 경우 — 해당 CATEGORY_INFO entry 의 카운트
      if (view.filter) {
        const entry = CATEGORY_INFO.find((c) => c.filter === view.filter)
        return entry ? (counts[entry.key] ?? 0) : 0
      }
      // 2) 일반 DB 카테고리(또는 전체)
      return view.category ? (counts[view.category] ?? 0) : totalCount
    }
    return 0
  }, [view, counts, totalCount])

  const startFlashcardForDay = async (
    category: CatKey | '',
    day: number,
    filter?: string,
  ) => {
    setFlashDay(day)
    setFlashLoading(true)
    openFlash()
    setFlashRows([])
    try {
      const start = (day - 1) * WORDS_PER_DAY
      const end = start + WORDS_PER_DAY - 1
      const parsed = filter ? parseOxfordFilter(filter) : {}
      const effectiveCategory = parsed.category ?? category
      const effectivePos = parsed.pos ?? ''
      const wordWhitelist: string[] | null = parsed.classified
        ? getOxfordWordsByTopic(parsed.classified)
        : parsed.ordered
          ? getOrderedOxfordWords(parsed.ordered)
          : null
      const wordList = wordWhitelist
        ? wordWhitelist.length > 0
          ? wordWhitelist
          : ['__none__']
        : null

      if (isKoEnOxford(targetLang) || (online && supabase)) {
        if (isKoEnOxford(targetLang)) {
          const { rows } = await queryOxfordKoEn({
            category: effectiveCategory || undefined,
            pos: effectivePos || undefined,
            words: wordList,
            offset: start,
            limit: WORDS_PER_DAY,
          })
          setFlashRows(rows)
        } else {
        let q = supabase!
          .from('oxford_vocab')
          .select('*')
          .order('order_index', { ascending: true })
        if (effectiveCategory) q = q.eq('category', effectiveCategory)
        if (effectivePos) q = q.eq('pos', effectivePos)
        if (wordList) q = q.in('word', wordList)
        const { data } = await q.range(start, end)
        setFlashRows((data ?? []) as OxfordRow[])
        }
      } else {
        let cached = await getOxfordFromCache(
          undefined,
          day,
          WORDS_PER_DAY,
          effectiveCategory || undefined,
        )
        if (effectivePos) {
          cached = cached.filter(
            (r) => (r.pos ?? '').toLowerCase() === effectivePos.toLowerCase(),
          )
        }
        if (wordWhitelist) {
          const set = new Set(wordWhitelist.map((w) => w.toLowerCase().trim()))
          cached = cached.filter((r) => set.has((r.word ?? '').toLowerCase().trim()))
        }
        setFlashRows(cached as OxfordRow[])
      }
    } catch {
      setFlashRows([])
    } finally {
      setFlashLoading(false)
    }
  }

  const dictionaryDeck = safeDecks.find((d) => d.name === DICTIONARY_DECK_NAME) ?? null

  const createDeck = () => {
    const name = deckName.trim()
    if (!name) {
      toast({ title: t('enterWordbookName', lang) })
      return
    }
    dispatch({ type: 'deckAdd', name })
    setCreateOpen(false)
    setDeckName('')
    toast({ title: t('wordbookCreated', lang), description: name })
  }

  const goToWrongNote = () => {
    dispatch({ type: 'settings', patch: { bottomTab: 'wrong' } })
  }

  const goToHangeul = () => {
    dispatch({ type: 'settings', patch: { topTab: 'hangeul' } })
    maybeShowInterstitialAd()
  }

  // ========================================================================
  // Flashcard 모드
  // ========================================================================
  if (flashOpen) {
    if (flashLoading) {
      return (
        <div className="rounded-3xl p-8 text-center app-card backdrop-blur">
          <div className="text-sm font-semibold text-white/70">
            {lang === 'sw'
              ? 'Inapakia kadi...'
              : lang === 'en'
                ? 'Loading cards...'
                : '카드 불러오는 중...'}
          </div>
        </div>
      )
    }
    const dedupedFlashRows = koreanIsTarget
      ? dedupRowsByKoreanMeaning(flashRows)
      : dedupRowsByEnglishWord(flashRows)
    const userWords = oxfordRowsToUserWords(dedupedFlashRows, koreanIsTarget)
    return (
      <FlashcardScreen
        lang={lang}
        mode={wrongMode}
        dayNumber={flashDay ?? undefined}
        wordsPerDay={WORDS_PER_DAY}
        userWords={userWords}
        onWrongAnswer={(wordId) => dispatch({ type: 'wrongAdd', id: wordId })}
        onClose={() => {
          if (window.history.state?.screen === 'oxford-flash') {
            window.history.back()
          } else {
            setFlashOpen(false)
            setFlashDay(null)
            setFlashRows([])
          }
        }}
      />
    )
  }

  // ========================================================================
  // Day 단어 목록
  // ========================================================================
  if (view.kind === 'words') {
    const start = (view.day - 1) * WORDS_PER_DAY + 1
    const end = Math.min(view.day * WORDS_PER_DAY, activeCount)
    const titleLabel = view.title
      ?? (view.category
        ? LEVEL_INFO.find((c) => c.key === view.category)?.label[lang] ?? view.category
        : ALL_WORDS_LABEL[lang])
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-3xl p-3 sm:p-4 app-card backdrop-blur">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold text-white">
              {dayLabel} {view.day}{' '}
              <span className="text-white/55 ml-2 text-sm">{titleLabel}</span>
            </div>
            <div className="text-xs sm:text-sm font-semibold text-white/60">
              {start} ~ {end}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.history.back()}
          >
            ← {lang === 'sw' ? 'Orodha ya Siku' : lang === 'en' ? 'Day list' : 'Day 목록'}
          </Button>
        </div>
        <OxfordCloudScreen
          lang={lang}
          nativeLang={nativeLang}
          targetLang={targetLang}
          showEnglish={showEnglish}
          categoryFilter={view.filter ? '' : view.category}
          filter={view.filter}
          dayNumber={view.day}
          wordsPerDay={WORDS_PER_DAY}
          title={`${titleLabel} · ${dayLabel} ${view.day}`}
        />
      </div>
    )
  }

  // ========================================================================
  // Day 목록 (특정 카테고리 또는 전체) — SW-KO WordbookTab + AllWordsDayList 와 동일한 2-card 헤더 구조
  // ========================================================================
  if (view.kind === 'days') {
    const totalDays = Math.ceil(activeCount / WORDS_PER_DAY)
    const titleLabel = view.title
      ?? (view.category
        ? LEVEL_INFO.find((c) => c.key === view.category)?.label[lang] ?? view.category
        : ALL_WORDS_LABEL[lang])
    return (
      <div className="space-y-3 sm:space-y-4">
        {/* 1) 부모 헤더: deck 이름 + 돌아가기 (SW-KO WordbookTab 의 selectedDeck 헤더와 동일) */}
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">{titleLabel}</div>
          </div>
          <Button variant="secondary" onClick={() => window.history.back()}>
            {t('backToList', lang)}
          </Button>
        </div>

        {/* 2) Day-list 헤더: SW-KO AllWordsDayList Day-list 헤더와 동일 (back 버튼 없음) */}
        <div className="rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div className="text-lg sm:text-xl font-extrabold text-white">
            {titleLabel} - {lang === 'sw' ? 'Chagua Siku' : lang === 'en' ? 'Pick a Day' : 'Day 선택'}
          </div>
          <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/60">
            {lang === 'sw'
              ? `Jumla: ${activeCount.toLocaleString()} ${wordsLabel} (${totalDays} siku)`
              : lang === 'en'
                ? `Total: ${activeCount.toLocaleString()} ${wordsLabel} (${totalDays} days)`
                : `총 ${activeCount.toLocaleString()}${wordsLabel} (${totalDays}일)`}
          </div>
        </div>

        {totalDays === 0 ? (
          <div className="rounded-3xl p-8 text-center app-card backdrop-blur">
            <div className="text-sm font-semibold text-white/70">
              {lang === 'sw' ? 'Hakuna data.' : lang === 'en' ? 'No data yet.' : '데이터가 없어요.'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
              const startWord = (day - 1) * WORDS_PER_DAY + 1
              const endWord = Math.min(day * WORDS_PER_DAY, activeCount)
              return (
                <div
                  key={day}
                  className="rounded-2xl p-3 sm:p-4 app-card backdrop-blur border border-white/15"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div>
                      <div className="text-base sm:text-lg font-extrabold text-white">
                        {dayLabel} {day}
                      </div>
                      <div className="text-[10px] sm:text-xs font-semibold text-white/50">
                        {startWord}-{endWord}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2">
                    <button
                      onClick={() =>
                        pushView({
                          kind: 'words',
                          category: view.category,
                          filter: view.filter,
                          title: view.title,
                          day,
                        })
                      }
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-white/10 text-white hover:bg-white/20 active:scale-95 transition touch-target"
                    >
                      📚 {lang === 'sw' ? 'Orodha' : lang === 'en' ? 'List' : '목록'}
                    </button>
                    <button
                      onClick={() => void startFlashcardForDay(view.category, day, view.filter)}
                      className="flex-1 rounded-xl py-1.5 sm:py-2 text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white hover:from-indigo-500/50 hover:to-purple-500/50 active:scale-95 transition border border-indigo-400/30 touch-target"
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

  // ========================================================================
  // 카테고리별 단어장 — SW-KO WordbookTab 의 showCategories 뷰와 동일한 3-section 구조
  // (상황별 / 주제별 / 품사별)
  // ========================================================================
  if (view.kind === 'categories') {
    const situationCats = CATEGORY_INFO.filter((c) => c.group === 'situation')
    const subjectCats = CATEGORY_INFO.filter((c) => c.group === 'subject')
    const posCats = CATEGORY_INFO.filter((c) => c.group === 'pos')
    const situationTotal = situationCats.reduce((s, c) => s + (counts[c.key] ?? 0), 0)
    const subjectTotal = subjectCats.reduce((s, c) => s + (counts[c.key] ?? 0), 0)
    const posTotal = posCats.reduce((s, c) => s + (counts[c.key] ?? 0), 0)

    const handleCategoryClick = (entry: CategoryEntry) => {
      // DB 카테고리(situation) 의 entry.key 가 CatKey 인 경우 — 기존 경로 유지
      if (entry.filter.startsWith('category:')) {
        const cat = entry.filter.slice('category:'.length) as CatKey
        pushView({ kind: 'days', category: cat, title: entry.label[lang] })
      } else {
        // classified: / pos: / ordered: 형식
        pushView({ kind: 'days', category: '', filter: entry.filter, title: entry.label[lang] })
      }
    }

    const renderCategoryGrid = (cats: CategoryEntry[], borderClass: string) => (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {cats.map((c) => {
          const count = counts[c.key] ?? 0
          return (
            <button
              key={c.key}
              onClick={() => handleCategoryClick(c)}
              className={`flex flex-col items-start rounded-2xl p-4 sm:p-5 text-left transition hover:bg-white/8 active:scale-[0.98] app-card backdrop-blur touch-target ${borderClass}`}
            >
              <span className="text-2xl sm:text-3xl">{c.emoji}</span>
              <div className="mt-2 sm:mt-3 text-base sm:text-lg font-extrabold text-white">
                {c.label[lang]}
              </div>
              <div className="mt-1 text-xs sm:text-sm font-semibold text-white/50">
                📚 {count.toLocaleString()} {wordsLabel}
              </div>
            </button>
          )
        })}
      </div>
    )

    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">
              📚 {CATEGORY_GROUP_LABEL[lang]}
            </div>
            <div className="mt-1 text-xs sm:text-sm font-semibold text-white/60">
              {lang === 'sw'
                ? `${CATEGORY_INFO.length} makundi`
                : lang === 'en'
                  ? `${CATEGORY_INFO.length} categories`
                  : `${CATEGORY_INFO.length}개 카테고리`}
            </div>
          </div>
          <Button variant="secondary" onClick={() => window.history.back()}>
            {t('backToList', lang)}
          </Button>
        </div>

        {/* 1) 상황별 */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-lg">🌍</span>
            <span className="text-sm sm:text-base font-bold text-white/80">
              {lang === 'sw' ? 'Kwa Hali' : lang === 'en' ? 'By Situation' : '상황별'}
            </span>
            <span className="text-xs font-semibold text-white/40">
              {situationTotal.toLocaleString()} {wordsLabel}
            </span>
          </div>
          {renderCategoryGrid(situationCats, 'border border-white/15')}
        </div>

        {/* 2) 주제별 */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-lg">🎯</span>
            <span className="text-sm sm:text-base font-bold text-white/80">
              {lang === 'sw' ? 'Kwa Mada' : lang === 'en' ? 'By Topic' : '주제별'}
            </span>
            <span className="text-xs font-semibold text-white/40">
              {subjectTotal.toLocaleString()} {wordsLabel}
            </span>
          </div>
          {renderCategoryGrid(
            subjectCats,
            'border border-amber-400/25 bg-gradient-to-r from-amber-500/8 to-orange-500/8',
          )}
        </div>

        {/* 3) 품사별 */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-lg">🔤</span>
            <span className="text-sm sm:text-base font-bold text-white/80">
              {lang === 'sw' ? 'Kwa Aina' : lang === 'en' ? 'By Part of Speech' : '품사별'}
            </span>
            <span className="text-xs font-semibold text-white/40">
              {posTotal.toLocaleString()} {wordsLabel}
            </span>
          </div>
          {renderCategoryGrid(
            posCats,
            'border border-teal-400/25 bg-gradient-to-r from-teal-500/8 to-cyan-500/8',
          )}
        </div>
      </div>
    )
  }

  // ========================================================================
  // 사전 deck 선택됨
  // ========================================================================
  if (view.kind === 'dictionaryDeck') {
    const deck = safeDecks.find((d) => d.id === view.deckId)
    const itemsInDeck = safeItems.filter((x) => x?.deckId === view.deckId)
    if (!deck) {
      setView({ kind: 'home' })
      return null
    }
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">
              {DICTIONARY_LABEL[lang]}
            </div>
          </div>
          <Button variant="secondary" onClick={() => window.history.back()}>
            {t('backToList', lang)}
          </Button>
        </div>
        <DictionaryDayList
          lang={lang}
          items={itemsInDeck}
          decks={safeDecks}
          deckId={view.deckId}
          showEnglish={showEnglish}
          dispatch={dispatch}
        />
      </div>
    )
  }

  // ========================================================================
  // 사용자 단어장 선택됨
  // ========================================================================
  if (view.kind === 'userDeck') {
    const deck = safeDecks.find((d) => d.id === view.deckId)
    if (!deck) {
      setView({ kind: 'home' })
      return null
    }
    const itemsInDeck = safeItems.filter((x) => x?.deckId === view.deckId)
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">{deck.name}</div>
            <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1.5 sm:gap-2">
              <span className="app-chip">📚 {String(itemsInDeck.length)} {wordsLabel}</span>
            </div>
          </div>
          <Button variant="secondary" onClick={() => window.history.back()}>
            {t('backToList', lang)}
          </Button>
        </div>
        <WordbookScreen
          items={itemsInDeck}
          decks={safeDecks}
          fixedDeckId={view.deckId}
          showEnglish={showEnglish}
          dispatch={dispatch}
          lang={lang}
        />
      </div>
    )
  }

  // ========================================================================
  // 홈: SW-KO 와 동등한 풀 단어장 탭
  // ========================================================================
  const userDecks = safeDecks
    .filter((d) => {
      const name = String(d?.name ?? '')
      return !BUILT_IN_NAMES.has(name)
    })
    .slice()
    .sort((a, b) => {
      const aTime = typeof a?.updatedAt === 'number' ? a.updatedAt : 0
      const bTime = typeof b?.updatedAt === 'number' ? b.updatedAt : 0
      return bTime - aTime
    })

  const totalDeckCountForHeader =
    userDecks.length + 1 /* All Words */ + LEVEL_DECK_NAMES.length

  // EN-KO (영어 사용자가 한국어 학습) 에서 한글 학습 진입 노출
  const showHangeul = nativeLang !== 'ko' && targetLang === 'ko'

  // 로딩 중일 때 SW-KO WordbookTab 과 동일한 풀 로딩 화면 표시 (count = 0 카드 깜빡임 방지).
  // fetch 가 끝나면 (성공/실패 무관) 항상 wordbook 을 보여줘서 영원히 로딩에 갇히지 않게 한다.
  if (isLoadingCounts) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative">
          <div className="text-6xl sm:text-7xl animate-bounce">📚</div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-3 bg-black/20 rounded-full blur-sm animate-pulse" />
        </div>
        <div className="mt-6 text-lg sm:text-xl font-bold text-white">
          {lang === 'sw'
            ? 'Inapakia maneno...'
            : lang === 'en'
              ? 'Loading words...'
              : '단어 로딩 중...'}
        </div>
        <div className="mt-2 text-sm text-white/60">
          {lang === 'sw'
            ? 'Tafadhali subiri'
            : lang === 'en'
              ? 'Please wait a moment'
              : '잠시만 기다려주세요'}
        </div>
        <div className="mt-6 flex gap-1.5">
          <div
            className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 오답노트 위젯 */}
      {wrongCount > 0 && (
        <button
          onClick={goToWrongNote}
          className="w-full rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-rose-500/20 to-orange-500/20 border border-rose-400/30 hover:from-rose-500/30 hover:to-orange-500/30 transition active:scale-[0.99] backdrop-blur touch-target"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="text-3xl sm:text-4xl">📝</span>
              <div className="text-left">
                <div className="text-lg sm:text-xl font-extrabold text-white">
                  {WRONG_NOTE_LABEL[lang]}
                </div>
                <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-rose-300">
                  {String(wrongCount)} {WRONG_NOTE_DESC[lang]}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-xl sm:rounded-2xl bg-rose-500/30 px-3 py-1.5 sm:px-4 sm:py-2 text-xl sm:text-2xl font-extrabold text-rose-300">
                {String(wrongCount)}
              </div>
              <div className="text-xl sm:text-2xl text-rose-400">→</div>
            </div>
          </div>
        </button>
      )}

      <div className="rounded-3xl p-4 sm:p-5 app-banner backdrop-blur">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xl sm:text-2xl font-extrabold text-white truncate">
              {t('wordbookTitle', lang)} ({String(totalDeckCountForHeader)})
            </div>
            <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/70">
              {t('wordbookDesc', lang)}
            </div>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} className="shrink-0">
            {t('newWordbook', lang)}
          </Button>
        </div>

        {/* 단어장 목록 */}
        <div className="mt-4 sm:mt-5 grid gap-2.5 sm:gap-3">
          {/* 사용자 단어장 (정렬: 최근 업데이트 순) */}
          {userDecks.map((d) => {
            const deckId = String(d?.id ?? '')
            const deckName = String(d?.name ?? '')
            const count = safeItems.filter((x) => x?.deckId === deckId).length
            return (
              <button
                key={deckId}
                onClick={() => pushView({ kind: 'userDeck', deckId })}
                className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xl sm:text-2xl font-extrabold text-white truncate">
                    {deckName}
                  </div>
                  <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                    <span className="app-chip">📚 {String(count)} {wordsLabel}</span>
                  </div>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                  ▼
                </div>
              </button>
            )
          })}

          {/* 한글 글자 공부 (영어 사용자가 한국어 학습할 때만) */}
          {showHangeul && (
            <button
              onClick={goToHangeul}
              className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-purple-400/30 bg-gradient-to-r from-purple-500/15 to-fuchsia-500/15 touch-target"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-2xl">🔤</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-white truncate">
                    {HANGEUL_LABEL[lang]}
                  </span>
                </div>
                <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                  <span className="app-chip">{HANGEUL_SUBLABEL[lang]}</span>
                </div>
              </div>
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/20 text-white/80 shrink-0 ml-2">
                ▶
              </div>
            </button>
          )}

          {/* 입문/초급/중급/고급 */}
          {LEVEL_INFO.map((lv) => {
            const count = counts[lv.key] ?? 0
            return (
              <button
                key={lv.key}
                onClick={() => pushView({ kind: 'days', category: lv.key })}
                className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl">{lv.emoji}</span>
                    <span className="text-xl sm:text-2xl font-extrabold text-white truncate">
                      {lv.label[lang]}
                    </span>
                  </div>
                  <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                    <span className="app-chip">📚 {count.toLocaleString()} {wordsLabel}</span>
                  </div>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                  ▼
                </div>
              </button>
            )
          })}

          {/* 카테고리별 단어장 (parent) */}
          <button
            onClick={() => pushView({ kind: 'categories' })}
            className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-indigo-400/25 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 touch-target"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xl sm:text-2xl font-extrabold text-white truncate">
                📚 {CATEGORY_GROUP_LABEL[lang]}
              </div>
              <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                <span className="app-chip">
                  📚{' '}
                  {CATEGORY_DECK_NAMES.reduce((s, n) => s + (counts[n] ?? 0), 0).toLocaleString()}{' '}
                  {wordsLabel}
                </span>
                <span className="app-chip">
                  {CATEGORY_INFO.length}{' '}
                  {lang === 'sw' ? 'makundi' : lang === 'en' ? 'sub-decks' : '개 하위 단어장'}
                </span>
              </div>
            </div>
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/15 text-white/70 shrink-0 ml-2">
              ▼
            </div>
          </button>

          {/* 사전 deck */}
          {dictionaryDeck && (
            <button
              key={dictionaryDeck.id}
              onClick={() => pushView({ kind: 'dictionaryDeck', deckId: dictionaryDeck.id })}
              className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xl sm:text-2xl font-extrabold text-white truncate">
                  {DICTIONARY_LABEL[lang]}
                </div>
                <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                  <span className="app-chip">
                    📚 {String(safeItems.filter((x) => x?.deckId === dictionaryDeck.id).length)}{' '}
                    {wordsLabel}
                  </span>
                </div>
              </div>
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                ▼
              </div>
            </button>
          )}

          {/* 모든 단어 */}
          <button
            onClick={() => pushView({ kind: 'days', category: '' })}
            className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xl sm:text-2xl font-extrabold text-white truncate">
                📖 {ALL_WORDS_LABEL[lang]}
              </div>
              <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                <span className="app-chip">📚 {totalCount.toLocaleString()} {wordsLabel}</span>
              </div>
            </div>
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
              ▼
            </div>
          </button>
        </div>
      </div>

      <Modal
        open={createOpen}
        title={t('newWordbookModal', lang)}
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('cancel', lang)}
            </Button>
            <Button onClick={createDeck}>{t('create', lang)}</Button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-sm font-semibold text-white/80">{t('wordbookName', lang)}</div>
          <Input
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder={t('wordbookNamePlaceholder', lang)}
          />
          <div className="text-xs font-semibold text-white/60">{t('wordbookNameHint', lang)}</div>
        </div>
      </Modal>
    </div>
  )
}
