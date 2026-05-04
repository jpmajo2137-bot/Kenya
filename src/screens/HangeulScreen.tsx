import { useMemo, useState } from 'react'
import { cn } from '../components/cn'
import { t, type Lang } from '../lib/i18n'
import { maybeShowInterstitialAd } from '../lib/admob'
import {
  BASIC_CONSONANTS,
  DOUBLE_CONSONANTS,
  BASIC_VOWELS,
  COMPOUND_VOWELS,
  composeSyllable,
  type Category,
  type Letter,
} from '../data/hangeul'
import { HANGEUL_AUDIO } from '../data/hangeulAudio'

let currentAudio: HTMLAudioElement | null = null

function stopCurrentAudio() {
  try {
    if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0 }
  } catch { /* ignore */ }
  currentAudio = null
}

async function speakKo(text: string) {
  if (!text) return
  stopCurrentAudio()

  // Supabase 사전 캐시 mp3 재생 (비용 0원)
  const prebuilt = HANGEUL_AUDIO[text]
  if (prebuilt) {
    try {
      const audio = new Audio(prebuilt)
      currentAudio = audio
      audio.onended = () => { if (currentAudio === audio) currentAudio = null }
      audio.onerror = () => { if (currentAudio === audio) currentAudio = null }
      await audio.play()
      return
    } catch { /* fall through to web speech */ }
  }

  // 최후 폴백: 브라우저 내장 Web Speech
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'ko-KR'
      utter.rate = 0.85
      utter.pitch = 1.0
      window.speechSynthesis.speak(utter)
    }
  } catch { /* ignore */ }
}

function CategoryTab({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 h-11 sm:h-12 rounded-2xl px-2 sm:px-3 text-xs sm:text-sm font-bold tracking-tight transition active:scale-95 ring-1 touch-target',
        active
          ? 'bg-[rgb(var(--purple))] text-white ring-white/30'
          : 'bg-[rgb(80,95,130)] text-white hover:bg-[rgb(100,115,150)] ring-white/20',
      )}
    >
      {label}
    </button>
  )
}

function SyllableCell({
  syllable,
  highlighted,
  onClick,
}: {
  syllable: string
  highlighted: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex aspect-square items-center justify-center rounded-xl text-lg sm:text-xl font-extrabold transition active:scale-90 ring-1',
        highlighted
          ? 'bg-[rgb(var(--purple))] text-white ring-white/40 shadow-md shadow-[rgba(var(--purple),0.4)]'
          : 'bg-white/8 text-white ring-white/10 hover:bg-white/15',
      )}
      aria-label={syllable}
    >
      {syllable}
    </button>
  )
}

function LetterCard({
  letter,
  selected,
  onClick,
}: {
  letter: Letter
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex aspect-square flex-col items-center justify-center rounded-2xl p-2 transition active:scale-95 ring-1 touch-target',
        selected
          ? 'bg-[rgb(var(--purple))] ring-white/40 shadow-lg shadow-[rgba(var(--purple),0.4)]'
          : 'bg-[rgb(60,70,95)] ring-white/15 hover:bg-[rgb(80,95,130)]',
      )}
      aria-label={`${letter.char}${letter.nameRoman ? ` (${letter.nameRoman})` : ''} (${letter.roman})`}
    >
      <span className="text-3xl sm:text-4xl font-black leading-none text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]">
        {letter.char}
      </span>
      {letter.nameRoman ? (
        <span className="mt-1 text-[10px] sm:text-xs font-extrabold text-white leading-none whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          {letter.nameRoman}
        </span>
      ) : null}
      <span className="mt-0.5 text-[8px] sm:text-[10px] font-bold text-white/80 uppercase tracking-tight whitespace-nowrap">
        {letter.roman}
      </span>
    </button>
  )
}

