import type { ReactNode } from 'react'
import { Component, useEffect, useReducer, useRef, useState } from 'react'
import { ToastProvider } from './components/Toast'
import { cn } from './components/cn'
import { loadState, loadStateAsync, saveState } from './lib/storage'
import type { AppStateV2 } from './lib/types'
import { createSeedState, reducer } from './app/state'
import { t, type Lang } from './lib/i18n'
import { SettingsScreen } from './screens/SettingsScreen'
import { WordbookTab } from './screens/WordbookTab'
import { QuizScreen } from './screens/QuizScreen'
import { WrongNoteScreen } from './screens/WrongNoteScreen'
import { DictionaryScreen } from './screens/DictionaryScreen'
import { isFirstRun, markFirstRunDone, detectInitialLang } from './lib/detectLang'
import { startAdMobService, stopAdTimer } from './lib/admob'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { checkForUpdate, type UpdateInfo } from './lib/appUpdate'
import { UpdateModal } from './components/UpdateModal'

type TopTab = AppStateV2['settings']['topTab']
type BottomTab = AppStateV2['settings']['bottomTab']

// ErrorBoundary for catching React errors
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: string | null
  componentStack: string | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, componentStack: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, errorInfo: error.stack ?? null }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    this.setState({ componentStack: errorInfo.componentStack })
    console.error('[ErrorBoundary]', error.message, errorInfo.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#7f1d1d', padding: 16, color: 'white', overflow: 'auto' }}>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>⚠️ 앱 오류 발생</h1>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <p style={{ fontWeight: 'bold', color: '#fca5a5', fontSize: 12 }}>오류 메시지:</p>
            <p style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>{this.state.error?.message}</p>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <p style={{ fontWeight: 'bold', color: '#fca5a5', fontSize: 12 }}>컴포넌트 스택:</p>
            <pre style={{ fontSize: 9, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 150, overflow: 'auto' }}>{this.state.componentStack}</pre>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12, maxHeight: 150, overflow: 'auto' }}>
            <p style={{ fontWeight: 'bold', color: '#fca5a5', fontSize: 12 }}>스택 트레이스:</p>
            <pre style={{ fontSize: 9, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{this.state.errorInfo}</pre>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: 12, padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: 14 }}
          >
            앱 새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
// #endregion

function useInitialState(): AppStateV2 {
  const loaded = loadState()
  return loaded ?? createSeedState()
}

function PillButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'h-12 sm:h-11 rounded-2xl px-3 sm:px-4 text-sm sm:text-sm font-bold tracking-tight transition active:scale-95 touch-target',
        active
          ? 'bg-[rgb(var(--purple))] text-white ring-2 ring-white/30'
          : 'bg-[rgb(90,105,140)] text-white hover:bg-[rgb(110,125,160)] ring-1 ring-white/25',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function LangButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'h-10 w-12 sm:h-11 sm:w-14 rounded-2xl text-xs sm:text-sm font-extrabold tracking-tight transition active:scale-95 ring-1 touch-target',
        active
          ? 'bg-[rgb(var(--purple))] text-white ring-white/30'
          : 'bg-[rgb(70,85,115)] text-white hover:bg-[rgb(90,105,135)] ring-white/20',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex h-12 sm:h-14 flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-2xl px-2 sm:px-4 text-xs sm:text-sm font-extrabold transition active:scale-95 ring-1 touch-target',
        active
          ? 'bg-[rgb(var(--purple))] text-white ring-white/30'
          : 'bg-[rgb(80,95,130)] text-white hover:bg-[rgb(100,115,150)] ring-white/20',
      )}
      onClick={onClick}
    >
      <span className="text-sm sm:text-base">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function AppInner() {
  const [state, dispatch] = useReducer(reducer, undefined, useInitialState)
  const [hydrated, setHydrated] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [langDetected, setLangDetected] = useState(!isFirstRun())
  const restoring = useRef(false)
  
  // 앱 업데이트 상태
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  // 암호화된 상태 비동기 로드 (초기 저장 덮어쓰기 방지)
  useEffect(() => {
    let cancelled = false
    loadStateAsync()
      .then((loaded) => {
        if (cancelled) return
        if (loaded) {
          dispatch({ type: 'hydrate', state: loaded })
        }
        // 앱 시작 시 항상 홈 화면으로
        dispatch({ type: 'settings', patch: { topTab: 'home', bottomTab: 'wordbook' } })
        setHydrated(true)
      })
      .catch(() => {
        if (!cancelled) {
          // 앱 시작 시 항상 홈 화면으로
          dispatch({ type: 'settings', patch: { topTab: 'home', bottomTab: 'wordbook' } })
          setHydrated(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  
  // 첫 실행 시 언어 자동 감지
  useEffect(() => {
    if (!isFirstRun()) {
      setLangDetected(true)
      return
    }

    // 최대 2초 내에 언어 감지 완료 (Edge 등에서 빠르게 로드되도록)
    const timeoutId = setTimeout(() => {
      console.log('[Lang] 타임아웃 - 기본값 사용')
      markFirstRunDone()
      setLangDetected(true)
    }, 2000)

    detectInitialLang().then((detectedLang) => {
      clearTimeout(timeoutId)
      console.log('[Lang] 감지 완료:', detectedLang)
      dispatch({ type: 'settings', patch: { meaningLang: detectedLang } })
      markFirstRunDone()
      setLangDetected(true)
    }).catch((err) => {
      clearTimeout(timeoutId)
      console.log('[Lang] 감지 실패:', err)
      // 감지 실패 시 기본값(sw) 유지
      markFirstRunDone()
      setLangDetected(true)
    })

    return () => clearTimeout(timeoutId)
  }, [])

  // AdMob 전면 광고 초기화 (처음에는 안 보여주고, 30분 후부터 매 30분마다)
  useEffect(() => {
    startAdMobService().catch((err) => {
      console.log('[AdMob] 서비스 시작 실패 (웹에서는 정상):', err)
    })
    return () => {
      stopAdTimer()
    }
  }, [])

  // 앱 업데이트 확인 (hydrated 후 실행)
  useEffect(() => {
    if (!hydrated) return
    
    // 약간의 지연 후 업데이트 확인 (앱 로딩 완료 후)
    const timeoutId = setTimeout(() => {
      checkForUpdate().then((info) => {
        if (info && info.updateAvailable) {
          console.log('[AppUpdate] 업데이트 가능:', info)
          setUpdateInfo(info)
          setShowUpdateModal(true)
        }
      }).catch((err) => {
        console.log('[AppUpdate] 확인 실패:', err)
      })
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [hydrated])

  // Android 하드웨어 뒤로가기 버튼 처리 (네이티브 앱에서만)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const handleBackButton = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        CapApp.exitApp()
      }
    })

    return () => {
      handleBackButton.then(listener => listener.remove())
    }
  }, [])
  
  // 뒤로가기 시 - history.back()만 호출
  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back()
    }
  }

  useEffect(() => {
    if (!hydrated) return
    saveState(state)
  }, [state, hydrated])

  const topTab: TopTab = state.settings.topTab
  const bottomTab: BottomTab = state.settings.bottomTab

  const setTop = (t: TopTab) => dispatch({ type: 'settings', patch: { topTab: t } })
  const setBottom = (t: BottomTab) => {
    setResetKey((k) => k + 1)
    dispatch({ type: 'settings', patch: { bottomTab: t, topTab: 'home' } })
  }
  const goHomeTab = () => {
    setResetKey((k) => k + 1)
    dispatch({ type: 'settings', patch: { topTab: 'home', bottomTab: 'wordbook' } })
  }

  const setMeaningLang = (lang: 'sw' | 'ko') => {
    setResetKey((k) => k + 1)
    dispatch({ type: 'settings', patch: { meaningLang: lang, topTab: 'home', bottomTab: 'wordbook' } })
  }

  const lang: Lang = state.settings.meaningLang

  // Back navigation handling: push history on tab change, popstate restores previous tab.
  useEffect(() => {
    window.history.replaceState({ topTab, bottomTab, type: 'tab' }, '')
    const onPopState = (e: PopStateEvent) => {
      const st = e.state as { topTab?: TopTab; bottomTab?: BottomTab; type?: string; screen?: string; wrongNote?: string } | null
      // screen/wrongNote state는 하위 컴포넌트가 처리
      if (st?.screen || st?.wrongNote) return
      // tab state만 처리
      if (st && st.topTab && st.bottomTab) {
        restoring.current = true
        dispatch({ type: 'settings', patch: { topTab: st.topTab, bottomTab: st.bottomTab } })
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (restoring.current) {
      restoring.current = false
      return
    }
    window.history.pushState({ topTab, bottomTab, type: 'tab' }, '')
  }, [topTab, bottomTab])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📦</div>
          <div className="text-white/70 text-lg font-semibold">
            {state.settings.meaningLang === 'sw' ? 'Inapakia data...' : '데이터 불러오는 중...'}
          </div>
        </div>
      </div>
    )
  }

  // 첫 실행 시 언어 감지 중이면 로딩 화면 표시
  if (!langDetected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🌍</div>
          <div className="text-white/70 text-lg font-semibold">Detecting language...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] pb-40 sm:pb-32">
      <div className="mx-auto w-full max-w-md px-3 sm:px-4 pt-6 sm:pt-10">
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <button
              type="button"
              onClick={goBack}
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-white/20 text-white transition active:scale-95 hover:bg-white/30 border border-white/30 shadow-md shadow-black/30 touch-target"
              aria-label="뒤로 가기"
            >
              <span className="text-xl sm:text-2xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">←</span>
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <img 
                src="/logo.png" 
                alt="Jifunze Kikorea kwa Kiswahili" 
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl object-cover"
              />
              <div className="app-title text-xl sm:text-2xl leading-tight">
                Jifunze Kikorea kwa Kiswahili
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 rounded-2xl bg-white/0 p-0.5 sm:p-1">
            <LangButton active={state.settings.meaningLang === 'sw'} onClick={() => setMeaningLang('sw')}>
              {lang === 'sw' ? 'KSW' : 'SW'}
            </LangButton>
            <LangButton active={state.settings.meaningLang === 'ko'} onClick={() => setMeaningLang('ko')}>
              {lang === 'sw' ? 'KKO' : 'KO'}
            </LangButton>
          </div>
        </div>

        <div className="mt-4 sm:mt-6 flex gap-1.5 sm:gap-2 rounded-3xl p-1.5 sm:p-2 app-banner backdrop-blur">
          <NavButton active={topTab === 'home'} icon="🏠" label={t('home', lang)} onClick={goHomeTab} />
          <NavButton active={topTab === 'settings'} icon="⚙️" label={t('settings', lang)} onClick={() => setTop('settings')} />
        </div>

        <div className="mt-6">
          {topTab === 'settings' ? <SettingsScreen state={state} dispatch={dispatch} lang={lang} /> : null}
          {topTab === 'home' ? (
            <>
              {bottomTab === 'wordbook' ? (
                <WordbookTab
                  key={`wordbook-${resetKey}`}
                  decks={state.decks}
                  items={state.items}
                  showEnglish={state.settings.showEnglish}
                  dispatch={dispatch}
                  lang={lang}
                  meaningLang={state.settings.meaningLang}
                />
              ) : null}
              {bottomTab === 'quiz' ? (
                <QuizScreen
                  key={`quiz-${resetKey}`}
                  decks={state.decks}
                  items={state.items}
                  wrong={state.wrong}
                  now={state.now}
                  dueOnly={state.settings.dueOnly}
                  meaningLang={state.settings.meaningLang}
                  quizCount={state.settings.quizCount}
                  quizSource={state.settings.quizSource}
                  dispatch={dispatch}
                  lang={lang}
                />
              ) : null}
              {bottomTab === 'wrong' ? (
                <WrongNoteScreen key={`wrong-${resetKey}`} decks={state.decks} items={state.items} wrong={state.wrong} dispatch={dispatch} lang={lang} meaningLang={state.settings.meaningLang} />
              ) : null}
              {bottomTab === 'dictionary' ? (
                <DictionaryScreen key={`dict-${resetKey}`} lang={lang} decks={state.decks} dispatch={dispatch} />
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bottom-nav-container">
        <div className="mx-auto max-w-md px-3 sm:px-4 pb-6 sm:pb-5">
          <div className="grid grid-cols-4 gap-1 sm:gap-1.5 rounded-3xl p-1.5 sm:p-2 app-banner backdrop-blur">
            <PillButton active={bottomTab === 'wordbook'} onClick={() => setBottom('wordbook')}>
              {t('wordbook', lang)}
            </PillButton>
            <PillButton active={bottomTab === 'dictionary'} onClick={() => setBottom('dictionary')}>
              {t('dictionary', lang)}
            </PillButton>
            <PillButton active={bottomTab === 'quiz'} onClick={() => setBottom('quiz')}>
              {t('quiz', lang)}
            </PillButton>
            <PillButton active={bottomTab === 'wrong'} onClick={() => setBottom('wrong')}>
              {t('wrongNote', lang)}
            </PillButton>
          </div>
        </div>
      </div>

      {/* 앱 업데이트 팝업 */}
      <UpdateModal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        updateInfo={updateInfo}
        lang={lang}
      />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </ErrorBoundary>
  )
}
