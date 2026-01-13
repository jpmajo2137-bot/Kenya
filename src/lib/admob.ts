// AdMob 설정
const INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-1454258737058608/7937401936'
const REWARDED_AD_UNIT_ID = 'ca-app-pub-1454258737058608/7355975678'

// 30분 (밀리초)
const AD_INTERVAL_MS = 30 * 60 * 1000
const QUIZ_ACCESS_DURATION_MS = 30 * 60 * 1000 // 보상형 광고 시청 후 30분간 퀴즈 가능

// 광고 상태
let isInitialized = false
let adIntervalTimer: ReturnType<typeof setInterval> | null = null

// 동의 상태에 따른 광고 유형
type AdPersonalization = 'personalized' | 'non_personalized' | 'limited'
let currentAdPersonalization: AdPersonalization = 'non_personalized'

// 퀴즈 접근 권한 상태 (localStorage에 저장)
const QUIZ_ACCESS_KEY = 'quiz_access_until'

// Capacitor 환경인지 확인
function isCapacitorNative(): boolean {
  return typeof (window as any).Capacitor !== 'undefined' && 
         (window as any).Capacitor.isNativePlatform?.() === true
}

/**
 * 퀴즈 접근 가능 여부 확인
 */
export function canAccessQuiz(): boolean {
  if (!isCapacitorNative()) {
    return true
  }
  
  const accessUntil = localStorage.getItem(QUIZ_ACCESS_KEY)
  if (!accessUntil) return false
  
  const until = parseInt(accessUntil, 10)
  return Date.now() < until
}

/**
 * 퀴즈 접근 권한 남은 시간 (밀리초)
 */
export function getQuizAccessRemainingTime(): number {
  const accessUntil = localStorage.getItem(QUIZ_ACCESS_KEY)
  if (!accessUntil) return 0
  
  const until = parseInt(accessUntil, 10)
  const remaining = until - Date.now()
  return remaining > 0 ? remaining : 0
}

/**
 * 퀴즈 접근 권한 부여 (30분)
 */
export function grantQuizAccess(): void {
  const until = Date.now() + QUIZ_ACCESS_DURATION_MS
  localStorage.setItem(QUIZ_ACCESS_KEY, until.toString())
  console.log('[AdMob] 퀴즈 접근 권한 부여됨 (30분)')
}

/**
 * UMP 동의 정보 요청 및 처리
 * - 전체 지역에서 동의 폼 표시
 */
async function requestConsentInfo(): Promise<void> {
  if (!isCapacitorNative()) return

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    
    // 동의 정보 요청 (전체 지역에서 EEA로 취급하여 동의 폼 표시)
    const consentInfo = await AdMob.requestConsentInfo({
      debugGeography: 1, // 1 = EEA로 취급 (전체 지역에서 동의 폼 표시)
      testDeviceIdentifiers: [], // 테스트 기기 ID
      tagForUnderAgeOfConsent: false,
    })
    
    console.log('[UMP] 동의 정보:', consentInfo)
    
    // 동의 폼이 사용 가능하고 아직 동의하지 않은 경우
    if (consentInfo.isConsentFormAvailable && 
        (consentInfo.status === 'REQUIRED' || consentInfo.status === 'UNKNOWN')) {
      console.log('[UMP] 동의 폼 표시')
      await showConsentForm()
    } else {
      console.log('[UMP] 이미 동의 완료 - 상태:', consentInfo.status)
      // 동의 상태에 따라 광고 개인화 설정
      await updateAdPersonalization()
    }
  } catch (error) {
    console.error('[UMP] 동의 정보 요청 실패:', error)
    // 실패 시 비개인화 광고 사용
    currentAdPersonalization = 'non_personalized'
  }
}

/**
 * 동의 폼 표시
 */
async function showConsentForm(): Promise<void> {
  if (!isCapacitorNative()) return

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    
    const result = await AdMob.showConsentForm()
    console.log('[UMP] 동의 폼 결과:', result)
    
    // 동의 결과에 따라 광고 개인화 설정
    await updateAdPersonalization()
  } catch (error) {
    console.error('[UMP] 동의 폼 표시 실패:', error)
    currentAdPersonalization = 'non_personalized'
  }
}

/**
 * 동의 상태에 따라 광고 개인화 수준 업데이트
 */