export function HangeulScreen({ lang }: { lang: Lang }) {
  const [category, setCategory] = useState<Category>('basic-consonant')
  const [selected, setSelected] = useState<Letter>(BASIC_CONSONANTS[0])
  // 결합표에서 마지막으로 탭한 음절(보라색 강조용). selected가 바뀌면 자동으로 letter.syllable 로 리셋된다.
  const [activeSyllable, setActiveSyllable] = useState<string>(BASIC_CONSONANTS[0].syllable)

  const letters = useMemo<Letter[]>(() => {
    switch (category) {
      case 'basic-consonant':
        return BASIC_CONSONANTS
      case 'double-consonant':
        return DOUBLE_CONSONANTS
      case 'basic-vowel':
        return BASIC_VOWELS
      case 'compound-vowel':
        return COMPOUND_VOWELS
    }
  }, [category])

  const handleSelectCategory = (c: Category) => {
    if (c === category) return
    setCategory(c)
    const next =
      c === 'basic-consonant'
        ? BASIC_CONSONANTS[0]
        : c === 'double-consonant'
        ? DOUBLE_CONSONANTS[0]
        : c === 'basic-vowel'
        ? BASIC_VOWELS[0]
        : COMPOUND_VOWELS[0]
    setSelected(next)
    setActiveSyllable(next.syllable)
    maybeShowInterstitialAd()
  }

  const handleSelectLetter = (letter: Letter) => {
    setSelected(letter)
    setActiveSyllable(letter.syllable)
    // 자음은 정식 이름(기역, 니은…)으로, 모음은 글자 자체로 발음.
    speakKo(letter.name ?? letter.syllable)
  }

  const handleSelectSyllable = (syl: string) => {
    setActiveSyllable(syl)
    speakKo(syl)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-4 sm:p-5 app-banner backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-[rgb(var(--purple))] text-3xl sm:text-4xl font-black text-white shadow-lg shadow-[rgba(var(--purple),0.4)]">
            {'\uAC00'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg sm:text-xl font-extrabold text-white leading-tight">
              {t('hangeulTitle', lang)}
            </div>
            <div className="text-xs sm:text-sm text-white/70 mt-0.5">
              {t('hangeulDesc', lang)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 rounded-3xl p-1.5 sm:p-2 app-banner backdrop-blur">
        <CategoryTab
          active={category === 'basic-consonant'}
          label={`${t('hangeulConsonants', lang)} \u00B7 ${t('hangeulBasic', lang)}`}
          onClick={() => handleSelectCategory('basic-consonant')}
        />
        <CategoryTab
          active={category === 'double-consonant'}
          label={`${t('hangeulConsonants', lang)} \u00B7 ${t('hangeulDouble', lang)}`}
          onClick={() => handleSelectCategory('double-consonant')}
        />
        <CategoryTab
          active={category === 'basic-vowel'}
          label={`${t('hangeulVowels', lang)} \u00B7 ${t('hangeulBasic', lang)}`}
          onClick={() => handleSelectCategory('basic-vowel')}
        />
        <CategoryTab
          active={category === 'compound-vowel'}
          label={`${t('hangeulVowels', lang)} \u00B7 ${t('hangeulCompound', lang)}`}
          onClick={() => handleSelectCategory('compound-vowel')}
        />
      </div>

      <div className="rounded-3xl p-4 sm:p-5 app-banner backdrop-blur">
        <div className="flex items-start gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => {
              setActiveSyllable(selected.syllable)
              speakKo(selected.name ?? selected.syllable)
            }}
            className="flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-[rgb(var(--purple))] to-[rgb(80,40,200)] text-white shadow-xl shadow-[rgba(var(--purple),0.5)] transition active:scale-95 ring-2 ring-white/20"
            aria-label={`Play ${selected.name ?? selected.char}`}
          >
            <span className="text-6xl sm:text-7xl font-black leading-none drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)]">
              {selected.char}
            </span>
          </button>
          <div className="flex-1 min-w-0 space-y-2">
            {selected.name ? (
              <div>
                <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/60">
                  {t('hangeulLetterName', lang)}
                </div>
                <button
                  type="button"
                  onClick={() => speakKo(selected.name!)}
                  className="mt-0.5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1 transition active:scale-95 hover:bg-white/15"
                >
                  <span className="text-lg sm:text-xl font-extrabold text-white">
                    {selected.nameRoman ?? selected.name}
                  </span>
                  <span className="text-base">{'\uD83D\uDD0A'}</span>
                </button>
              </div>
            ) : null}
            <div>
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/60">
                {t('hangeulRomanization', lang)}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-white">
                {selected.roman}
              </div>
            </div>
            <div>
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/60">
                {t('hangeulExample', lang)}
              </div>
              <button
                type="button"
                onClick={() => speakKo(selected.exampleKo)}
                className="mt-0.5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-left transition active:scale-95 hover:bg-white/15"
              >
                <span className="text-base sm:text-lg font-extrabold text-white">
                  {selected.exampleKo}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-white/70">
                  ({selected.exampleRoman})
                </span>
                <span className="text-base">{'\uD83D\uDD0A'}</span>
              </button>
              <div className="mt-1 text-xs sm:text-sm font-semibold text-white/80">
                {'\u2192 '}
                {lang === 'sw' ? selected.exampleSw : selected.exampleKoMeaning}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 text-center text-[11px] sm:text-xs text-white/60 italic">
          {t('hangeulTapToHear', lang)}
        </div>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-2.5 rounded-3xl p-3 sm:p-4 app-banner backdrop-blur">
        {letters.map((letter) => (
          <LetterCard
            key={letter.char}
            letter={letter}
            selected={selected.char === letter.char}
            onClick={() => handleSelectLetter(letter)}
          />
        ))}
      </div>

      <div className="rounded-3xl p-3 sm:p-4 app-banner backdrop-blur">
        <div className="mb-2 sm:mb-3 flex items-center justify-between gap-2 px-1">
          <div className="text-sm sm:text-base font-extrabold text-white">
            {t('hangeulCombineTitle', lang)}
          </div>
          <div className="text-[10px] sm:text-xs font-semibold text-white/60">
            {selected.kind === 'consonant'
              ? t('hangeulCombineConsonantHint', lang)
              : t('hangeulCombineVowelHint', lang)}
          </div>
        </div>
        {selected.kind === 'consonant' ? (
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {BASIC_VOWELS.map((vowel) => {
              const syl = composeSyllable(selected.jamoIdx, vowel.jamoIdx)
              return (
                <div key={vowel.char} className="flex flex-col items-center gap-1">
                  <SyllableCell
                    syllable={syl}
                    highlighted={syl === activeSyllable}
                    onClick={() => handleSelectSyllable(syl)}
                  />
                  <div className="text-[10px] sm:text-xs font-bold text-white/60">
                    {selected.char}
                    {'+'}
                    {vowel.char}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {BASIC_CONSONANTS.map((cons) => {
              const syl = composeSyllable(cons.jamoIdx, selected.jamoIdx)
              return (
                <div key={cons.char} className="flex flex-col items-center gap-1">
                  <SyllableCell
                    syllable={syl}
                    highlighted={syl === activeSyllable}
                    onClick={() => handleSelectSyllable(syl)}
                  />
                  <div className="text-[10px] sm:text-xs font-bold text-white/60">
                    {cons.char}
                    {'+'}
                    {selected.char}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
