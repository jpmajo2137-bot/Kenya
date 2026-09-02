import type { NativeLang, TargetLang } from './types'

/** 첫 실행 시 고정되는 사용자 버전 (모국어 → 학습언어) */
export type InitialLangPair = {
  nativeLang: NativeLang
  targetLang: TargetLang
}

/** 이 앱은 한국어→영어 전용 */
export const DEFAULT_INITIAL_LANG_PAIR: InitialLangPair = {
  nativeLang: 'ko',
  targetLang: 'en',
}

const FIRST_RUN_KEY = 'kenya-vocab.firstRun'

export function isFirstRun(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) !== 'done'
  } catch {
    return true
  }
}

export function markFirstRunDone(): void {
  try {
    localStorage.setItem(FIRST_RUN_KEY, 'done')
  } catch {
    // ignore
  }
}

export async function detectInitialLang(): Promise<InitialLangPair> {
  return DEFAULT_INITIAL_LANG_PAIR
}
