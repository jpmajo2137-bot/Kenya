import type { NativeLang, TargetLang } from './types'

const EAST_AFRICA_COUNTRIES = ['KE', 'UG', 'RW', 'TZ'] // 케냐, 우간다, 르완다, 탄자니아

/** 첫 실행 시 자동 선택될 사용자 버전 (모국어 → 학습언어) */
export type InitialLangPair = {
  nativeLang: NativeLang
  targetLang: TargetLang
}

// 기본값: 스와힐리어/한국어 사용자가 아닌 경우 영어-한국어 버전
export const DEFAULT_INITIAL_LANG_PAIR: InitialLangPair = {
  nativeLang: 'en',
  targetLang: 'ko',
}

// 첫 실행 여부 확인 키
const FIRST_RUN_KEY = 'kenya-vocab.firstRun'

// 이미 첫 실행 처리를 했는지 확인
export function isFirstRun(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) !== 'done'
  } catch {
    return true
  }
}

// 첫 실행 처리 완료 표시
export function markFirstRunDone(): void {
  try {
    localStorage.setItem(FIRST_RUN_KEY, 'done')
  } catch {
    // ignore
  }
}

// 기기 언어 확인
function getDeviceLanguage(): string {
  try {
    const lang = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage || ''
    return lang.toLowerCase()
  } catch {
    return ''
  }
}

// 기기 언어가 한국어인지 확인
export function isKoreanDevice(): boolean {
  const lang = getDeviceLanguage()
  return lang.startsWith('ko')
}

// 기기 언어가 스와힐리어인지 확인
export function isSwahiliDevice(): boolean {
  const lang = getDeviceLanguage()
  return lang.startsWith('sw')
}

// IP 기반 국가 코드 가져오기 (무료 API 사용)
export async function getCountryCode(): Promise<string | null> {
  try {
    // ipapi.co 사용 (HTTPS, CORS 지원) - 1초 타임아웃
    const response = await fetch('https://ipapi.co/country/', {
      signal: AbortSignal.timeout(1000),
    })
    if (!response.ok) return null
    const countryCode = await response.text()
    return countryCode?.trim() || null
  } catch {
    // 실패해도 null 반환 (빠른 폴백)
    return null
  }
}

// 동아프리카 국가인지 확인
export function isEastAfricaCountry(countryCode: string | null): boolean {
  if (!countryCode) return false
  return EAST_AFRICA_COUNTRIES.includes(countryCode.toUpperCase())
}

// 기기 언어가 영어인지 확인
export function isEnglishDevice(): boolean {
  const lang = getDeviceLanguage()
  return lang.startsWith('en')
}

// 초기 사용자 버전 감지 (비동기)
//
// 기기 언어에 따라 첫 실행 시 적절한 언어 쌍을 자동 선택한다.
//   한국어 기기 → ko-en (한국어 → 영어)
//   스와힐리어 기기 → sw-ko (스와힐리 → 한국어)
//   그 외 (영어 포함) → en-ko (영어 → 한국어)
// 이후 실행부터는 localStorage에 저장된 마지막 설정이 복원된다.
export async function detectInitialLang(): Promise<InitialLangPair> {
  if (isKoreanDevice()) {
    console.log('[Lang] 한국어 기기 감지 → ko-en')
    return { nativeLang: 'ko', targetLang: 'en' }
  }

  if (isSwahiliDevice()) {
    console.log('[Lang] 스와힐리어 기기 감지 → sw-ko')
    return { nativeLang: 'sw', targetLang: 'ko' }
  }

  console.log('[Lang] 영어/기타 기기 → en-ko')
  return DEFAULT_INITIAL_LANG_PAIR
}
