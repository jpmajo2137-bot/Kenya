import type { Grade, Srs } from './types'

const DAY = 24 * 60 * 60 * 1000

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function createInitialSrs(now = Date.now()): Srs {
  return {
    dueAt: now,
    intervalDays: 0,
    ease: 2.2,
    correctStreak: 0,
    totalReviews: 0,
  }
}

/**
 * 매우 단순한 SM-2 계열(3단계 grade) 변형:
 * - again: 간격을 크게 줄이고, ease를 내림
 * - hard: 조금 늘리되 ease 소폭 하향
 * - good: 늘리고 ease 소폭 상향
 */
export function applyReview(prev: Srs, grade: Grade, now = Date.now()): Srs {
  const totalReviews = prev.totalReviews + 1

  let ease = prev.ease
  let intervalDays = prev.intervalDays
  let correctStreak = prev.correctStreak

  if (grade === 'again') {
    ease = clamp(ease - 0.2, 1.3, 2.8)
    intervalDays = Math.max(0.04, intervalDays * 0.35) // 약 1시간~몇시간
    correctStreak = 0
  } else if (grade === 'hard') {
    ease = clamp(ease - 0.05, 1.3, 2.8)
    intervalDays = intervalDays <= 0.1 ? 0.5 : intervalDays * Math.max(1.2, ease * 0.9)
    correctStreak = correctStreak + 1
  } else {
    ease = clamp(ease + 0.03, 1.3, 2.8)
    intervalDays = intervalDays <= 0.1 ? 1 : intervalDays * ease
    correctStreak = correctStreak + 1
  }

  // 너무 급격히 커지는 걸 방지
  intervalDays = clamp(intervalDays, 0.04, 180)
  const dueAt = now + intervalDays * DAY

  return {
    dueAt,
    intervalDays,
    ease,
    correctStreak,
    totalReviews,
    lastReviewedAt: now,
  }
}

export function isDue(srs: Srs, now = Date.now()) {
  return srs.dueAt <= now
}






