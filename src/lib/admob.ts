import { App as CapApp } from '@capacitor/app'

// AdMob — 플랫폼별 유닛 (com.jph.oxfordenglish)
const AD_UNITS = {
  android: {
    appId: 'ca-app-pub-1454258737058608~1336297195',
    banner: 'ca-app-pub-1454258737058608/9190736485',
    interstitial: 'ca-app-pub-1454258737058608/7596629389',
    rewarded: 'ca-app-pub-1454258737058608/4176259122',
  },
  ios: {
    appId: 'ca-app-pub-1454258737058608~2816899828',
    banner: 'ca-app-pub-1454258737058608/2457807178',
    interstitial: 'ca-app-pub-1454258737058608/1550095788',
    rewarded: 'ca-app-pub-1454258737058608/3657384374',
  },
} as const

function getAdPlatform(): 'android' | 'ios' {
  try {
    const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.()
    if (platform === 'ios') return 'ios'
  } catch {
    // ignore
  }
  return 'android'
}

function getBannerAdUnitId(): string {
  return AD_UNITS[getAdPlatform()].banner
}
function getInterstitialAdUnitId(): string {
  return AD_UNITS[getAdPlatform()].interstitial
}
function getRewardedAdUnitId(): string {
  return AD_UNITS[getAdPlatform()].rewarded
}

// 전면 광고 표시 간격: 4분마다 노출 시도
// - 첫 실행: 시작 시각을 기준으로 4분 후 첫 광고 (시작 직후 광고 X → 첫인상 보호)
// - 재실행: 마지막 노출 시각을 localStorage에서 복원 → 이미 4분 이상 지났으면 시작 직후 광고
// - Google AdMob 정책상 1~2분 미만은 invalid traffic 위험 → 4분으로 안전마진 확보
const AD_INTERVAL_MS = 4 * 60 * 1000
// 강제 노출(중요한 자연스러운 휴식 시점)에는 살짝 더 짧은 간격 적용
const AD_INTERVAL_BREAKPOINT_MS = 2 * 60 * 1000
const QUIZ_ACCESS_DURATION_MS = 30 * 60 * 1000 // 보상형 광고 시청 후 30분간 퀴즈 가능
const DICTIONARY_ACCESS_DURATION_MS = 30 * 60 * 1000 // 보상형 광고 시청 후 30분간 사전 가능

// 광고 prepare를 노출 예정 시각보다 얼마나 일찍 할지 (60초 전)
// → 매치율 개선을 위해 just-in-time 로딩
const INTERSTITIAL_PREPARE_LEAD_MS = 60 * 1000

// FailedToLoad 시 재시도 정책 (요청 수 폭증 방지)
const MAX_LOAD_RETRIES = 2
const LOAD_RETRY_BACKOFF_MS = 2 * 60 * 1000 // 실패 시 2분 후 재시도

// 마지막 전면 광고 노출 시각 localStorage key (세션 간 유지 - 앱 재실행해도 타이머 연속성 확보)
const LAST_INTERSTITIAL_SHOWN_KEY = 'last_interstitial_shown_at'

// 광고 상태
let isInitialized = false
let adIntervalTimer: ReturnType<typeof setInterval> | null = null
let isInterstitialReady = false
let isRewardedReady = false
let isPreparingInterstitial = false
let isPreparingRewarded = false
let lastInterstitialShownAt = 0
let appResumeListenerRegistered = false

// 배너 광고 상태
let isBannerVisible = false
let isBannerLoaded = false
let bannerHeightPx = 0
const BANNER_HIDE_REASONS = new Set<string>() // 풀스크린 중첩 호출 추적

// 재시도 카운터 (실패 시 폭주 방지용)
let interstitialLoadRetries = 0
let rewardedLoadRetries = 0

