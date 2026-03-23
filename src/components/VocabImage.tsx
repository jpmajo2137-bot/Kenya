import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isOnline, getMediaFromCache } from '../lib/offlineCache'
import { fetchFirstWikiThumbnail } from '../lib/wikiThumbnail'

function normalizeImageUrl(u: string | null | undefined): string | null {
  if (typeof u !== 'string') return null
  const t = u.trim()
  return t.length > 0 ? t : null
}

/** 단어 글자 대신 중립적인 그림 영역 */
function NeutralImageFallback({ alt, className }: { alt: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex min-h-[9rem] w-full flex-col items-center justify-center rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900/95 via-indigo-950/90 to-slate-900/95 ${className ?? ''}`}
    >
      <svg
        className="h-14 w-14 text-cyan-400/35"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.8" fill="currentColor" stroke="none" />
        <path d="M3 17l5-5 4 4 4-6 5 5" />
      </svg>
    </div>
  )
}

function ImageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 min-h-[9rem] ${className ?? ''}`}
      aria-hidden
    />
  )
}

type VocabImageProps = {
  url: string | null | undefined
  alt: string
  className?: string
  /** 영어 뜻 등에서 뽑은 Wikipedia 검색 후보 (없으면 위키 자동 이미지 비활성) */
  wikiSearchTerms?: string[]
  onImageError?: () => void
  onImageLoad?: () => void
}

/**
 * 1) DB/생성 URL  2) 실패·없음 시 Wikipedia 썸네일  3) 중립 플레이스홀더
 */
export function VocabImage({ url, alt, className, wikiSearchTerms, onImageError, onImageLoad }: VocabImageProps) {
  const propClean = normalizeImageUrl(url)
  const hasWikiTerms = (wikiSearchTerms?.length ?? 0) > 0
  /** 배열 참조 흔들림 없이 effect 의존값 고정 */
  const termsSerialized = JSON.stringify(wikiSearchTerms ?? [])

  const [primaryResolved, setPrimaryResolved] = useState<string | null>(null)
  const [primaryReady, setPrimaryReady] = useState(false)
  const [primaryBroken, setPrimaryBroken] = useState(false)
  const blobUrlRef = useRef<string | null>(null)

  const [wikiUrl, setWikiUrl] = useState<string | null>(null)
  const [wikiBroken, setWikiBroken] = useState(false)
  const [wikiLoading, setWikiLoading] = useState(false)
  const wikiFetchedRef = useRef(false)

  const onErrRef = useRef(onImageError)
  const onLoadRef = useRef(onImageLoad)
  onErrRef.current = onImageError
  onLoadRef.current = onImageLoad

  const containerRef = useRef<HTMLDivElement>(null)

  // Primary (DB / 로컬 생성 / 오프라인 캐시)
  useEffect(() => {
    setPrimaryBroken(false)
    setPrimaryReady(false)
    setPrimaryResolved(null)
    wikiFetchedRef.current = false
    setWikiUrl(null)
    setWikiBroken(false)
    setWikiLoading(false)

    if (!propClean) {
      return
    }

    if (isOnline()) {
      setPrimaryResolved(propClean)
      setPrimaryReady(true)
      return
    }

    let cancelled = false
    getMediaFromCache(propClean)
      .then((blob) => {
        if (cancelled) return
        if (blob) {
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          const blobUrl = URL.createObjectURL(blob)
          blobUrlRef.current = blobUrl
          setPrimaryResolved(blobUrl)
        } else {
          setPrimaryResolved(propClean)
        }
        setPrimaryReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setPrimaryResolved(propClean)
        setPrimaryReady(true)
      })

    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [propClean])

  const runWikiFetch = useRef<() => void>(() => {})
  runWikiFetch.current = () => {
    if (!isOnline() || wikiFetchedRef.current || !wikiSearchTerms?.length) return
    wikiFetchedRef.current = true
    setWikiLoading(true)
    void fetchFirstWikiThumbnail(wikiSearchTerms).then((u) => {
      setWikiUrl(u)
      setWikiLoading(false)
      if (!u) onErrRef.current?.()
    })
  }

  // DB URL 없음: 화면에 들어온 뒤 위키 썸네일 시도
  useEffect(() => {
    if (propClean || !hasWikiTerms) return
    const el = containerRef.current
    if (!el) return

    setWikiUrl(null)
    setWikiBroken(false)
    wikiFetchedRef.current = false
    setWikiLoading(false)

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          runWikiFetch.current()
          obs.disconnect()
        }
      },
      { root: null, rootMargin: '120px', threshold: 0.01 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [propClean, hasWikiTerms, termsSerialized])

  const handlePrimaryError = () => {
    setPrimaryBroken(true)
    onErrRef.current?.()
    if (wikiSearchTerms?.length && isOnline()) {
      wikiFetchedRef.current = false
      runWikiFetch.current()
    }
  }

  const showPrimaryLoading = Boolean(propClean && !primaryReady)
  const showPrimary =
    primaryReady && primaryResolved && !primaryBroken && Boolean(propClean)
  const showWiki = Boolean(wikiUrl && !wikiBroken && (!showPrimary || primaryBroken))

  const renderImg = (src: string, kind: 'primary' | 'wiki') => {
    const isData = src.startsWith('data:')
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        referrerPolicy={isData ? undefined : 'no-referrer'}
        decoding="async"
        loading="lazy"
        onLoad={() => {
          onLoadRef.current?.()
        }}
        onError={() => {
          if (kind === 'primary') handlePrimaryError()
          else {
            setWikiBroken(true)
            onErrRef.current?.()
          }
        }}
      />
    )
  }

  let inner: ReactNode
  if (showPrimaryLoading) {
    inner = <ImageSkeleton className={className} />
  } else if (showPrimary) {
    inner = renderImg(primaryResolved!, 'primary')
  } else if (showWiki && wikiUrl) {
    inner = renderImg(wikiUrl, 'wiki')
  } else if (wikiLoading) {
    inner = <ImageSkeleton className={className} />
  } else {
    inner = <NeutralImageFallback alt={alt} className={className} />
  }

  return (
    <div ref={containerRef}>
      {inner}
    </div>
  )
}
