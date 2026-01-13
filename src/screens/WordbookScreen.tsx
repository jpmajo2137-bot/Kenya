import { useMemo, useState } from 'react'
import type { VocabItem } from '../lib/types'
import type { Action } from '../app/state'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Input, TextArea } from '../components/TextField'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { isDue } from '../lib/srs'
import type { Deck } from '../lib/types'
import { t, type Lang } from '../lib/i18n'

type Draft = {
  deckId: string
  sw: string
  ko: string
  en: string
  pos: string
  tags: string
  example: string
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

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const x of items) for (const tg of x.tags) set.add(tg)
    return [allLabel, ...Array.from(set).sort((a, b) => a.localeCompare(b, lang === 'sw' ? 'en' : 'ko'))]
  }, [items, allLabel, lang])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((x) => (tag === allLabel ? true : x.tags.includes(tag)))
      .filter((x) => {
        if (!q) return true
        return (
          x.sw.toLowerCase().includes(q) ||
          x.ko.toLowerCase().includes(q) ||
          (x.en ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
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
  const dueLabel = lang === 'sw' ? 'Mapitio' : '복습대상'
  const exampleLabel = lang === 'sw' ? 'Mfano' : '예문'
  const noteLabel = lang === 'sw' ? 'Maelezo' : '메모'

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
          <Button variant="primary" onClick={openCreate}>
            {t('addWord', lang)}
          </Button>
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
          const due = isDue(x.srs)
          return (
            <div key={x.id} className="rounded-3xl p-5 app-card backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-extrabold text-white">{x.sw}</div>
                    {due ? (
                      <Badge className="border-[rgb(var(--green))]/25 bg-[rgb(var(--green))]/15 text-white">
                        {dueLabel}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 text-base font-bold text-white/95">{x.ko}</div>
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

              {x.tags.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {x.tags.map((tg) => (
                    <Badge key={tg}>{tg}</Badge>
                  ))}
                </div>
              ) : null}

              {x.example ? <div className="mt-3 text-sm font-semibold text-white/85">{exampleLabel}: {x.example}</div> : null}
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
            <div className="text-xs font-semibold text-white/70">{t('swahili', lang)} (sw) *</div>
            <Input value={draft.sw} onChange={(e) => setDraft((d) => ({ ...d, sw: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white/70">{t('korean', lang)} (ko) *</div>
            <Input value={draft.ko} onChange={(e) => setDraft((d) => ({ ...d, ko: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white/70">{t('english', lang)} (en)</div>
            <Input value={draft.en} onChange={(e) => setDraft((d) => ({ ...d, en: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-white/70">{lang === 'sw' ? 'Aina ya neno' : '품사'} (pos)</div>
            <Input value={draft.pos} onChange={(e) => setDraft((d) => ({ ...d, pos: e.target.value }))} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-white/70">{lang === 'sw' ? 'Lebo (comma)' : '태그 (쉼표로 구분)'}</div>
            <Input value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-white/70">{t('example', lang)}</div>
            <TextArea
              value={draft.example}
              onChange={(e) => setDraft((d) => ({ ...d, example: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-white/70">{t('note', lang)}</div>
            <TextArea value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  )
}