// prepare 호출 쓰로틀링: 짧은 시간에 prepare가 반복 호출되는 것 방지
// (FailedToLoad → 백오프 → 또 prepare 같은 누적 패턴 방지)
let lastInterstitialPrepareAt = 0
const MIN_PREPARE_INTERVAL_MS = 30 * 1000 // 최소 30초 간격으로만 prepare 호출

// 학습 세션(플래시카드 카드 보기, 퀴즈 풀이 중) 추적
// - 이 동안에는 자동 타이머/포그라운드 복귀로 인한 전면 광고를 보류
// - 사용자 명시 액션(탭 전환, 결과 화면 진입)에서는 그대로 노출
const LEARNING_SESSION_REASONS = new Set<string>()
function isLearningSessionActive(): boolean {
  return LEARNING_SESSION_REASONS.size > 0
}

/**
 * 학습 세션(전면 광고 인터럽트 보호) 토글
 * - reason 기반 카운팅으로 중첩 호출에도 안전
 * - 활성: 플래시카드 카드 보기, 퀴즈 풀이 중
 * - 비활성: 결과 화면, 셋업 화면, 일반 탐색
 */
export function setLearningSessionActive(active: boolean, reason: string = 'default'): void {
  if (active) {
    LEARNING_SESSION_REASONS.add(reason)
  } else {
    LEARNING_SESSION_REASONS.delete(reason)
  }
}

// 동의 상태에 따른 광고 유형
type AdPersonalization = 'personalized' | 'non_personalized' | 'limited'
let currentAdPersonalization: AdPersonalization = 'non_personalized'

// 퀴즈 접근 권한 상태 (localStorage에 저장)
const QUIZ_ACCESS_KEY = 'quiz_access_until'
// 사전 접근 권한 상태 (localStorage에 저장)
const DICTIONARY_ACCESS_KEY = 'dictionary_access_until'

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
 * 사전 접근 가능 여부 확인
 * - 웹 환경에서는 항상 true (개발/테스트 편의)
 * - 네이티브 환경에서는 보상형 광고 시청 후 30분간 접근 가능
 */
export function canAccessDictionary(): boolean {
  if (!isCapacitorNative()) {
    return true
  }

  const accessUntil = localStorage.getItem(DICTIONARY_ACCESS_KEY)
  if (!accessUntil) return false

  const until = parseInt(accessUntil, 10)
  return Date.now() < until
}

/**
 * 사전 접근 권한 남은 시간 (밀리초)
 */
export function getDictionaryAccessRemainingTime(): number {
  const accessUntil = localStorage.getItem(DICTIONARY_ACCESS_KEY)
  if (!accessUntil) return 0

  const until = parseInt(accessUntil, 10)
  const remaining = until - Date.now()
  return remaining > 0 ? remaining : 0
}

/**
 * 사전 접근 권한 부여 (30분)
 */
export function grantDictionaryAccess(): void {
  const until = Date.now() + DICTIONARY_ACCESS_DURATION_MS
  localStorage.setItem(DICTIONARY_ACCESS_KEY, until.toString())
  console.log('[AdMob] 사전 접근 권한 부여됨 (30분)')
}

/**
 * UMP 동의 정보 요청 및 처리
 * - 전체 지역에서 동의 폼 표시
 */
