import { Capacitor } from '@capacitor/core'

const STORAGE_KEY = 'kenya-vocab.reviewPrompt'

export const REVIEW_THRESHOLD_MS = 10 * 60 * 1000 // 10분

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000 // 3일

export type ReviewStatus = 'pending' | 'rated' | 'dismissed' | 'snoozed'

interface ReviewPromptState {
  usageMs: number
  status: ReviewStatus
  snoozeUntil?: number
  lastShownAt?: number
}

function readState(): ReviewPromptState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { usageMs: 0, status: 'pending' }
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>
    return {
      usageMs: typeof parsed.usageMs === 'number' && parsed.usageMs >= 0 ? parsed.usageMs : 0,
      status: (parsed.status as ReviewStatus) ?? 'pending',
      snoozeUntil: typeof parsed.snoozeUntil === 'number' ? parsed.snoozeUntil : undefined,
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : undefined,
    }
  } catch {
    return { usageMs: 0, status: 'pending' }
  }
}

function writeState(state: ReviewPromptState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function getUsageMs(): number {
  return readState().usageMs
}

export function addUsageMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return getUsageMs()
  // 1회 누적 상한: 비정상적으로 큰 값(예: 시스템 시간 변경) 방지
  const safeDelta = Math.min(deltaMs, 5 * 60 * 1000)
  const state = readState()
  state.usageMs += safeDelta
  writeState(state)
  return state.usageMs
}

export function markRated(): void {
  const state = readState()
  state.status = 'rated'
  state.lastShownAt = Date.now()
  writeState(state)
}

export function markDismissed(): void {
  const state = readState()
  state.status = 'dismissed'
  state.lastShownAt = Date.now()
  writeState(state)
}

export function snoozeReviewPrompt(ms: number = SNOOZE_MS): void {
  const state = readState()
  state.status = 'snoozed'
  state.snoozeUntil = Date.now() + ms
  state.lastShownAt = Date.now()
  writeState(state)
}

export function shouldShowReviewPrompt(): boolean {
  const state = readState()
  if (state.status === 'rated' || state.status === 'dismissed') return false
  if (state.usageMs < REVIEW_THRESHOLD_MS) return false
  if (state.status === 'snoozed' && state.snoozeUntil && Date.now() < state.snoozeUntil) {
    return false
  }
  return true
}

export function isAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  } catch {
    return false
  }
}
