import { useEffect, useMemo, useState } from 'react'
import type { Action } from '../app/state'
import type { Deck, VocabItem } from '../lib/types'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Input } from '../components/TextField'
import { useToast } from '../components/Toast'
import { t, type Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { getWrongAnswersCount } from './FlashcardScreen'
import { 
  getCacheStatus, 
  saveVocabToCache, 
  isOnline, 
  onOnlineStatusChange,
  type CachedVocab 
} from '../lib/offlineCache'
import { AllWordsDayList } from './AllWordsDayList'
import { WordbookScreen } from './WordbookScreen'

// 클라우드 단어장 레벨
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
  
  // 안전한 데이터 접근
  const safeDecks = Array.isArray(decks) ? decks : []
  const safeItems = Array.isArray(items) ? items : []
  const safeNow = typeof now === 'number' ? now : Date.now()
  
  const [selectedDeckId, setSelectedDeckIdState] = useState<string | null>(null)
  const selectedDeck = safeDecks.find((d) => d?.id === selectedDeckId) ?? null

  // 단어장을 열 때 history 추가
  const openDeck = (deckId: string) => {
    window.history.pushState({ wordbookDeckId: deckId }, '')
    setSelectedDeckIdState(deckId)
  }

  // 단어장을 닫을 때
  const closeDeck = () => {
    setSelectedDeckIdState(null)
  }

  // 뒤로가기 핸들러
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { screen?: string; wordbookDeckId?: string } | null
      
      // screen 속성이 있으면 AllWordsDayList가 처리해야 함 (dayList, wordList, flashcard 등)
      if (state?.screen) return
      
      // wordbookDeckId 상태로 돌아온 경우도 덱 유지
      if (state?.wordbookDeckId) return
      
      // 그 외의 경우 덱 닫기
      setSelectedDeckIdState((current) => current !== null ? null : current)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const isCloudDeck = selectedDeck ? (String(selectedDeck.name ?? '') in CLOUD_DECK_LEVELS) : false

  // 클라우드 단어장 단어 수 가져오기
  const [cloudCounts, setCloudCounts] = useState<Record<string, number>>({})
  const [isLoadingCounts, setIsLoadingCounts] = useState(true)
  
  // 플래시카드 오답노트 개수
  const [flashcardWrongCount, setFlashcardWrongCount] = useState(0)
  
  useEffect(() => {
    setFlashcardWrongCount(getWrongAnswersCount())
  }, [selectedDeckId])
  
  useEffect(() => {
    let isCancelled = false
    
    const fetchCloudCounts = async () => {
      if (!supabase) {
        setIsLoadingCounts(false)
        return
      }
      
      setIsLoadingCounts(true)
      
      // 3초 타임아웃 설정
      const timeoutId = setTimeout(() => {
        if (!isCancelled) {
          setIsLoadingCounts(false)
        }
      }, 3000)
      
      try {
        const mode = lang === 'sw' ? 'sw' : 'ko'
        const counts: Record<string, number> = {}
        
        // 전체 단어 수
        const { count: totalCount } = await supabase
          .from('generated_vocab')
          .select('*', { count: 'exact', head: true })
          .eq('mode', mode)
        
        if (isCancelled) return
        counts['모든 단어'] = totalCount ?? 0
        
        // 레벨별 단어 수
        for (const level of ['입문', '초급', '중급', '고급', '여행', '비즈니스', '쇼핑', '위기탈출']) {
          if (isCancelled) return
          const { count } = await supabase
            .from('generated_vocab')
            .select('*', { count: 'exact', head: true })
            .eq('mode', mode)
            .eq('category', level)
          counts[level] = count ?? 0
        }
        
        if (!isCancelled) {
          clearTimeout(timeoutId)
          setCloudCounts(counts)
          setIsLoadingCounts(false)
        }
      } catch (error) {
        console.error('단어 수 로딩 실패:', error)
        if (!isCancelled) {
          clearTimeout(timeoutId)
          setIsLoadingCounts(false)
        }
      }
    }
    
    void fetchCloudCounts()
    
    return () => {
      isCancelled = true
    }
  }, [lang])

  // 안전한 단어 수 계산 - useMemo 사용
  const itemsInDeck = useMemo(() => {
    if (!selectedDeckId) return []
    const isAllWords = selectedDeck?.name === '모든 단어'
    if (isAllWords) return safeItems
    return safeItems.filter((x) => x?.deckId === selectedDeckId)
  }, [safeItems, selectedDeckId, selectedDeck?.name])

  const [createOpen, setCreateOpen] = useState(false)
  const [deckName, setDeckName] = useState('')

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
  
  const translateDeckName = (name: string | undefined | null): string => {
    if (!name) return '(이름 없음)'
    if (lang === 'sw' && deckNameTranslations[name]) {
      return deckNameTranslations[name]
    }
    if (name === '모든 단어') return t('allWords', lang)
    return name
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
    
    // Wake Lock 획득
    let wakeLock: WakeLockSentinel | null = null
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen')
      }
    } catch (err) {
      console.log('[WakeLock] 획득 실패:', err)
    }
    
    try {
      const modes: Array<'sw' | 'ko'> = ['sw', 'ko']

      for (const mode of modes) {
        if (!navigator.onLine) throw new Error('offline')
        
        const { data, error } = await supabase
          .from('generated_vocab')
          .select('*')
          .eq('mode', mode)
          .order('created_at', { ascending: true })

        if (error) throw error
        if (!navigator.onLine) throw new Error('offline')

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
      if (wakeLock) {
        await wakeLock.release()
      }
    }
  }

  // 서버 전체 단어 수 계산
  const serverTotalCount = useMemo(() => {
    const swTotal = cloudCounts['모든 단어'] ?? 0
    return swTotal * 2
  }, [cloudCounts])

  // 캐시가 불완전한지 확인
  const isCacheIncomplete = useMemo(() => {
    if (!cacheStatus) return true
    if (cacheStatus.totalCount === 0) return true
    if (serverTotalCount > 0 && cacheStatus.totalCount < serverTotalCount) return true
    return false
  }, [cacheStatus, serverTotalCount])

  // 로딩 중일 때 로딩 화면 표시
  const hasCloudData = Object.keys(cloudCounts).length > 0
  const shouldShowLoading = isLoadingCounts || (online && !hasCloudData)

  // 오답노트로 이동
  const goToWrongNote = () => {
    dispatch({ type: 'settings', patch: { bottomTab: 'wrong' } })
  }

  // 단어장 선택됨
  if (selectedDeck && selectedDeckId) {
    const levelFilter = CLOUD_DECK_LEVELS[selectedDeck.name ?? ''] ?? ''
    const mode = lang === 'sw' ? 'sw' : 'ko'
    
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between rounded-3xl p-4 sm:p-5 app-card backdrop-blur">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white">{translateDeckName(selectedDeck.name)}</div>
            {!isCloudDeck && (
              <div className="mt-1.5 sm:mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                <span className="app-chip">📚 {String(itemsInDeck.length)} {wordsLabel}</span>
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
            mode={mode}
            showEnglish={showEnglish}
            levelFilter={levelFilter}
            title={translateDeckName(selectedDeck.name)}
            userItems={safeItems}
          />
        ) : (
          <WordbookScreen
            items={itemsInDeck}
            decks={safeDecks}
            fixedDeckId={selectedDeckId}
            showEnglish={showEnglish}
            dispatch={dispatch}
            lang={lang}
          />
        )}
      </div>
    )
  }

  if (shouldShowLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative">
          <div className="text-6xl sm:text-7xl animate-bounce">📚</div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-3 bg-black/20 rounded-full blur-sm animate-pulse" />
        </div>
        <div className="mt-6 text-lg sm:text-xl font-bold text-white">
          {lang === 'sw' ? 'Inapakia maneno...' : '단어 로딩 중...'}
        </div>
        <div className="mt-2 text-sm text-white/60">
          {lang === 'sw' ? 'Tafadhali subiri' : '잠시만 기다려주세요'}
        </div>
        <div className="mt-6 flex gap-1.5">
          <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
          <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 오프라인 다운로드 위젯 */}
      {online && isCacheIncomplete && (
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
                  {cacheStatus && cacheStatus.totalCount > 0
                    ? (lang === 'sw' ? 'Sasisha Pakua' : '오프라인 업데이트')
                    : (lang === 'sw' ? 'Pakua kwa Nje ya Mtandao' : '오프라인 다운로드')
                  }
                </div>
                <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-cyan-300">
                  {downloading 
                    ? (lang === 'sw' ? 'Inapakua...' : '다운로드 중...')
                    : (lang === 'sw' ? 'Jifunze bila mtandao' : '인터넷 없이 학습하기')
                  }
                </div>
              </div>
            </div>
            <div className="rounded-xl sm:rounded-2xl bg-cyan-500/30 px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base font-extrabold text-cyan-300">
              {downloading ? '⏳' : '→'}
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
                {String(cacheStatus.totalCount)} {lang === 'sw' ? 'maneno yamehifadhiwa' : '개 단어 저장됨'}
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
                  {String(flashcardWrongCount)} {lang === 'sw' ? 'maneno ya kurudia' : '개 단어 복습 필요'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="rounded-xl sm:rounded-2xl bg-rose-500/30 px-3 py-1.5 sm:px-4 sm:py-2 text-xl sm:text-2xl font-extrabold text-rose-300">
                {String(flashcardWrongCount)}
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
            <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{t('wordbookTitle', lang)} ({String(safeDecks.length)})</div>
            <div className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white/70">{t('wordbookDesc', lang)}</div>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} className="shrink-0">
            {t('newWordbook', lang)}
          </Button>
        </div>

        {/* 단어장 목록 */}
        <div className="mt-4 sm:mt-5 grid gap-2.5 sm:gap-3">
          {safeDecks
            .slice()
            .sort((a, b) => {
              const aName = String(a?.name ?? '')
              const bName = String(b?.name ?? '')
              if (aName === '모든 단어') return 1
              if (bName === '모든 단어') return -1
              const aTime = typeof a?.updatedAt === 'number' ? a.updatedAt : 0
              const bTime = typeof b?.updatedAt === 'number' ? b.updatedAt : 0
              return bTime - aTime
            })
            .map((d) => {
              const deckId = String(d?.id ?? '')
              const deckName = String(d?.name ?? '')
              const isCloud = deckName in CLOUD_DECK_LEVELS
              
              const cloudCount = cloudCounts[deckName] ?? 0
              const count = isCloud 
                ? (deckName === '모든 단어' ? cloudCount + safeItems.length : cloudCount)
                : safeItems.filter((x) => x?.deckId === deckId).length
              
              return (
                <button
                  key={deckId}
                  onClick={() => openDeck(deckId)}
                  className="flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-left transition hover:bg-white/8 active:scale-[0.99] app-card backdrop-blur border border-white/15 touch-target"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xl sm:text-2xl font-extrabold text-white truncate">{translateDeckName(deckName)}</div>
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