async function requestConsentInfo(): Promise<void> {
  if (!isCapacitorNative()) return

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    
    // 동의 정보 요청 (실제 지역 기반으로 처리 - 프로덕션에서는 debugGeography 사용 금지)
    const consentInfo = await AdMob.requestConsentInfo({
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
    
    // 현재 동의 상태 확인 (실제 지역 기반)
    const consentInfo = await AdMob.requestConsentInfo({})
    
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
    const { AdMob, InterstitialAdPluginEvents, RewardAdPluginEvents, BannerAdPluginEvents } = await import('@capacitor-community/admob')
    
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
      isInterstitialReady = true
      isPreparingInterstitial = false
      interstitialLoadRetries = 0
    })

    AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
      console.log('[AdMob] 전면 광고 표시됨')
      isInterstitialReady = false
      lastInterstitialShownAt = Date.now()
      // 세션 간 유지를 위해 localStorage에도 저장
      try { localStorage.setItem(LAST_INTERSTITIAL_SHOWN_KEY, String(lastInterstitialShownAt)) } catch {}
    })

    AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
      console.log('[AdMob] 전면 광고 닫힘')
      isInterstitialReady = false
      // 다음 광고는 다음 노출 시점 직전(약 9분 뒤)에 prepare됨 → 사용자가 앱을 닫아도 요청 낭비 방지
    })

    AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (error) => {
      console.error('[AdMob] 전면 광고 로드 실패:', error, 'retries:', interstitialLoadRetries)
      isInterstitialReady = false
      isPreparingInterstitial = false
      interstitialLoadRetries += 1
      // 최대 재시도 횟수 초과 시 다음 노출 주기까지 재시도 안 함 (요청 수 폭주 방지)
      if (interstitialLoadRetries <= MAX_LOAD_RETRIES) {
        setTimeout(() => {
          prepareInterstitialAd()
        }, LOAD_RETRY_BACKOFF_MS)
      } else {
        console.warn('[AdMob] 전면 광고 로드 재시도 한도 초과 - 다음 주기까지 대기')
      }
    })

    AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (error) => {
      console.error('[AdMob] 전면 광고 표시 실패:', error)
      isInterstitialReady = false
      // 표시 실패 시에도 즉시 재요청하지 않음 (다음 주기에서 prepare됨)
    })

    // 보상형 광고 이벤트 리스너
    AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
      console.log('[AdMob] 보상형 광고 로드 완료')
      isRewardedReady = true
      isPreparingRewarded = false
      rewardedLoadRetries = 0
    })

    AdMob.addListener(RewardAdPluginEvents.Showed, () => {
      console.log('[AdMob] 보상형 광고 표시됨')
      isRewardedReady = false
    })

    AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => {
      console.log('[AdMob] 보상 획득:', reward)
      grantQuizAccess()
    })

    AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
      console.log('[AdMob] 보상형 광고 닫힘')
      isRewardedReady = false
      // 다음 사용자 요청 시점에 on-demand로 prepare됨 (showRewardedAd 내부에서)
    })

    AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error) => {
      console.error('[AdMob] 보상형 광고 로드 실패:', error, 'retries:', rewardedLoadRetries)
      isRewardedReady = false
      isPreparingRewarded = false
      rewardedLoadRetries += 1
      // 보상형은 재시도 없이 사용자 요청 시점에만 다시 시도 (요청 수 절감)
    })

    AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
      console.error('[AdMob] 보상형 광고 표시 실패:', error)
      isRewardedReady = false
    })

    // 배너 광고 이벤트 리스너
    AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      console.log('[AdMob] 배너 로드 완료')
      isBannerLoaded = true
    })

    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: { width: number; height: number }) => {
      const h = Math.max(0, Math.round(size?.height ?? 0))
      bannerHeightPx = h
      try {
        // 콘텐츠가 배너에 가려지지 않도록 CSS 변수로 높이 노출
        document.documentElement.style.setProperty('--ad-banner-height', `${h}px`)
      } catch {}
      console.log('[AdMob] 배너 사이즈 변경:', size)
    })

    AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error) => {
      console.error('[AdMob] 배너 로드 실패:', error)
      isBannerLoaded = false
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
  if (isInterstitialReady || isPreparingInterstitial) return

  // 쓰로틀링: 마지막 prepare 호출로부터 30초 이내면 skip
  // (60초 인터벌 타이머가 매분 호출되어도 무한 prepare 폭주 방지)
  const now = Date.now()
  if (now - lastInterstitialPrepareAt < MIN_PREPARE_INTERVAL_MS) {
    return
  }
  lastInterstitialPrepareAt = now

  isPreparingInterstitial = true
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    const options = getAdRequestOptions()

    await AdMob.prepareInterstitial({
      adId: getInterstitialAdUnitId(),
      isTesting: false,
      ...options,
    })
    console.log('[AdMob] 전면 광고 준비 요청 완료 (유형:', currentAdPersonalization, ')')
    // 실제 Loaded 이벤트로 isInterstitialReady = true 처리됨
    // 실패 시 FailedToLoad 리스너가 백오프와 재시도 횟수 제어
  } catch (error) {
    console.error('[AdMob] 전면 광고 준비 호출 실패:', error)
    isPreparingInterstitial = false
    // 호출 자체가 실패한 경우 재시도하지 않음 (다음 노출 주기에 다시 시도됨)
  }
}

