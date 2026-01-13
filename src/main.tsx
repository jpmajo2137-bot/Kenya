import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { secureConsole } from './lib/security'

// 보안 초기화
secureConsole()

// 전역 에러 핸들러 (민감한 정보 노출 방지)
window.onerror = () => {
  // 프로덕션에서는 상세 오류 정보 숨김
  if (import.meta.env.PROD) {
    console.error('앱 오류가 발생했습니다.')
    return true // 기본 오류 처리 방지
  }
  return false
}

// 처리되지 않은 Promise 거부 핸들러
window.onunhandledrejection = (event) => {
  if (import.meta.env.PROD) {
    console.error('비동기 오류가 발생했습니다.')
    event.preventDefault()
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
