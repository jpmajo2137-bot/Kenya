import { useMemo, useState, useEffect, useCallback } from 'react'
import type { VocabItem } from '../lib/types'
import type { Action } from '../app/state'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Input } from '../components/TextField'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import type { Deck } from '../lib/types'
import { t, type Lang } from '../lib/i18n'
import { FlashcardScreen } from './FlashcardScreen'

type Draft = {
  deckId: string
  sw: string
  ko: string
  en: string
  pos: string
  tags: string
  example: string
  exampleKo: string
  exampleEn: string
  note: string
}

function toDraft(item?: VocabItem): Draft {
  return {
    deckId: item?.deckId ?? '',
    sw: item?.sw ?? '',
    ko: item?.ko ?? '',
    en: item?.en ?? '',
    pos: item?.pos ?? '',
    tags: item?.tags?.join(', ') ?? '',
    example: item?.example ?? '',
    exampleKo: item?.exampleKo ?? '',
    exampleEn: item?.exampleEn ?? '',
    note: item?.note ?? '',
  }
}

function parseTags(raw: string) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10)
}

export function WordbookScreen({
  items,
  decks,
  fixedDeckId,
  showEnglish,
  dispatch,
  lang,
}: {
  items: VocabItem[]
  decks: Deck[]
  fixedDeckId?: string
  showEnglish: boolean
  dispatch: (a: Action) => void
  lang: Lang
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const allLabel = lang === 'sw' ? 'Yote' : '전체'
  const [tag, setTag] = useState<string>(allLabel)
  const [flashcardMode, setFlashcardMode] = useState(false)

  // 플래시카드 시작
  const startFlashcard = useCallback(() => {
    window.history.pushState({ screen: 'userDeckFlashcard' }, '')
    setFlashcardMode(true)
  }, [])

  // 플래시카드 종료
  const closeFlashcard = useCallback(() => {
    setFlashcardMode(false)
  }, [])

  // 뒤로가기 핸들러
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { screen?: string } | null
      if (flashcardMode && state?.screen !== 'userDeckFlashcard') {
        setFlashcardMode(false)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [flashcardMode])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const x of items) {
      const tags = x?.tags ?? []
      for (const tg of tags) set.add(tg)
    }
    return [allLabel, ...Array.from(set).sort((a, b) => a.localeCompare(b, lang === 'sw' ? 'en' : 'ko'))]
  }, [items, allLabel, lang])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((x) => {
        if (!x) return false
        const tags = x.tags ?? []
        return tag === allLabel ? true : tags.includes(tag)
      })
      .filter((x) => {
        if (!x) return false
        if (!q) return true
        return (
          (x.sw ?? '').toLowerCase().includes(q) ||
          (x.ko ?? '').toLowerCase().includes(q) ||
          (x.en ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0))
  }, [items, query, tag, allLabel])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<VocabItem | null>(null)
  const [draft, setDraft] = useState<Draft>(toDraft())
  const defaultDeckId = fixedDeckId ?? decks[0]?.id ?? ''

  const openCreate = () => {
    setEditing(null)
    setDraft({ ...toDraft(), deckId: defaultDeckId })
    setOpen(true)
  }

  const openEdit = (item: VocabItem) => {
    setEditing(item)
    setDraft(toDraft(item))
    setOpen(true)
  }

  const save = () => {
    if (!draft.sw.trim()) {
      toast({ title: t('enterSwahili', lang) })
      return
    }
    if (!draft.ko.trim()) {
      toast({ title: t('enterKorean', lang) })
      return
    }
    const payload = {
      deckId: fixedDeckId ?? draft.deckId,
      sw: draft.sw.trim(),
      ko: draft.ko.trim(),
      en: draft.en.trim() || undefined,
      pos: draft.pos.trim() || undefined,
      tags: parseTags(draft.tags),
      example: draft.example.trim() || undefined,
      exampleKo: draft.exampleKo.trim() || undefined,
      exampleEn: draft.exampleEn.trim() || undefined,
      note: draft.note.trim() || undefined,
    }
    if (editing) {
      dispatch({ type: 'update', id: editing.id, patch: payload })
      toast({ title: t('wordUpdated', lang), description: `${payload.sw}` })
    } else {
      dispatch({ type: 'add', item: payload })
      toast({ title: t('wordAdded', lang), description: `${payload.sw}` })
    }
    setOpen(false)
  }

  const del = (item: VocabItem) => {
    const confirmMsg = lang === 'sw' ? `Futa?\n\n${item.sw} — ${item.ko}` : `삭제할까요?\n\n${item.sw} — ${item.ko}`
    const ok = window.confirm(confirmMsg)
    if (!ok) return
    dispatch({ type: 'delete', id: item.id })
    toast({ title: t('wordDeleted', lang), description: item.sw })
  }

  const wordsLabel = lang === 'sw' ? 'Maneno' : '단어'
  const totalLabel = lang === 'sw' ? 'Jumla' : '총'
  const showingLabel = lang === 'sw' ? 'Inaonyeshwa' : '표시'
  const searchPlaceholder = lang === 'sw' ? 'Tafuta (sw/ko/en)' : '검색 (sw/ko/en)'
  const tagTip = lang === 'sw' ? 'Kidokezo: Tofautisha lebo na comma' : '팁: 태그는 "쉼표(,)"로 구분'
  const exampleLabel = lang === 'sw' ? 'Mfano' : '예문'
  const noteLabel = lang === 'sw' ? 'Maelezo' : '메모'

  // 플래시카드 모드
  if (flashcardMode && items.length > 0) {
    return (
      <FlashcardScreen
        lang={lang}
        mode={lang === 'sw' ? 'sw' : 'ko'}
        onClose={closeFlashcard}
        userWords={items}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-3xl p-5 app-card backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-2xl font-extrabold text-white">{wordsLabel}</div>
            <div className="text-sm font-semibold text-white/70">
              {totalLabel} {items.length} · {showingLabel} {filtered.length}
            </div>
          </div>
          <div className="flex gap-2">
            {items.length > 0 && (
              <button
                onClick={startFlashcard}
                className="rounded-xl px-4 py-2 text-sm font-bold bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white hover:from-indigo-500/50 hover:to-purple-500/50 active:scale-95 transition border border-indigo-400/30 touch-target"
              >
                📇 {lang === 'sw' ? 'Kadi' : '카드'}
              </button>
            )}
            <Button variant="primary" onClick={openCreate}>
              {t('addWord', lang)}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select
            className="h-12 w-full rounded-2xl border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white outline-none ring-[rgb(var(--purple))]/25 focus:ring-4"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            {allTags.map((tg) => (
              <option key={tg} value={tg}>
                {tg}
              </option>
            ))}
          </select>
          <div className="hidden sm:block self-center text-right text-sm font-semibold text-white/60">
            {tagTip}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((x) => {
          if (!x) return null
          const tags = x.tags ?? []
          return (
            <div key={x.id} className="rounded-3xl p-5 app-card backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-extrabold text-white">{x.sw ?? ''}</div>
                  </div>
                  <div className="mt-2 text-base font-bold text-white/95">{x.ko ?? ''}</div>
                  {showEnglish && x.en ? <div className="mt-1 text-sm font-semibold text-white/70">{x.en}</div> : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(x)}>
                    {lang === 'sw' ? 'Hariri' : '수정'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => del(x)}>
                    {t('delete', lang)}
                  </Button>
                </div>
              </div>

              {tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tg) => (
                    <Badge key={tg}>{tg}</Badge>
                  ))}
                </div>
              ) : null}

              {x.example ? (
                <div className="mt-3 space-y-1">
                  <div className="text-sm font-semibold text-white/85">{exampleLabel}: {x.example}</div>
                  {x.exampleKo ? <div className="text-xs font-semibold text-white/70 pl-2">→ {x.exampleKo}</div> : null}
                  {x.exampleEn ? <div className="text-xs font-semibold text-white/60 pl-2">→ {x.exampleEn}</div> : null}
                </div>
              ) : null}
              {x.note ? <div className="mt-1 text-xs font-semibold text-white/65">{noteLabel}: {x.note}</div> : null}
            </div>
          )
        })}
      </div>

      <Modal
        open={open}
        title={editing ? t('editWord', lang) : t('newWord', lang)}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('cancel', lang)}
            </Button>
            <Button onClick={save}>{t('save', lang)}</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {!fixedDeckId ? (
            <div className="sm:col-span-2 space-y-1">
              <div className="text-xs font-semibold text-white/70">{t('wordbook', lang)}</div>
              <select
                className="h-12 w-full rounded-2xl border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white outline-none ring-[rgb(var(--purple))]/25 focus:ring-4"
                value={draft.deckId}
                onChange={(e) => setDraft((d) => ({ ...d, deckId: e.target.value }))}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white/70">{t('korean', lang)} (ko) *</div>
            <Input value={draft.ko} onChange={(e) => setDraft((d) => ({ ...d, ko: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white/70">{t('swahili', lang)} (sw) *</div>
            <Input value={draft.sw} onChange={(e) => setDraft((d) => ({ ...d, sw: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white/70">{t('english', lang)} (en)</div>
            <Input value={draft.en} onChange={(e) => setDraft((d) => ({ ...d, en: e.target.value }))} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-white/70">{lang === 'sw' ? 'Mfano (Kikorea)' : '예문 (한국어)'}</div>
            <Input
              value={draft.example}
              onChange={(e) => setDraft((d) => ({ ...d, example: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-white/70">{lang === 'sw' ? 'Mfano (Kiswahili)' : '예문 (스와힐리어)'}</div>
            <Input
              value={draft.exampleKo}
              onChange={(e) => setDraft((d) => ({ ...d, exampleKo: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-white/70">{lang === 'sw' ? 'Mfano (Kiingereza)' : '예문 (영어)'}</div>
            <Input
              value={draft.exampleEn}
              onChange={(e) => setDraft((d) => ({ ...d, exampleEn: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}


