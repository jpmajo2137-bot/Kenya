/**
 * 영어 뜻으로 Wikipedia REST 요약의 썸네일 URL을 찾습니다 (교육용 연상 이미지).
 * 브라우저에서 직접 호출; CORS 허용되는 엔드포인트 사용.
 */

/** meaning_en 기반 자동 후보보다 적합한 위키 제목 (단어별) */
const WIKI_SEARCH_OVERRIDE_BY_WORD: Record<string, string[]> = {
  // goodbye — "Goodbye" 문서 썸네일이 부적절한 경우가 있어 작별·인사 연상 이미지 우선
  'kwa heri': ['Wave (gesture)', 'Handshake', 'Bowing'],
  // the injured — Injury 등 자동 후보가 부적절할 때 응급·의료 연상
  waliojeruhiwa: ['Ambulance', 'First aid kit', 'Emergency medical services'],
  // be sick of / tired of — 자동 후보가 어색할 때 지루함·반복 연상
  'kuchoshwa na': ['Boredom', 'Traffic congestion', 'Fatigue'],
  // stab — Stab 문서 썸네일이 과할 수 있어 도구·조리 연상
  dunga: ['Kitchen knife', 'Knife', 'Blade'],
  // chip (감자칩) — "chip"만으로는 전자칩 등 부적합 연상 가능
  칩: ['Potato chip', 'Potato chips', 'Snack food'],
}

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
  const wKey = word?.trim().toLowerCase()
  if (wKey && WIKI_SEARCH_OVERRIDE_BY_WORD[wKey]) {
    return WIKI_SEARCH_OVERRIDE_BY_WORD[wKey]
  }

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
