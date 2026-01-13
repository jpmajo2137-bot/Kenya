import { useEffect, useMemo, useState } from 'react'
import type { Action } from '../app/state'
import type { Deck, VocabItem } from '../lib/types'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Input } from '../components/TextField'
import { useToast } from '../components/Toast'
import { WordbookScreen } from './WordbookScreen'
import { t, type Lang } from '../lib/i18n'
// import { CloudAllWordsScreen } from './CloudAllWordsScreen' // AllWordsDayList에서 사용됨
import { AllWordsDayList } from './AllWordsDayList'
import { supabase } from '../lib/supabase'
import { getWrongAnswersCount } from './FlashcardScreen'
import { 
  getCacheStatus, 
  saveVocabToCache, 
  isOnline, 
  onOnlineStatusChange,
  type CachedVocab 
} from '../lib/offlineCache'

export function WordbookTab({
  decks,
  items,
  now,
  showEnglish,
  dispatch,
  lang,
}: {
  decks: Deck[]
  items: VocabItem[]
  now: number
  showEnglish: boolean
  dispatch: (a: Action) => void
  lang: Lang
}) {
  const { toast } = useToast()
  const [selectedDeckId, setSelectedDeckIdState] = useState<string | null>(null)
  const selectedDeck = decks.find((d) => d.id === selectedDeckId) ?? null

  // 단어장을 열 때 history 추가
  const openDeck = (deckId: string) => {
    window.history.pushState({ wordbookDeckId: deckId }, '')
    setSelectedDeckIdState(deckId)
  }

  // 단어장을 닫을 때 (뒤로가기용)
  const closeDeck = () => {
    setSelectedDeckIdState(null)
  }

  // 뒤로가기 핸들러
  useEffect(() => {
    const handlePopState = () => {
      setSelectedDeckIdState((current) => {
        if (current !== null) {
          return null
        }
        return current
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // 클라우드 단어장 (레벨별 필터링)
  const CLOUD_DECK_LEVELS: Record<string, string> = {
    '모든 단어': '',
    '입문': '입문',
    '초급': '초급',
    '중급': '중급',
    '고급': '고급',
    '여행': '여행',
    '비즈니스': '비즈니스',
    '쇼핑': '쇼핑',
    '위기탈출': '위기탈출',
  }
  const isCloudDeck = selectedDeck ? selectedDeck.name in CLOUD_DECK_LEVELS : false
  const cloudLevel = selectedDeck ? CLOUD_DECK_LEVELS[selectedDeck.name] : ''
  
  // "모든 단어" 단어장인지 확인 (하위 호환)
  const isAllWordsDeck = selectedDeck?.name === '모든 단어'

  // 클라우드 단어장 단어 수 가져오기
  const [cloudCounts, setCloudCounts] = useState<Record<string, number>>({})
  
  // 플래시카드 오답노트 개수
  const [flashcardWrongCount, setFlashcardWrongCount] = useState(0)
  
  useEffect(() => {
    setFlashcardWrongCount(getWrongAnswersCount())
  }, [selectedDeckId])
  
  useEffect(() => {
    const fetchCloudCounts = async () => {
      if (!supabase) return
      
      const mode = lang === 'sw' ? 'sw' : 'ko'
      const counts: Record<string, number> = {}
      
      // 전체 단어 수
      const { count: totalCount } = await supabase
        .from('generated_vocab')
        .select('*', { count: 'exact', head: true })
        .eq('mode', mode)
      counts['모든 단어'] = totalCount ?? 0
      
      // 레벨별 단어 수
      for (const level of ['입문', '초급', '중급', '고급', '여행', '비즈니스', '쇼핑', '위기탈출']) {
        const { count } = await supabase
          .from('generated_vocab')
          .select('*', { count: 'exact', head: true })
          .eq('mode', mode)
          .eq('category', level)
        counts[level] = count ?? 0
      }
      
      setCloudCounts(counts)
    }
    
    void fetchCloudCounts()
  }, [lang])

  const itemsInDeck = useMemo(() => {
    if (!selectedDeckId) return []
    // "모든 단어" 단어장이면 전체 단어 표시
    if (isAllWordsDeck) return items
    return items.filter((x) => x.deckId === selectedDeckId)
  }, [items, selectedDeckId, isAllWordsDeck])

  const dueInDeck = useMemo(() => {
    if (!selectedDeckId) return 0
    // "모든 단어" 단어장이면 전체 복습 대상 표시
    if (isAllWordsDeck) return items.filter((x) => x.srs.dueAt <= now).length
    return items.filter((x) => x.deckId === selectedDeckId && x.srs.dueAt <= now).length
  }, [items, selectedDeckId, now, isAllWordsDeck])

  const [createOpen, setCreateOpen] = useState(false)
  const [deckName, setDeckName] = useState('')

  // openDeck을 직접 사용하도록 변경됨
  // const handleOpenDeck = (id: string) => {
  //   openDeck(id)
  // }

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

  const wordsLabel = lang === 'sw' ? 'maneno' : '개 단어'
  const reviewLabel = lang === 'sw' ? 'Mapitio' : '복습'

  // 기본 단어장 이름 번역 (스와힐리어)
  const deckNameTranslations: Record<string, string> = {
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
  
  const translateDeckName = (name: string) => {
    if (lang === 'sw' && deckNameTranslations[name]) {
      return deckNameTranslations[name]
    }
    if (name === '모든 단어') return t('allWords', lang)
    return name
  }

  if (selectedDeck && selectedDeckId) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">{translateDeckName(selectedDeck.name)}</div>
            {!isCloudDeck && (
              <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                <span className="app-chip">📚 {itemsInDeck.length} {wordsLabel}</span>
                <span className="app-chip">⏰ {reviewLabel} {dueInDeck}</span>
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={() => closeDeck()}>
            {t('backToList', lang)}
          </Button>
        </div>

        {isCloudDeck ? (
          <AllWordsDayList
            lang={lang}
            mode={lang === 'sw' ? 'sw' : 'ko'}
            showEnglish={showEnglish}
            levelFilter={cloudLevel}
            title={translateDeckName(selectedDeck.name)}
          />
        ) : (
          <WordbookScreen
            items={itemsInDeck}
            decks={decks}
            fixedDeckId={selectedDeckId}
            showEnglish={showEnglish}
            dispatch={dispatch}
            lang={lang}
          />
        )}
      </div>
    )
  }

  // 오답노트로 이동
  const goToWrongNote = () => {
    dispatch({ type: 'settings', patch: { bottomTab: 'wrong' } })
  }

  // 오프라인 다운로드 상태
  const [online, setOnline] = useState(isOnline())
  const [cacheStatus, setCacheStatus] = useState<{
    totalCount: number
    swCount: number
    koCount: number
    lastUpdated: number | null
  } | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    getCacheStatus().then(setCacheStatus).catch(console.error)
    const unsubscribe = onOnlineStatusChange(setOnline)
    return unsubscribe
  }, [])

  const handleDownload = async () => {
    if (!supabase || !online) return

    setDownloading(true)
    try {
      const modes: Array<'sw' | 'ko'> = ['sw', 'ko']

      for (const mode of modes) {
        const { data, error } = await supabase
          .from('generated_vocab')
          .select('*')
          .eq('mode', mode)
          .order('created_at', { ascending: true })

        if (error) throw error

        const cleanedData = (data ?? []).filter(
          (r: CachedVocab) => !r.word?.startsWith('__deleted__')
        ) as CachedVocab[]

        await saveVocabToCache(mode, null, cleanedData)
      }

      const newStatus = await getCacheStatus()
      setCacheStatus(newStatus)

      toast({
        title: lang === 'sw' ? 'Imefanikiwa!' : '완료!',
        description: lang === 'sw' 
          ? `Maneno ${newStatus.totalCount} yamehifadhiwa` 
          : `${newStatus.totalCount}개 단어가 저장되었습니다`,
      })
    } catch (error) {
      console.error('다운로드 실패:', error)
      toast({
        title: lang === 'sw' ? 'Hitilafu' : '오류',
        description: lang === 'sw' ? 'Imeshindwa kupakua' : '다운로드에 실패했습니다',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 오프라인 다운로드 위젯 */}
      {online && (!cacheStatus || cacheStatus.totalCount === 0) && (
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 hover:from-cyan-500/30 hover:to-blue-500/30 transition active:scale-[0.99] backdrop-blur touch-target disabled:opacity-50"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="text-3xl sm:text-4xl">📥</span>
              <div className="text-left">
                <div className="text-lg sm:text-xl font-extrabold text-white">
                  {lang === 'sw' ? 'Pakua kwa Nje ya Mtandao' : '오프라인 다운로드'}
                </div>
                <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-cyan-300">
                  {downloading 
                    ? (lang === 'sw' ? 'Inapakua...' : '다운로드 중...')
                    : (lang === 'sw' ? 'Jifunze bila mtandao' : '인터넷 없이 학습하기')
                  }
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-xl sm:rounded-2xl bg-cyan-500/30 px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base font-extrabold text-cyan-300">
                {downloading ? '⏳' : '→'}
              </div>
            </div>
          </div>
        </button>
      )}

      {/* 오프라인 준비 완료 표시 */}
      {cacheStatus && cacheStatus.totalCount > 0 && (
        <div className="rounded-3xl p-3 sm:p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-400/20 backdrop-blur">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xl sm:text-2xl">✅</span>
            <div className="flex-1">
              <div className="text-sm sm:text-base font-bold text-green-300">
                {lang === 'sw' ? 'Nje ya Mtandao Tayari' : '오프라인 준비 완료'}
              </div>
              <div className="text-xs text-green-400/70">
                {cacheStatus.totalCount.toLocaleString()} {lang === 'sw' ? 'maneno yamehifadhiwa' : '개 단어 저장됨'}
              </div>
            </div>
            {!online && (
              <div className="px-2 py-1 rounded-lg bg-orange-500/20 text-xs font-bold text-orange-300">
                {lang === 'sw' ? 'Nje ya Mtandao' : '오프라인'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 오답노트 위젯 */}
      {flashcardWrongCount > 0 && (
        <button
          onClick={goToWrongNote}
          className="w-full rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-rose-500/20 to-orange-500/20 border border-rose-400/30 hover:from-rose-500/30 hover:to-orange-500/30 transition active:scale-[0.99] backdrop-blur touch-target"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="text-3xl sm:text-4xl">📝</span>
              <div className="text-left">
                <div className="text-lg sm:text-xl font-extrabold text-white">
                  {lang === 'sw' ? 'Orodha ya Makosa' : '오답노트'}
                </div>
                <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-rose-300">
                  {flashcardWrongCount} {lang === 'sw' ? 'maneno ya kurudia' : '개 단어 복습 필요'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-xl sm:rounded-2xl bg-rose-500/30 px-3 py-1.5 sm:px-4 sm:py-2 text-xl sm:text-2xl font-extrabold text-rose-300">
                {flashcardWrongCount}
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
            <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{t('wordbookTitle', lang)} ({decks.length})</div>
            <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/70">{t('wordbookDesc', lang)}</div>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} className="shrink-0">
            {t('newWordbook', lang)}
          </Button>
        </div>

        {/* 단어장 목록 (배너 안쪽) */}
        <div className="mt-4 sm:mt-5 grid gap-2.5 sm:gap-3">
          {decks
            .slice()
            .sort((a, b) => {
              // "모든 단어"는 맨 아래로
              if (a.name === '모든 단어') return 1
              if (b.name === '모든 단어') return -1
              return b.updatedAt - a.updatedAt
            })
            .map((d) => {
              const isCloud = d.name in CLOUD_DECK_LEVELS
              const count = isCloud 
                ? (cloudCounts[d.name] ?? 0)
                : items.filter((x) => x.deckId === d.id).length
              const due = isCloud
                ? 0 // 클라우드 단어장은 복습 기능 없음
                : items.filter((x) => x.deckId === d.id && x.srs.dueAt <= now).length
              return (
                <button
                  key={d.id}
                  onClick={() => openDeck(d.id)}
                  className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{translateDeckName(d.name)}</div>
                    <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                      <span className="app-chip">📚 {count.toLocaleString()} {wordsLabel}</span>
                      {!isCloud && <span className="app-chip">⏰ {reviewLabel} {due}</span>}
                    </div>
                  </div>
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white/70 shrink-0 ml-2">
                    ▼
                  </div>
                </button>
              )
            })}
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
          <Input value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder={t('wordbookNamePlaceholder', lang)} />
          <div className="text-xs font-semibold text-white/60">{t('wordbookNameHint', lang)}</div>
        </div>
      </Modal>
    </div>
  )
}