/**
 * 보상형 광고 준비 (개인화 수준 적용)
 */
export async function prepareRewardedAd(): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) return
  if (isRewardedReady || isPreparingRewarded) return

  isPreparingRewarded = true
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    const options = getAdRequestOptions()

    await AdMob.prepareRewardVideoAd({
      adId: getRewardedAdUnitId(),
      isTesting: false,
      ...options,
    })
    console.log('[AdMob] 보상형 광고 준비 요청 완료 (유형:', currentAdPersonalization, ')')
    // 실패 시 FailedToLoad 리스너에서 처리 (자동 재시도 없음, 사용자 요청 시 다시 시도)
  } catch (error) {
    console.error('[AdMob] 보상형 광고 준비 호출 실패:', error)
    isPreparingRewarded = false
  }
}

/**
 * 전면 광고 표시
 * - 광고가 준비되지 않았으면 skip (다음 tick에 prepare/표시 재시도됨)
 */
export async function showInterstitialAd(): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) {
    console.log('[AdMob] 광고 표시 불가 (웹 환경 또는 미초기화)')
    return
  }

  if (!isInterstitialReady) {
    console.log('[AdMob] 전면 광고 아직 로드 안됨 - skip (다음 체크에서 재시도)')
    return
  }

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.showInterstitial()
  } catch (error) {
    console.error('[AdMob] 전면 광고 표시 실패:', error)
    isInterstitialReady = false
  }
}

/**
 * 보상형 광고 표시
 * - 로드되지 않은 경우 최대 5초까지 대기 후 시도
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

  // 로드 안됐으면 준비 요청 후 대기 (사용자가 명시적으로 요청한 시점이므로 on-demand prepare)
  if (!isRewardedReady) {
    console.log('[AdMob] 보상형 광고 아직 로드 안됨 - 준비 후 대기')
    rewardedLoadRetries = 0 // 사용자 요청 시점이므로 재시도 카운터 리셋
    prepareRewardedAd()
    // 최대 8초 대기
    const start = Date.now()
    while (!isRewardedReady && Date.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 200))
    }
    if (!isRewardedReady) {
      console.error('[AdMob] 보상형 광고 로드 타임아웃')
      return false
    }
  }

  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.showRewardVideoAd()
    return true
  } catch (error) {
    console.error('[AdMob] 보상형 광고 표시 실패:', error)
    isRewardedReady = false
    return false
  }
}

/**
 * 마지막 광고 노출 이후 경과 시간을 기준으로 광고 표시 시도
 * - 노출 시점 약 60초 전에 prepare하여 just-in-time 로딩 (요청/노출 매치율 향상)
 * - 노출 시점에 광고가 준비되어 있으면 표시
 * - respectLearningGate=true 인 경우, 학습 세션 활성 시 표시는 보류하고 prepare만 진행
 *   (자동 인터벌 타이머 / foreground 복귀 등에서 사용)
 */