async function updateAdPersonalization(): Promise<void> {
  if (!isCapacitorNative()) return

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    
    // 현재 동의 상태 확인
    const consentInfo = await AdMob.requestConsentInfo({
      debugGeography: 1, // 전체 지역에서 EEA로 취급
    })
    
    switch (consentInfo.status) {
      case 'OBTAINED':
      case 'NOT_REQUIRED':
        // 동의 완료 - 개인화 광고 가능 여부 확인
        if (await canShowPersonalizedAds()) {
          currentAdPersonalization = 'personalized'
          console.log('[UMP] 개인화 광고 사용')
        } else {
          currentAdPersonalization = 'non_personalized'
          console.log('[UMP] 비개인화 광고 사용 (개인화 거부)')
        }
        break
        
      case 'REQUIRED':
      case 'UNKNOWN':
        // 아직 동의 안함 - 제한 광고
        currentAdPersonalization = 'limited'
        console.log('[UMP] 제한 광고 사용 (미동의)')
        break
        
      default:
        currentAdPersonalization = 'non_personalized'
        console.log('[UMP] 비개인화 광고 사용 (기본값)')
    }
  } catch (error) {
    console.error('[UMP] 개인화 설정 업데이트 실패:', error)
    currentAdPersonalization = 'non_personalized'
  }
}

/**
 * 개인화 광고 표시 가능 여부 확인 (TCF v2.0 기반)
 */
async function canShowPersonalizedAds(): Promise<boolean> {
  try {
    // TCF v2.0 동의 문자열에서 개인화 광고 동의 여부 확인
    // localStorage에 저장된 IABTCF_PurposeConsents 확인
    const purposeConsents = localStorage.getItem('IABTCF_PurposeConsents') || ''
    
    // Purpose 1 (정보 저장/접근) 필요
    // Purpose 3 (개인화 광고 프로필 생성) 필요  
    // Purpose 4 (개인화 광고 선택) 필요
    const hasStorageConsent = purposeConsents.charAt(0) === '1'
    const hasPersonalizedProfileConsent = purposeConsents.charAt(2) === '1'
    const hasPersonalizedAdsConsent = purposeConsents.charAt(3) === '1'
    
    return hasStorageConsent && hasPersonalizedProfileConsent && hasPersonalizedAdsConsent
  } catch {
    return false
  }
}

/**
 * 현재 광고 개인화 수준 반환
 */
export function getAdPersonalization(): AdPersonalization {
  return currentAdPersonalization
}

/**
 * 광고 요청 옵션 생성 (개인화 수준에 따라)
 */
function getAdRequestOptions(): { npa?: boolean } {
  switch (currentAdPersonalization) {
    case 'personalized':
      return {} // 개인화 광고
    case 'non_personalized':
      return { npa: true } // 비개인화 광고 (Non-Personalized Ads)
    case 'limited':
      return { npa: true } // 제한 광고도 비개인화로 처리
    default:
      return { npa: true }
  }
}

/**
 * AdMob 초기화
 */
export async function initializeAdMob(): Promise<void> {
  if (!isCapacitorNative()) {
    console.log('[AdMob] 웹 환경 - AdMob 비활성화')
    return
  }

  if (isInitialized) return

  try {
    const { AdMob, InterstitialAdPluginEvents, RewardAdPluginEvents } = await import('@capacitor-community/admob')
    
    // 1. UMP 동의 처리 먼저
    await requestConsentInfo()
    
    // 2. AdMob 초기화
    await AdMob.initialize({
      initializeForTesting: false,
    })
    isInitialized = true
    console.log('[AdMob] 초기화 완료 - 광고 유형:', currentAdPersonalization)

    // 전면 광고 이벤트 리스너
    AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
      console.log('[AdMob] 전면 광고 로드 완료')
    })

    AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
      console.log('[AdMob] 전면 광고 표시됨')
    })

    AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
      console.log('[AdMob] 전면 광고 닫힘')
      prepareInterstitialAd()
    })

    AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (error) => {
      console.error('[AdMob] 전면 광고 로드 실패:', error)
    })

    AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (error) => {
      console.error('[AdMob] 전면 광고 표시 실패:', error)
    })

    // 보상형 광고 이벤트 리스너
    AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
      console.log('[AdMob] 보상형 광고 로드 완료')
    })

    AdMob.addListener(RewardAdPluginEvents.Showed, () => {
      console.log('[AdMob] 보상형 광고 표시됨')
    })

    AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => {
      console.log('[AdMob] 보상 획득:', reward)
      grantQuizAccess()
    })

    AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
      console.log('[AdMob] 보상형 광고 닫힘')
      prepareRewardedAd()
    })

    AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error) => {
      console.error('[AdMob] 보상형 광고 로드 실패:', error)
    })

    AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
      console.error('[AdMob] 보상형 광고 표시 실패:', error)
    })

  } catch (error) {
    console.error('[AdMob] 초기화 실패:', error)
  }
}

