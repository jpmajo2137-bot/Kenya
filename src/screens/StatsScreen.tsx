import type { ReviewLogItem, VocabItem } from '../lib/types'
import { isDue } from '../lib/srs'
import { Badge } from '../components/Badge'
import type { Lang } from '../lib/i18n'

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function StatsScreen({
  items,
  reviewLog,
  now,
  lang,
}: {
  items: VocabItem[]
  reviewLog: ReviewLogItem[]
  now: number
  lang: Lang
}) {
  const dueCount = items.filter((x) => isDue(x.srs, now)).length
  const learnedCount = items.filter((x) => x.srs.intervalDays >= 7).length

  const todayStart = startOfDay(now)
  const today = reviewLog.filter((x) => x.at >= todayStart)
  const again = today.filter((x) => x.grade === 'again').length
  const good = today.filter((x) => x.grade === 'good').length
  const hard = today.filter((x) => x.grade === 'hard').length
  const total = today.length
  const success = good + hard
  const accuracy = total ? Math.round((success / total) * 100) : 0

  const statsTitle = lang === 'sw' ? 'Takwimu' : '통계'
  const statsDesc = lang === 'sw' ? 'Muhtasari wa maendeleo yako' : '학습 데이터를 기반으로 간단히 요약합니다.'
  const totalWordsLabel = lang === 'sw' ? 'Jumla ya Maneno' : '전체 단어'
  const dueLabel = lang === 'sw' ? 'Mapitio' : '복습 대상'
  const learnedLabel = lang === 'sw' ? 'Yamejifunzwa (7+ siku)' : '학습됨(간격 7일+)'
  const todayLabel = lang === 'sw' ? 'Leo' : '오늘'
  const reviewsLabel = lang === 'sw' ? `Mapitio ${total} · Usahihi ${accuracy}%` : `리뷰 ${total}회 · 정확도 ${accuracy}%`
  const againLabel = lang === 'sw' ? `Sijui ${again}` : `몰라요 ${again}`
  const hardLabel = lang === 'sw' ? `Wastani ${hard}` : `애매 ${hard}`
  const goodLabel = lang === 'sw' ? `Najua ${good}` : `알아요 ${good}`
  const accuracyNote = lang === 'sw' ? 'Usahihi = (wastani + najua) / jumla ya mapitio' : '정확도는 (애매+알아요) / 전체 리뷰 기준으로 계산합니다.'

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 app-banner backdrop-blur">
        <div className="text-2xl font-extrabold text-white">{statsTitle}</div>
        <div className="mt-1 text-sm font-semibold text-white/70">{statsDesc}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl p-4 app-card backdrop-blur">
          <div className="text-sm font-semibold text-white/70">{totalWordsLabel}</div>
          <div className="mt-1 text-3xl font-extrabold text-white">{items.length}</div>
        </div>
        <div className="rounded-3xl p-4 app-card backdrop-blur">
          <div className="text-sm font-semibold text-white/70">{dueLabel}</div>
          <div className="mt-1 text-3xl font-extrabold text-white">{dueCount}</div>
        </div>
        <div className="rounded-3xl p-4 app-card backdrop-blur">
          <div className="text-sm font-semibold text-white/70">{learnedLabel}</div>
          <div className="mt-1 text-3xl font-extrabold text-white">{learnedCount}</div>
        </div>
      </div>

      <div className="rounded-3xl p-5 app-card backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold text-white">{todayLabel}</div>
            <div className="text-sm font-semibold text-white/70">{reviewsLabel}</div>
          </div>
          <div className="flex gap-2">
            <Badge className="border-[rgb(var(--orange))]/25 bg-[rgb(var(--orange))]/15 text-white">
              {againLabel}
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-white/90">{hardLabel}</Badge>
            <Badge className="border-[rgb(var(--green))]/25 bg-[rgb(var(--green))]/15 text-white">
              {goodLabel}
            </Badge>
          </div>
        </div>
        <div className="mt-3 text-xs font-semibold text-white/60">
          {accuracyNote}
        </div>
      </div>
    </div>
  )
}