function tryShowInterstitialByElapsed(options: { respectLearningGate?: boolean } = {}): void {
  const { respectLearningGate = false } = options
  const now = Date.now()
  if (lastInterstitialShownAt === 0) {
    // 안전장치: 타이머 시작 전 호출된 경우 현재 시각 기준으로 초기화
    lastInterstitialShownAt = now
    return
  }
  const elapsed = now - lastInterstitialShownAt
  const remaining = AD_INTERVAL_MS - elapsed

  // 노출 시점에 도달 → 표시 시도
  if (elapsed >= AD_INTERVAL_MS) {
    // 학습 도중이면 표시 보류 (prepare만 유지) - 학습 흐름 보호
    if (respectLearningGate && isLearningSessionActive()) {
      console.log('[AdMob] 학습 세션 활성 - 전면 광고 표시 보류 (prepare만)')
      if (!isInterstitialReady && !isPreparingInterstitial) {
        prepareInterstitialAd()
      }
      return
    }
    console.log('[AdMob] 간격 경과 - 전면 광고 표시 시도 (경과:', Math.round(elapsed / 1000), '초)')
    if (isInterstitialReady) {
      showInterstitialAd()
    } else if (!isPreparingInterstitial) {
      // 준비 안됐으면 prepare 시작 (다음 tick에 표시 시도)
      prepareInterstitialAd()
    }
    return
  }

  // 노출 직전(60초 이내) → 미리 prepare 시작
  if (remaining <= INTERSTITIAL_PREPARE_LEAD_MS && !isInterstitialReady && !isPreparingInterstitial) {
    console.log('[AdMob] 노출 임박 - 전면 광고 prepare 시작 (남은시간:', Math.round(remaining / 1000), '초)')
    prepareInterstitialAd()
  }
}

/**
 * 외부에서 호출 가능한 광고 표시 시도 (인터벌 가드 포함)
 * - 탭 전환 등 사용자 명시 액션 시 호출
 * - 화면 마운트 직후 어색하게 가리지 않도록 짧은 지연 후 표시
 * - 인터벌 미경과 시 아무 동작 안 함 (안전)
 * - 사용자 명시 액션이므로 학습 세션 가드는 적용하지 않음
 *   (어차피 사용자가 다른 화면으로 이동하는 시점)
 */
export function maybeShowInterstitialAd(): void {
  // 새 화면이 마운트되어 사용자가 인지한 직후 노출되도록 약간의 지연
  setTimeout(() => {
    tryShowInterstitialByElapsed()
  }, 300)
}

/**
 * 자연스러운 휴식 시점(브레이크포인트)에서 호출
 * - 플래시카드 완료, 퀴즈 완료 등 사용자가 멈춘 시점
 * - 일반 인터벌(4분)보다 짧은 2분 이상이면 광고 노출
 * - 노출 직후 lastInterstitialShownAt 업데이트되어 다음 4분 카운터 시작
 * - 미준비 시 짧게(최대 3초) 폴링하여 노출 기회 확보
 */
export async function maybeShowInterstitialAtBreakpoint(): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) return
  const now = Date.now()
  const elapsed = now - (lastInterstitialShownAt || now)
  // 마지막 광고로부터 일정 시간(2분) 이상 지났을 때만 노출 - UX 보호
  if (elapsed < AD_INTERVAL_BREAKPOINT_MS) {
    console.log('[AdMob] 브레이크포인트 - 인터벌 미충족 skip (경과:', Math.round(elapsed / 1000), '초)')
    return
  }
  if (isInterstitialReady) {
    console.log('[AdMob] 브레이크포인트 - 전면 광고 표시')
    showInterstitialAd()
    return
  }
  // 준비된 광고가 없으면 prepare 후 짧게 폴링하여 노출 기회 확보
  if (!isPreparingInterstitial) {
    console.log('[AdMob] 브레이크포인트 - 미준비, prepare 트리거')
    prepareInterstitialAd()
  }
  const waitStart = Date.now()
  while (!isInterstitialReady && Date.now() - waitStart < 3000) {
    await new Promise((r) => setTimeout(r, 200))
  }
  if (isInterstitialReady) {
    console.log('[AdMob] 브레이크포인트 - prepare 완료 후 표시')
    showInterstitialAd()
  } else {
    console.log('[AdMob] 브레이크포인트 - 폴링 타임아웃, 다음 주기까지 대기')
  }
}

