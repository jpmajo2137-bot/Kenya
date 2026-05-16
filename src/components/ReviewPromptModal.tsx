import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { openAppStore } from '../lib/appUpdate'
import { markDismissed, markRated, snoozeReviewPrompt } from '../lib/reviewPrompt'
import type { Lang } from '../lib/i18n'

interface ReviewPromptModalProps {
  open: boolean
  onClose: () => void
  lang: Lang
}

export function ReviewPromptModal({ open, onClose, lang }: ReviewPromptModalProps) {
  const [hoverRating, setHoverRating] = useState(0)
  const [selectedRating, setSelectedRating] = useState(0)
  const [opening, setOpening] = useState(false)

  const handleClose = () => {
    snoozeReviewPrompt()
    onClose()
  }

  const handleLater = () => {
    snoozeReviewPrompt()
    onClose()
  }

  const handleNever = () => {
    markDismissed()
    onClose()
  }

  const handleSubmit = async () => {
    if (selectedRating === 0) return
    setOpening(true)
    try {
      await openAppStore()
      markRated()
    } catch {
      markRated()
    } finally {
      setOpening(false)
      onClose()
    }
  }

  return (
    <Modal open={open} title="" onClose={handleClose} footer={null}>
      <div className="text-center py-2">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-400/30 flex items-center justify-center">
          <span className="text-4xl">⭐</span>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">
          {lang === 'sw' ? 'Programu hii inakupendeza?' : '앱이 마음에 드시나요?'}
        </h2>

        <p className="text-sm text-white/70 mb-5 leading-relaxed">
          {lang === 'sw'
            ? 'Umetumia programu hii kwa zaidi ya dakika 10. Tafadhali tupe ukadiriaji wako kwenye Play Store!'
            : '앱을 10분 이상 사용해주셔서 감사합니다.\nPlay 스토어에 별점과 리뷰를 남겨주시면 큰 힘이 됩니다!'}
        </p>

        <div className="flex justify-center gap-1 mb-5" role="radiogroup" aria-label="rating">
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = (hoverRating || selectedRating) >= star
            return (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={selectedRating === star}
                aria-label={`${star}`}
                className="text-4xl transition active:scale-90 px-1 touch-target"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onFocus={() => setHoverRating(star)}
                onBlur={() => setHoverRating(0)}
                onClick={() => setSelectedRating(star)}
              >
                <span
                  className={
                    filled
                      ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.55)]'
                      : 'text-white/25'
                  }
                >
                  {filled ? '★' : '☆'}
                </span>
              </button>
            )
          })}
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleSubmit}
            disabled={selectedRating === 0 || opening}
            className="w-full"
          >
            {opening
              ? lang === 'sw'
                ? 'Inafungua Play Store...'
                : 'Play 스토어 여는 중...'
              : lang === 'sw'
                ? '⭐ Andika Mapitio'
                : '⭐ 리뷰 작성하기'}
          </Button>
          <Button variant="secondary" onClick={handleLater} className="w-full">
            {lang === 'sw' ? 'Baadaye' : '나중에'}
          </Button>
          <button
            type="button"
            onClick={handleNever}
            className="w-full text-xs text-white/45 hover:text-white/70 underline-offset-2 hover:underline pt-1"
          >
            {lang === 'sw' ? 'Usinionyeshe tena' : '다시 보지 않기'}
          </button>
        </div>

        <p className="mt-4 text-[11px] text-white/40">
          {lang === 'sw'
            ? '💜 Ukadiriaji wako wa nyota 5 hutusaidia sana!'
            : '💜 별 5개 평가는 큰 힘이 됩니다!'}
        </p>
      </div>
    </Modal>
  )
}
