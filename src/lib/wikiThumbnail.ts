/**
 * 영어 뜻으로 Wikipedia REST 요약의 썸네일 URL을 찾습니다 (교육용 연상 이미지).
 * 브라우저에서 직접 호출; CORS 허용되는 엔드포인트 사용.
 */

function stripKoreanSegments(text: string): string {
  if (!text.trim()) return text
  const segments = text.split(';').map((s) => s.trim()).filter(Boolean)
  const latin = segments.filter((s) => !/[\uAC00-\uD7A3]/.test(s))
  return latin.length ? latin.join('; ') : text
}

/** "to stab; to prick" → Stab, Stabbing, Prick, … */
export function wikiSearchTitlesFromMeaningEn(
  meaningEn: string | null | undefined,
  word?: string | null,
): string[] {
  const cleaned = stripKoreanSegments((meaningEn ?? '').trim())
  const titles = new Set<string>()

  const addTitle = (raw: string) => {
    const t = raw.trim()
    if (t.length < 2) return
    if (t.length > 80) return
    titles.add(t.charAt(0).toUpperCase() + t.slice(1))
  }

  const segments = cleaned.split(/[;/]/).map((s) => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const withoutTo = seg.replace(/^to\s+(be\s+)?/i, '').trim()
    if (!withoutTo) continue
    const parts = withoutTo.split(/\s+/).filter(Boolean)
    const head = parts[0]?.replace(/[^a-zA-Z-]/g, '') ?? ''
    if (head.length < 2) continue
    const Cap = head.charAt(0).toUpperCase() + head.slice(1).toLowerCase()
    addTitle(Cap)
    if (!Cap.toLowerCase().endsWith('ing')) {
      addTitle(`${Cap}ing`)
    }
    if (parts.length >= 2) {
      const phrase = parts
        .slice(0, 4)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
      addTitle(phrase)
    }
  }

  if (word?.trim()) {
    const w = word.trim()
    if (/^[a-zA-Z][a-zA-Z\s-]{1,60}$/.test(w)) {
      addTitle(w.split(/\s+/)[0] ?? w)
    }
  }

  return [...titles].slice(0, 10)
}

async function fetchSummaryThumb(title: string): Promise<string | null> {
  const pathTitle = encodeURIComponent(title.replace(/ /g, '_'))
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${pathTitle}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const data = (await res.json()) as { thumbnail?: { source?: string }; type?: string }
  if (data.type === 'disambiguation') return null
  const src = data.thumbnail?.source
  return typeof src === 'string' && src.startsWith('http') ? src : null
}

/** 후보 제목을 순서대로 시도해 첫 썸네일 URL 반환 */
export async function fetchFirstWikiThumbnail(titles: string[]): Promise<string | null> {
  for (const t of titles) {
    try {
      const u = await fetchSummaryThumb(t)
      if (u) return u
    } catch {
      /* 다음 후보 */
    }
  }
  return null
}