// ===== 배너 광고 =====

/**
 * 배너 광고 표시 (하단 고정, 적응형 사이즈)
 * - 이미 표시 중이면 무시 (resumeBanner는 별도)
 * - 풀스크린 화면(플래시카드/퀴즈 풀스크린)에서는 hideBannerAd()로 잠시 숨김
 */
export async function showBannerAd(): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) return
  // hide reason이 남아있으면 표시하지 않음 (풀스크린 우선)
  if (BANNER_HIDE_REASONS.size > 0) {
    console.log('[AdMob] 배너 표시 보류 (숨김 사유 활성):', Array.from(BANNER_HIDE_REASONS))
    return
  }

  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await import('@capacitor-community/admob')
    const options = getAdRequestOptions()

    if (isBannerVisible) {
      // 이미 표시 중인데 hide 후 다시 호출되었을 가능성 → resume
      try {
        await AdMob.resumeBanner()
        console.log('[AdMob] 배너 resume')
      } catch {
        // resume 실패 시 무시
      }
      return
    }

    await AdMob.showBanner({
      adId: getBannerAdUnitId(),
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: false,
      ...options,
    })
    isBannerVisible = true
    console.log('[AdMob] 배너 표시 (유형:', currentAdPersonalization, ')')
  } catch (error) {
    console.error('[AdMob] 배너 표시 실패:', error)
  }
}

/**
 * 배너 광고 잠시 숨김 (풀스크린 화면 진입 시)
 * - reason 카운트로 중첩된 호출도 안전하게 처리
 */
export async function hideBannerAd(reason: string = 'default'): Promise<void> {
  if (!isCapacitorNative() || !isInitialized) return
  BANNER_HIDE_REASONS.add(reason)
  try {
    const { AdMob } = await import('@capacitor-community/admob')
    await AdMob.hideBanner()
    isBannerVisible = false
    bannerHeightPx = 0
    try {
      document.documentElement.style.setProperty('--ad-banner-height', '0px')
    } catch {}
    console.log('[AdMob] 배너 숨김 (reason:', reason, ')')
  } catch (error) {
    console.error('[AdMob] 배너 숨김 실패:', error)
  }
}

/**
 * 배너 광고 다시 표시 (풀스크린 화면 종료 시)
 * - 동일한 reason의 hide 호출이 모두 해소되어야 다시 표시
 */
export async function resumeBannerAd(reason: string = 'default'): Promise<void> {
  BANNER_HIDE_REASONS.delete(reason)
  if (BANNER_HIDE_REASONS.size > 0) {
    console.log('[AdMob] 배너 resume 보류 (남은 사유):', Array.from(BANNER_HIDE_REASONS))
    return
  }
  if (!isCapacitorNative() || !isInitialized) return

  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await import('@capacitor-community/admob')
    const options = getAdRequestOptions()
    if (isBannerLoaded) {
      try {
        await AdMob.resumeBanner()
        isBannerVisible = true
        console.log('[AdMob] 배너 resume')
        return
      } catch {
        // resume 실패 시 새로 표시
      }
    }
    await AdMob.showBanner({
      adId: getBannerAdUnitId(),
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: false,
      ...options,
    })
    isBannerVisible = true
    console.log('[AdMob] 배너 재표시')
  } catch (error) {
    console.error('[AdMob] 배너 재표시 실패:', error)
  }
}

/**
 * 현재 배너 높이 (CSS 픽셀)
 */
export function getBannerHeightPx(): number {
  return bannerHeightPx
}

/**
 * 전면 광고 타이머 시작
 * - 첫 실행: 현재 시각 기준으로 10분 카운트 시작 (시작 직후엔 광고 X)
 * - 재실행: localStorage에서 마지막 노출 시각 복원 → 이미 10분 이상 지났으면 곧바로 광고
 * - Android WebView 백그라운드 스로틀링 대응: 앱이 foreground로 돌아올 때도 체크
 */
