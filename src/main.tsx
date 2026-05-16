import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSecurity, maskSensitivePatterns } from './lib/security'
import { clearKeyCache } from './lib/crypto'

// 보안 부트스트랩 (콘솔 잠금, 민감 패턴 마스킹, F12 차단 등)
initSecurity()

// 일회성 캐시 정리: PWA Service Worker / Cache Storage / 옛 TTS localStorage 키 제거
// 버전을 올리고 싶으면 PURGE_VERSION 값을 변경하면 모든 클라이언트에서 다시 1회 실행됨
const PURGE_VERSION = 'v2026-05-16-oxford-overrides-full-sync'
;(async () => {
  try {
    if (import.meta.env.DEV && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      if (regs.length > 0) {
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
        }
        location.reload()
        return
      }
    }

    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem('app:purge') === PURGE_VERSION) return

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
    }
    try {
      const toRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('tts-cache:')) toRemove.push(k)
      }
      toRemove.forEach((k) => localStorage.removeItem(k))
    } catch {
      /* ignore */
    }

    localStorage.setItem('app:purge', PURGE_VERSION)
  } catch {
    /* ignore */
  }
})()

// 페이지 종료 시 메모리에서 암호화 키 폐기
window.addEventListener('app:lockdown', () => {
  try {
    clearKeyCache()
  } catch {
    /* ignore */
  }
})

// 전역 에러 핸들러 (민감한 정보 노출 방지)
window.onerror = (message) => {
  if (import.meta.env.PROD) {
    const safe = typeof message === 'string' ? maskSensitivePatterns(message) : '앱 오류'
    console.error('[app] ' + safe)
    return true
  }
  return false
}

// 처리되지 않은 Promise 거부 핸들러
window.onunhandledrejection = (event) => {
  if (import.meta.env.PROD) {
    const reason = event?.reason
    const text =
      typeof reason === 'string'
        ? maskSensitivePatterns(reason)
        : reason instanceof Error
          ? maskSensitivePatterns(reason.message)
          : '비동기 오류'
    console.error('[app] ' + text)
    event.preventDefault()
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
