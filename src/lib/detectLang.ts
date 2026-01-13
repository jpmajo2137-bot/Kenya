import type { Lang } from './i18n'

const EAST_AFRICA_COUNTRIES = ['KE', 'UG', 'RW', 'TZ'] // 케냐, 우간다, 르완다, 탄자니아

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

// 초기 언어 감지 (비동기) - 최대 3초 내에 결정
export async function detectInitialLang(): Promise<Lang> {
  try {
    // 1. 한국어 기기 → KO (위치와 상관없이)
    if (isKoreanDevice()) {
      console.log('[Lang] 한국어 기기 감지됨 → KO')
      return 'ko'
    }

    // 2. 스와힐리어 기기 → SW
    if (isSwahiliDevice()) {
      console.log('[Lang] 스와힐리어 기기 감지됨 → SW')
      return 'sw'
    }

    // 3. 위치가 동아프리카(케냐/우간다/르완다/탄자니아) → SW
    // 1.5초 타임아웃으로 위치 확인 (빠른 로딩 위해)
    const countryPromise = getCountryCode()
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
    
    const countryCode = await Promise.race([countryPromise, timeoutPromise])
    console.log('[Lang] 국가 코드:', countryCode)
    
    if (isEastAfricaCountry(countryCode)) {
      console.log('[Lang] 동아프리카 국가 감지됨 → SW')
      return 'sw'
    }
  } catch (err) {
    console.log('[Lang] 언어 감지 오류:', err)
  }

  // 4. 그 외 → SW (기본)
  console.log('[Lang] 기본값 → SW')
  return 'sw'
}