export function startAdTimer(): void {
  if (adIntervalTimer) {
    console.log('[AdMob] 광고 타이머 이미 실행 중')
    return
  }

  console.log('[AdMob] 전면 광고 타이머 시작 (간격:', Math.round(AD_INTERVAL_MS / 60000), '분)')

  // localStorage에 저장된 마지막 노출 시각이 있으면 복원 (세션 간 연속성).
  // 없으면(첫 설치/첫 실행) 현재 시각으로 초기화 → 10분 후 첫 광고가 뜨도록.
  try {
    const stored = localStorage.getItem(LAST_INTERSTITIAL_SHOWN_KEY)
    if (stored) {
      const ts = parseInt(stored, 10)
      if (!isNaN(ts) && ts > 0 && ts <= Date.now()) {
        lastInterstitialShownAt = ts
      } else {
        lastInterstitialShownAt = Date.now()
        localStorage.setItem(LAST_INTERSTITIAL_SHOWN_KEY, String(lastInterstitialShownAt))
      }
    } else {
      lastInterstitialShownAt = Date.now()
      localStorage.setItem(LAST_INTERSTITIAL_SHOWN_KEY, String(lastInterstitialShownAt))
    }
  } catch {
    lastInterstitialShownAt = Date.now()
  }

  // 1분마다 경과 시간 체크 (스로틀링 영향 최소화)
  // - 학습 세션 활성 시에는 표시 보류, prepare만 진행 (학습 흐름 보호)
  adIntervalTimer = setInterval(() => {
    tryShowInterstitialByElapsed({ respectLearningGate: true })
  }, 60_000)

  // 앱이 다시 foreground로 돌아올 때 경과 시간 체크
  // (백그라운드에서 setInterval이 멈춰있었을 수 있음)
  if (!appResumeListenerRegistered) {
    appResumeListenerRegistered = true

    // 웹 표준 visibilitychange
    // foreground 복귀 시점에 경과 시간 체크
    // 학습 세션 활성 시에는 표시 보류 → 사용자가 학습 재개하려는 순간 차단 방지
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          console.log('[AdMob] 앱 foreground 복귀 - 광고 시간 체크')
          tryShowInterstitialByElapsed({ respectLearningGate: true })
        }
      })
    }

    // Capacitor App resume 이벤트 (Android 네이티브) — App.tsx 가 이미 static import 하므로
    // 같이 정적으로 import 해 dynamic import 경고를 없앤다.
    if (isCapacitorNative()) {
      try {
        CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            console.log('[AdMob] 앱 활성화 - 광고 시간 체크')
            tryShowInterstitialByElapsed({ respectLearningGate: true })
          }
        })
      } catch (e) {
        console.log('[AdMob] App resume 리스너 등록 실패:', e)
      }
    }
  }
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
    // 광고는 on-demand로 prepare되므로 여기서 미리 호출하지 않음
  } catch (error) {
    console.error('[UMP] 동의 리셋 실패:', error)
  }
}

/**
 * AdMob 서비스 전체 시작
 * - 초기에는 광고를 미리 요청하지 않음 (요청수/노출수 매치율 개선)
 * - 전면 광고: 노출 시점 약 60초 전에 just-in-time으로 prepare됨
 * - 보상형 광고: 사용자가 표시 요청할 때(showRewardedAd) on-demand로 prepare됨
 * - 배너 광고: 초기화 직후 표시 (지속 노출 → 매출 극대화)
 */
export async function startAdMobService(): Promise<void> {
  await initializeAdMob()
  startAdTimer()
  // 초기화가 끝나면 즉시 배너 표시 (네이티브에서만)
  if (isCapacitorNative() && isInitialized) {
    // 약간의 지연으로 첫 화면 깜빡임 방지
    setTimeout(() => {
      showBannerAd().catch((e) => console.log('[AdMob] 초기 배너 표시 실패:', e))
    }, 500)
  }
}
