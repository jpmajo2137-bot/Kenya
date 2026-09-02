/**
 * 신규 스토어 앱 정체성 (Play Store / App Store).
 * Android applicationId · iOS bundleId · Capacitor appId 와 동일해야 한다.
 */
export const APP_ID = 'com.jph.oxfordenglish'

/** 스토어·네이티브 표시 이름 */
export const APP_DISPLAY_NAME = 'JHP 영어 단어 암기'

/** 영문 스토어 타이틀 */
export const APP_DISPLAY_NAME_EN = 'JHP English Words'

/** PWA short_name */
export const APP_SHORT_NAME = 'JHP 영어암기'

export const APP_DESCRIPTION_KO =
  'Oxford 5000 기반 영어 단어를 한국어로 공부하는 단어장. Day별 학습, 퀴즈, 오답노트, 사전 검색을 지원합니다.'

export const APP_DESCRIPTION_EN =
  'Learn Oxford 5000 English words with Korean meanings. Day-based study, quizzes, wrong-note review, and dictionary search.'

/** Play Store 상세 페이지 */
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_ID}`

/** App Store Connect app id */
export const APP_STORE_APP_ID = '6807980665'
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_APP_ID}`

/** 공식 사이트 (Firebase Hosting). 커스텀 도메인 연결 후 SITE_URL만 바꾸면 된다. */
export const SITE_URL = 'https://jhpenglish.web.app'

/** 개인정보처리방침 / 데이터 삭제 요청 */
export const PRIVACY_URL = `${SITE_URL}/privacy`
export const DELETE_DATA_URL = `${SITE_URL}/delete-data`

/** localStorage / IndexedDB 접두사 — 구 앱(kenya-vocab)과 분리 */
export const STORAGE_PREFIX = 'oxford-en'