/**
 * 전면 광고 준비 (개인화 수준 적용)
 */
export async function prepareInterstitialAd(): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) return

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    const options = getAdRequestOptions()
    
    await AdMob.prepareInterstitial({
      adId: INTERSTITIAL_AD_UNIT_ID,
      isTesting: false,
      ...options,
    })
    console.log('[AdMob] 전면 광고 준비 완료 (유형:', currentAdPersonalization, ')')
  } catch (error) {
    console.error('[AdMob] 전면 광고 준비 실패:', error)
  }
}

/**
 * 보상형 광고 준비 (개인화 수준 적용)
 */
export async function prepareRewardedAd(): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) return

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    const options = getAdRequestOptions()
    
    await AdMob.prepareRewardVideoAd({
      adId: REWARDED_AD_UNIT_ID,
      isTesting: false,
      ...options,
    })
    console.log('[AdMob] 보상형 광고 준비 완료 (유형:', currentAdPersonalization, ')')
  } catch (error) {
    console.error('[AdMob] 보상형 광고 준비 실패:', error)
  }
}

/**
 * 전면 광고 표시
 */
export async function showInterstitialAd(): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) {
    console.log('[AdMob] 광고 표시 불가 (웹 환경 또는 미초기화)')
    return
  }

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.showInterstitial()
  } catch (error) {
    console.error('[AdMob] 전면 광고 표시 실패:', error)
    prepareInterstitialAd()
  }
}

/**
 * 보상형 광고 표시
 */
export async function showRewardedAd(): Promise<boolean> {
  if (!isCapacitorNative()) {
    console.log('[AdMob] 웹 환경 - 보상형 광고 스킵, 바로 권한 부여')
    grantQuizAccess()
    return true
  }

  if (!isInitialized) {
    console.log('[AdMob] 미초기화 - 광고 표시 불가')
    return false
  }

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.showRewardVideoAd()
    return true
  } catch (error) {
    console.error('[AdMob] 보상형 광고 표시 실패:', error)
    prepareRewardedAd()
    return false
  }
}

/**
 * 30분 간격 전면 광고 타이머 시작
 */
export function startAdTimer(): void {
  if (adIntervalTimer) {
    console.log('[AdMob] 광고 타이머 이미 실행 중')
    return
  }

  console.log('[AdMob] 30분 간격 전면 광고 타이머 시작')

  adIntervalTimer = setInterval(() => {
    console.log('[AdMob] 30분 경과 - 전면 광고 표시 시도')
    showInterstitialAd()
  }, AD_INTERVAL_MS)
}

/**
 * 광고 타이머 중지
 */
export function stopAdTimer(): void {
  if (adIntervalTimer) {
    clearInterval(adIntervalTimer)
    adIntervalTimer = null
    console.log('[AdMob] 광고 타이머 중지')
  }
}

/**
 * 동의 설정 다시 표시 (설정 화면에서 사용)
 */
export async function resetConsentAndShowForm(): Promise<void> {
  if (!isCapacitorNative()) {
    console.log('[UMP] 웹 환경 - 동의 설정 불가')
    return
  }

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    
    // 동의 상태 리셋
    await AdMob.resetConsentInfo()
    console.log('[UMP] 동의 상태 리셋됨')
    
    // 동의 폼 다시 표시
    await requestConsentInfo()
    
    // 광고 다시 준비
    await prepareInterstitialAd()
    await prepareRewardedAd()
  } catch (error) {
    console.error('[UMP] 동의 리셋 실패:', error)
  }
}

/**
 * AdMob 서비스 전체 시작
 */
export async function startAdMobService(): Promise<void> {
  await initializeAdMob()
  await prepareInterstitialAd()
  await prepareRewardedAd()
  startAdTimer()
}
