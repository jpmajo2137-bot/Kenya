/**
 * 화면 표시 텍스트(displayText)와 DB 원본(dbText)이 일치할 때만 Storage에 저장된 mp3(url)를 재생.
 * 다르면(=화면이 교정/오버라이드된 경우) Supabase 사전 캐시 mp3(`tts-cache/...`) 또는 web speech 로
 * 화면 문구를 직접 읽어서, 표시와 음성이 항상 일치하도록 보장.
 *
 * 외부 TTS API 런타임 호출은 일절 없고 비용 0원 보장.
 */
import { useRef } from 'react'
import { isOnline, getMediaFromCache } from '../lib/offlineCache'
import { hasCachedTts, speakWithFreeFallback, speakWebFallback } from '../lib/ttsCache'
import {
  shouldUseClientTts,
  ttsTextFor,
  type TtsCompareLang,
} from '../lib/meaningEnTts'

type Variant = 'cloudList' | 'flashcardInline' | 'quizMain' | 'wrongNote' | 'small'

type Props = {
  /** Storage에 저장된 mp3 (없거나 실패하면 TTS 폴백) */
  url: string | null | undefined
  /** 화면에 보이는 텍스트 (반드시 이 텍스트가 발음되도록 함) */
  displayText: string | null | undefined
  /** DB 원본 텍스트 — display와 같으면 url 그대로 사용 */
  dbText?: string | null
  /** TTS 언어 */
  lang: TtsCompareLang
  /** true 면 항상 무음 */
  muted?: boolean
  /** true 면 url 무시하고 항상 client TTS 사용 (예: PREFER_CLIENT_*_TTS_BY_WORD) */
  preferClientTts?: boolean
  /** 시각 스타일 */
  variant?: Variant
  /** 추가 클래스 */
  className?: string
  /** 추가 클릭 핸들러 (이벤트 버블링 멈춤 후 실행) */
  onPlay?: () => void
  /** 카드 단위 클릭과 충돌하지 않도록 stopPropagation 처리 */
  stopPropagation?: boolean
}

const VARIANT_CLASS: Record<Variant, string> = {
  cloudList:
    'mt-1 flex h-11 w-11 items-center justify-center rounded-xl bg-[#1a1f3c] border border-white/10 transition hover:bg-[#252b4a]',
  flashcardInline:
    'ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition',
  quizMain:
    'mt-1.5 sm:mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base hover:bg-white/20 active:scale-95 transition touch-target',
  wrongNote:
    'inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm hover:bg-white/20 active:scale-95 transition touch-target shrink-0',
  small:
    'inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition',
}

export function CorrectedAudioBtn({
  url,
  displayText,
  dbText,
  lang,
  muted,
  preferClientTts,
  variant = 'small',
  className,
  onPlay,
  stopPropagation = false,
}: Props) {
  const blobUrlRef = useRef<string | null>(null)

  const display = (displayText ?? '').trim()
  const ttsLine = display ? ttsTextFor(display, lang) : ''
  const canTts = !muted && Boolean(ttsLine) && hasCachedTts()

  const useClient =
    canTts &&
    (preferClientTts === true || shouldUseClientTts(display, dbText, lang))

  if (muted) return null
  if (!url && !canTts) return null

  const playTts = async () => {
    if (!ttsLine) return
    await speakWithFreeFallback(ttsLine, lang)
  }

  const playFromUrl = async () => {
    if (!url) return
    let urlToPlay: string = url
    if (!isOnline()) {
      try {
        const blob = await getMediaFromCache(url)
        if (blob) {
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          urlToPlay = URL.createObjectURL(blob)
          blobUrlRef.current = urlToPlay
        }
      } catch {
        /* try original URL */
      }
    }
    let fellBack = false
    const fallbackOnce = async () => {
      if (fellBack) return
      fellBack = true
      if (canTts) await playTts()
    }
    const a = new Audio(urlToPlay)
    a.addEventListener('error', () => {
      void fallbackOnce()
    })
    try {
      await a.play()
    } catch {
      await fallbackOnce()
    }
  }

  const onClick = async (e: React.MouseEvent | React.TouchEvent) => {
    if (stopPropagation) e.stopPropagation()
    onPlay?.()
    if (preferClientTts && ttsLine) {
      speakWebFallback(ttsLine, lang)
      return
    }
    if (useClient || !url) {
      await playTts()
      return
    }
    await playFromUrl()
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
      e.preventDefault()
    }
    void onClick(e)
  }

  const baseClass = VARIANT_CLASS[variant]
  const finalClass = className ? `${baseClass} ${className}` : baseClass
  const useEmoji = variant !== 'cloudList'

  return (
    <button
      type="button"
      onClick={(e) => void onClick(e)}
      onTouchEnd={stopPropagation ? handleTouchEnd : undefined}
      onTouchStart={stopPropagation ? (e) => e.stopPropagation() : undefined}
      className={finalClass}
      aria-label="Play audio"
      title="Play audio"
    >
      {useEmoji ? (
        <span className="leading-none">🔊</span>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#5ad4e6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#5ad4e6" stroke="none" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  )
}
