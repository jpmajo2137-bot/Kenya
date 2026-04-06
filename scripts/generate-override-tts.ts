/**
 * 교정된 TTS 음성을 Azure TTS로 일괄 생성 → Supabase Storage 업로드 → DB 업데이트
 *
 * 사용: npx tsx scripts/generate-override-tts.ts
 *
 * 카테고리:
 *   A. 단어(word) 음성 교정 — WORD_TTS_PRONUNCIATION_OVERRIDE + WORD_DISPLAY_OVERRIDE
 *   B. 영어 뜻(meaning_en) 음성 — EN_FORCE_TTS
 *   C. 예문(example) 음성 — EXAMPLE_TTS_OVERRIDE
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const AZURE_TTS_KEY = process.env.AZURE_SPEECH_KEY || process.env.VITE_AZURE_TTS_KEY!
const AZURE_TTS_REGION = process.env.AZURE_SPEECH_REGION || process.env.VITE_AZURE_TTS_REGION || 'koreacentral'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Voice defaults ───
const VOICE_MAP: Record<string, string> = {
  ko: process.env.VITE_AZURE_TTS_KO_VOICE || 'ko-KR-SunHiNeural',
  sw: process.env.VITE_AZURE_TTS_SW_VOICE || 'sw-KE-ZuriNeural',
  en: process.env.VITE_AZURE_TTS_EN_VOICE || 'en-US-JennyNeural',
}
const DEFAULT_RATE = process.env.VITE_AZURE_TTS_SPEED || '0.9'

// ─── Azure TTS (Node.js) ───
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function langCodeFromVoice(voiceName: string): string {
  const parts = voiceName.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

async function azureTts(
  text: string,
  lang: string,
  voice?: string,
  speed?: string,
  ssmlContent?: string,
): Promise<ArrayBuffer> {
  const voiceName = voice || VOICE_MAP[lang] || VOICE_MAP.en
  const langCode = langCodeFromVoice(voiceName)
  const rate = speed || DEFAULT_RATE
  const content = ssmlContent ?? escapeXml(text)

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langCode}'>
  <voice name='${voiceName}'>
    <prosody rate='${rate}'>
      ${content}
    </prosody>
  </voice>
</speak>`

  const endpoint = `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      'User-Agent': 'KenyaVocabApp',
    },
    body: ssml,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Azure TTS HTTP ${response.status}: ${errorText}`)
  }

  return response.arrayBuffer()
}

// ─── Supabase upload ───
async function uploadAudio(path: string, audio: ArrayBuffer): Promise<string> {
  const blob = new Blob([audio], { type: 'audio/mpeg' })
  const { data, error } = await supabase.storage.from('vocabaudio').upload(path, blob, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('vocabaudio').getPublicUrl(data.path)
  return urlData.publicUrl
}

// Small delay to avoid API rate limits
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ═══════════════════════════════════════════════════════════
// A. 단어(word) 음성 교정
// ═══════════════════════════════════════════════════════════

const WORD_TTS_PRONUNCIATION_OVERRIDE = new Set(['함부로 버리다', '큐대', 'marker', '마커', 'glovu'])

const WORD_TTS_LANG_OVERRIDE: Record<string, string> = {
  marker: 'en',
  마커: 'en',
}

const WORD_TTS_TEXT_OVERRIDE: Record<string, string> = {
  마커: 'marker',
  glovu: 'glovu za ndondi',
}

const WORD_KEEP_ORIGINAL_AUDIO = new Set(['통계의', '태양광의'])

const WORD_DISPLAY_OVERRIDE: Record<string, { word: string; pron: string }> = {
  우세: { word: '우세하다', pron: 'usehada' },
  매력적이다: { word: '매력적인', pron: 'maeryeokjeogin' },
  끝없는: { word: '끝없는', pron: 'kkeudeomneun' },
  끝없다: { word: '끝없는', pron: 'kkeudeomneun' },
  다혈질이다: { word: '다혈질인', pron: 'dahyeoljirin' },
  충성스럽다: { word: '충성스러운', pron: 'chungseongseureon' },
  끊임없다: { word: '끊임없는', pron: 'kkeunim-eomneun' },
  충격적이다: { word: '충격적인', pron: 'chunggyeokjeogin' },
  이국적이다: { word: '이국적인', pron: 'igukjeogin' },
  합리적이다: { word: '합리적인', pron: 'hamnijeogin' },
  사소하다: { word: '사소한', pron: 'sasohan' },
  부정적이다: { word: '부정적인', pron: 'bujeongjeogin' },
  방어적이다: { word: '방어적인', pron: 'bangeojeogin' },
  현대적이다: { word: '현대적인', pron: 'hyeondaejeogin' },
  실용적이다: { word: '실용적인', pron: 'sillyongjeogin' },
  역사적이다: { word: '역사적인', pron: 'yeoksajeogin' },
  광범위하다: { word: '광범위한', pron: 'gwangbeomwihan' },
  노골적이다: { word: '노골적인', pron: 'nogoljeogin' },
  인상적이다: { word: '인상적인', pron: 'insangjeogin' },
  치명적이다: { word: '치명적인', pron: 'chimyeongjeogin' },
  생생하다: { word: '생생한', pron: 'saengsaenghan' },
  앞서: { word: '앞서 있는', pron: 'apseo inneun' },
  차갑다: { word: '차가운', pron: 'chagaun' },
  구식이다: { word: '구식의', pron: 'gusigui' },
  과도하다: { word: '과도한', pron: 'gwadohan' },
  과도: { word: '과도한', pron: 'gwadohan' },
  예비: { word: '예비(의)', pron: 'yebiui' },
  예비의: { word: '예비(의)', pron: 'yebiui' },
  기념의: { word: '기념(의)', pron: 'ginyeomui' },
  '방과 후 남기': { word: '방과 후', pron: 'banggwa hu' },
  실제의: { word: '실제(의)', pron: 'siljeoui' },
  감상: { word: '감상하다', pron: 'gamsanghada' },
  상징적이다: { word: '상징적인', pron: 'sangjingjeogin' },
  대략적이다: { word: '대략적인', pron: 'daeryakjeogin' },
  자치: { word: '자치권', pron: 'jachigwon' },
  크리스털: { word: '크리스탈', pron: 'keuriseutal' },
  배출: { word: '배출가스', pron: 'baechulgaseu' },
  지적이다: { word: '지적이다', pron: 'jijeokida' },
  현실적이다: { word: '현실적인', pron: 'hyeonsiljeogin' },
  인공적이다: { word: '인공적인', pron: 'ingongjeogin' },
  어이없다: { word: '어이없는', pron: 'eoieomneun' },
  '-(으)ㄹ 거예요': { word: '거예요', pron: 'geoyeyo' },
  결정적이다: { word: '결정적인', pron: 'gyeoljeongjeogin' },
  간접적이다: { word: '간접적인', pron: 'ganjeopjeogin' },
  낙관적이다: { word: '낙관적인', pron: 'nakgwanjeogin' },
  엄청나다: { word: '엄청난', pron: 'eomcheongnan' },
  구체적이다: { word: '구체적인', pron: 'guchejeogin' },
  행정적이다: { word: '행정적인', pron: 'haengjeongjeogin' },
  혁신적이다: { word: '혁신적인', pron: 'hyeoksinjeogin' },
  이념적이다: { word: '이념적인', pron: 'inyeomjeogin' },
  민족적이다: { word: '민족적인', pron: 'minjokjeogin' },
  독점적이다: { word: '독점적인', pron: 'dokjeomjeogin' },
  통계의: { word: '통계(의)', pron: 'tonggyeui' },
  태양광의: { word: '태양광(의)', pron: 'taeyanggwang-ui' },
  범례: { word: '지도 범례', pron: 'jido beomnye' },
  입히다: { word: '상처를 입히다', pron: 'sangcheoreul iphida' },
  끈질기다: { word: '끈질긴', pron: 'kkeunjilgin' },
  두드러지다: { word: '두드러진', pron: 'dudeureojin' },
  연극적이다: { word: '연극적인', pron: 'yeongeukjeogin' },
  잦다: { word: '잦은', pron: 'jajeun' },
  glovu: { word: 'glovu za ndondi', pron: 'GLO-vu za NDO-ndi' },
}

const WORD_VOICE_OVERRIDE: Record<string, string> = {
  glovu: 'sw-TZ-RehemaNeural',
  범례: 'ko-KR-SoonBokNeural',
  이념적이다: 'ko-KR-SeoHyeonNeural',
  민족적이다: 'ko-KR-SeoHyeonNeural',
  독점적이다: 'ko-KR-JiMinNeural',
}

const WORD_SPEED_OVERRIDE: Record<string, string> = {
  범례: '0.75',
  민족적이다: '0.85',
  독점적이다: '0.85',
}

const WORD_SSML_OVERRIDE: Record<string, string> = {}

// Collect unique words that need TTS regeneration
function getWordOverrideTargets(): Map<string, { ttsText: string; lang: string; voice?: string; speed?: string; ssml?: string }> {
  const targets = new Map<string, { ttsText: string; lang: string; voice?: string; speed?: string; ssml?: string }>()

  // Words in WORD_TTS_PRONUNCIATION_OVERRIDE need their audio regenerated
  for (const word of WORD_TTS_PRONUNCIATION_OVERRIDE) {
    const ttsText = WORD_TTS_TEXT_OVERRIDE[word] || (WORD_DISPLAY_OVERRIDE[word]?.word) || word
    const lang = WORD_TTS_LANG_OVERRIDE[word] || 'ko'
    targets.set(word, {
      ttsText,
      lang,
      voice: WORD_VOICE_OVERRIDE[word],
      speed: WORD_SPEED_OVERRIDE[word],
      ssml: WORD_SSML_OVERRIDE[word],
    })
  }

  // Words in WORD_DISPLAY_OVERRIDE that change the word text also need audio regenerated
  for (const [dbWord, override] of Object.entries(WORD_DISPLAY_OVERRIDE)) {
    if (WORD_KEEP_ORIGINAL_AUDIO.has(dbWord)) continue
    if (targets.has(dbWord)) continue // already handled above
    if (override.word === dbWord) continue // display same as DB, no audio change needed

    const lang = WORD_TTS_LANG_OVERRIDE[dbWord] || 'ko'
    targets.set(dbWord, {
      ttsText: WORD_TTS_TEXT_OVERRIDE[dbWord] || override.word,
      lang,
      voice: WORD_VOICE_OVERRIDE[dbWord],
      speed: WORD_SPEED_OVERRIDE[dbWord],
      ssml: WORD_SSML_OVERRIDE[dbWord],
    })
  }

  // Extra voice/speed/ssml overrides not covered above
  for (const word of Object.keys(WORD_VOICE_OVERRIDE)) {
    if (targets.has(word)) continue
    const ttsText = WORD_TTS_TEXT_OVERRIDE[word] || (WORD_DISPLAY_OVERRIDE[word]?.word) || word
    const lang = WORD_TTS_LANG_OVERRIDE[word] || 'ko'
    targets.set(word, {
      ttsText,
      lang,
      voice: WORD_VOICE_OVERRIDE[word],
      speed: WORD_SPEED_OVERRIDE[word],
      ssml: WORD_SSML_OVERRIDE[word],
    })
  }

  return targets
}

// ═══════════════════════════════════════════════════════════
// B. 영어 뜻(meaning_en) 음성
// ═══════════════════════════════════════════════════════════

const EN_FORCE_TTS = new Set(['watch', 'future, later', 'an elderly man', 'coal, charcoal', 'much, many', 'lamp; light/torch', 'news', 'a little', 'slowly', 'parents', 'to be, to be located', 'usually', 'repeat', 'especially', 'interesting', 'a drag; something boring/annoying', 'save', 'package', 'queen', 'yet, still', 'creep, crawl', 'crawl', 'understand, grasp', 'dust, wipe', 'to be cute', 'operate', 'engaged, busy', 'to look after', 'to be possible', 'to be aware', 'special offer', 'captain', 'form', 'brief', 'collapse, fall down', 'pin', 'legitimate; legal/valid', 'adjust, adapt', 'to adjust, adapt', 'to be tight', 'to be located', 'bin', 'crop', 'zipper', 'calm down', 'to me', 'to be relieved', 'regarding', 'decide', 'reverse', 'bear, give birth', 'to bear, give birth', 'stunning; extremely beautiful/impressive', 'call', 'late', 'male rabbit', 'turn; change direction/position', 'introduce', 'shock, fright, alarm', 'to be enough', 'prefer', 'stray (animal)', 'institution', 'programming schedule', 'abandon', 'apparent/obvious', 'rationally', 'immediate, instant', 'harden, thicken', 'to mount; to attach onto a backing/support', 'jump at/on, pounce on', 'hire', 'combination, code', 'controversial', 'dangerous', 'to preach', 'to be discouraged', 'to divine; to predict/foretell', 'persuade', 'fishing; the activity/industry of catching fish', 'preacher', 'meanwhile', 'complicated', 'desirable', 'adopt/approve', 'construction', 'in danger, at risk', 'convey', 'military', 'membership', 'method', 'to nominate, appoint', 'nominate, appoint', 'nation; a country/state', 'peasant; poor farm worker/farmer', 'to accompany / go together', 'theatrical', 'eager', 'to be eager', 'proud', 'authority', 'visual aid', 'activity', 'remaining, balance', 'inappropriate', 'religious person, believer', 'to make, force', 'make, force', 'symbol, sign, character', 'move', 'formal', 'interaction', 'idea, thinking', 'wisdom, good sense', 'to benefit (from), to gain', 'surrender', 'randomly', 'gambling', 'to dub; to give a nickname/title', 'enough', 'online', 'rational', 'to doze off, to be drowsy', 'ever, on earth', 'unresolved', 'bridge of the nose', 'buoy', 'private, secret', 'from the provinces', 'to cater; to provide food/service for an event', 'to stress someone; to make someone tense/worried', 'to jam; to shove/pack in', 'to be infected, to catch', 'turnout; junction/turn-off point', 'unfair', 'dare', 'around', 'violate', 'comedian', 'distinctly', 'to make good use', 'inflate', 'conceive, become pregnant', 'to conceive, become pregnant', 'unpleasant', 'physical; relating to the body/material', 'wander aimlessly', 'to wander aimlessly', 'medical check-up', 'flexible', 'approach', 'worthwhile; worth the time/effort', 'management', "blacksmith's workshop", 'to be alleged', 'out', 'beam', 'distant', 'tactical; relating to tactics/strategy', 'without emotion', 'relocation, transfer', 'insertion; adding/putting in', 'programming schedule', 'programming', 'cocktail', 'elbow, accidentally hit or push with the elbow', 'to elbow, accidentally hit or push with the elbow', 'supportive; agreeing with and backing someone/something', 'the latest news', 'empirical; based on observation/experiment', 'in critical condition', 'optic', 'formal dance', 'restoration; renovation/repair', 'mockery, irony', 'stair/stairs'])

const EN_VOICE_OVERRIDE: Record<string, string> = {
  watch: 'en-US-JennyNeural',
  desirable: 'en-US-JennyNeural',
  eager: 'en-US-JennyNeural',
  'to be eager': 'en-US-JennyNeural',
  inappropriate: 'en-US-JennyNeural',
  interaction: 'en-US-JennyNeural',
  unfair: 'en-US-JennyNeural',
  unpleasant: 'en-US-JennyNeural',
  flexible: 'en-US-JennyNeural',
  beam: 'en-US-JennyNeural',
}

const EN_TTS_TEXT_OVERRIDE: Record<string, string> = {
  'lamp; light/torch': 'lamp; light torch',
  'a drag; something boring/annoying': 'a drag; something boring annoying',
  'legitimate; legal/valid': 'legitimate; legal valid',
  'stunning; extremely beautiful/impressive': 'stunning; extremely beautiful impressive',
  'turn; change direction/position': 'turn; change direction position',
  'stray (animal)': 'stray animal',
  'apparent/obvious': 'apparent obvious',
  'to cater; to provide food/service for an event': 'to cater; to provide food service for an event',
  'to stress someone; to make someone tense/worried': 'to stress someone; to make someone tense worried',
  'to jam; to shove/pack in': 'to jam; to shove pack in',
  'turnout; junction/turn-off point': 'turnout; junction turn-off point',
  'to mount; to attach onto a backing/support': 'to mount; to attach onto a backing support',
  'jump at/on, pounce on': 'jump at on, pounce on',
  'to divine; to predict/foretell': 'to divine; to predict foretell',
  'fishing; the activity/industry of catching fish': 'fishing; the activity industry of catching fish',
  'adopt/approve': 'adopt approve',
  'nation; a country/state': 'nation; a country state',
  'peasant; poor farm worker/farmer': 'peasant; poor farm worker farmer',
  'to accompany / go together': 'to accompany go together',
  'to be eager': 'eager',
  'to benefit (from), to gain': 'to benefit from, to gain',
  'to dub; to give a nickname/title': 'to dub; to give a nickname title',
  'stair/stairs': 'stairs',
}

const EN_SSML_OVERRIDE: Record<string, string> = {
  abandon: "<phoneme alphabet='ipa' ph='əˈbændən'>abandon</phoneme>",
  'future, later': "future<break time='250ms'/>later",
  'coal, charcoal': "coal<break time='250ms'/>charcoal",
  'immediate, instant': "immediate<break time='250ms'/>instant",
  'much, many': "much<break time='300ms'/>many",
  'to be, to be located': "to be<break time='250ms'/>to be located",
  'mockery, irony': "mockery<break time='250ms'/>irony",
  'combination, code': "combination<break time='250ms'/>code",
  'in danger, at risk': "in danger<break time='250ms'/>at risk",
  'yet, still': "yet<break time='250ms'/>still",
  'creep, crawl': "creep<break time='250ms'/>crawl",
  'remaining, balance': "remaining<break time='250ms'/>balance",
  'nominate, appoint': "nominate<break time='250ms'/>appoint",
  'to nominate, appoint': "to nominate<break time='250ms'/>appoint",
  'engaged, busy': "engaged<break time='250ms'/>busy",
  'make, force': "make<break time='250ms'/>force",
  'to make, force': "to make<break time='250ms'/>force",
  'collapse, fall down': "collapse<break time='250ms'/>fall down",
  'adjust, adapt': "adjust<break time='250ms'/>adapt",
  'to adjust, adapt': "to adjust<break time='250ms'/>adapt",
  'private, secret': "private<break time='250ms'/>secret",
  'bear, give birth': "bear<break time='250ms'/>give birth",
  'to bear, give birth': "to bear<break time='250ms'/>give birth",
  'conceive, become pregnant': "conceive<break time='250ms'/>become pregnant",
  'to conceive, become pregnant': "to conceive<break time='250ms'/>become pregnant",
}

// EN_DISPLAY_OVERRIDE: original DB meaning_en → displayed text
// We need a reverse map to find DB records
const EN_DISPLAY_OVERRIDE: Record<string, string> = {
  about: 'around', breach: 'violate', comic: 'comedian', distinct: 'distinctly',
  medical: 'medical check-up', loom: 'approach',
  forge: "blacksmith's workshop", allegedly: 'to be alleged', outing: 'out',
  'beam of light': 'beam', 'to distance': 'distant', clinical: 'without emotion',
  'drug cocktail': 'cocktail', critically: 'in critical condition', optical: 'optic',
  'a formal': 'formal dance', irony: 'mockery, irony', exile: 'relocation, transfer',
  'management; the act of running/organizing a business or team': 'management',
  'to exploit': 'to make good use', 'asleep; not aware': 'to doze off, to be drowsy',
  'provincial; person from the provinces': 'from the provinces',
  outstanding: 'unresolved', bridge: 'bridge of the nose',
  contract: 'to be infected, to catch', venture: 'dare', float: 'buoy',
  buck: 'male rabbit', male: 'male rabbit', pack: 'package',
  'to be late': 'late', cut: 'crop', cute: 'to be cute',
  'to settle': 'calm down', aspire: 'operate',
  'to mind; to look after': 'to look after', possible: 'to be possible',
  aware: 'to be aware', offer: 'special offer', master: 'captain',
  passing: 'brief', report: 'pin', tight: 'to be tight',
  'to lie': 'to be located', throw: 'bin', delegate: 'to me',
  relieved: 'to be relieved', regard: 'regarding', resolve: 'decide',
  'to ring': 'call', 'to present': 'introduce',
  alarm: 'shock, fright, alarm', 'instant; immediate': 'immediate, instant',
  immediately: 'immediate, instant', enough: 'to be enough', fond: 'prefer',
  homeless: 'stray (animal)', establishment: 'institution',
  'to desert': 'abandon', 'rational; logical': 'rational',
  bake: 'harden, thicken', leap: 'jump at/on, pounce on',
  'to staff': 'hire', 'to be controversial': 'controversial',
  deadly: 'dangerous', discourage: 'to be discouraged', get: 'persuade',
  practitioner: 'religious person, believer', preacher: 'religious person, believer',
  letters: 'symbol, sign, character', removal: 'move', dynamic: 'interaction',
  thinking: 'idea, thinking', wit: 'wisdom, good sense',
  exploit: 'to benefit (from), to gain', 'to submit': 'surrender',
  random: 'randomly', gaming: 'gambling', sufficiently: 'enough',
  virtual: 'online', rationally: 'rational', involved: 'complicated',
  building: 'construction', vulnerable: 'in danger, at risk',
  communicate: 'convey', martial: 'military', means: 'method',
  'to troop': 'to accompany / go together', 'theatrical; dramatic': 'theatrical',
  'to be proud': 'proud', power: 'authority', visual: 'visual aid',
  action: 'activity', gala: 'formal', remainder: 'remaining, balance',
  character: 'symbol, sign, character', seize: 'understand, grasp',
  'to dust': 'dust, wipe',
  'combination / code': 'combination, code',
  'meantime / meanwhile': 'meanwhile',
  'in danger / at risk': 'in danger, at risk',
  'yet / still': 'yet, still',
  'creep/crawl': 'creep, crawl',
  'remaining/balance': 'remaining, balance',
  'nominate/appoint': 'nominate, appoint',
  'to nominate/appoint': 'to nominate, appoint',
  'engaged/busy': 'engaged, busy',
  'make/force': 'make, force',
  'to make/force': 'to make, force',
  'collapse / fall down': 'collapse, fall down',
  'adjust / adapt': 'adjust, adapt',
  'to adjust / adapt': 'to adjust, adapt',
  'elbow, accidentally hit/push with the elbow': 'elbow, accidentally hit or push with the elbow',
  'to elbow, accidentally hit/push with the elbow':
    'to elbow, accidentally hit or push with the elbow',
  'private/secret': 'private, secret',
  'the latest news/updates': 'the latest news',
  'reverse/turn something over': 'reverse',
  'to reverse/turn something over': 'reverse',
  'crawl / creep': 'crawl',
  'creep / crawl': 'crawl',
  'bear/give birth': 'bear, give birth',
  'to bear/give birth': 'to bear, give birth',
  'conceive/become pregnant': 'conceive, become pregnant',
  'to conceive/become pregnant': 'to conceive, become pregnant',
  'drift/wander aimlessly': 'wander aimlessly',
  'to drift/wander aimlessly': 'to wander aimlessly',
}

// Build reverse map: displayedText → Set of original DB meaning_en values
function buildEnReverseMap(): Map<string, Set<string>> {
  const reverseMap = new Map<string, Set<string>>()
  for (const [dbVal, displayVal] of Object.entries(EN_DISPLAY_OVERRIDE)) {
    if (!reverseMap.has(displayVal)) reverseMap.set(displayVal, new Set())
    reverseMap.get(displayVal)!.add(dbVal)
  }
  return reverseMap
}

// ═══════════════════════════════════════════════════════════
// C. 예문(example) 음성
// ═══════════════════════════════════════════════════════════

const EXAMPLE_TTS_OVERRIDE = new Set([
  '남의 사생활을 침해하면 안 돼요.',
  '강간 범죄는 절대 용납될 수 없어요.',
  'Simu yangu ina urambazaji wa GPS.',
])

/** word 기준으로 예문 음성을 새로 생성 (EXAMPLE_DISPLAY_OVERRIDE로 텍스트가 바뀐 경우) */
const EXAMPLE_TTS_BY_WORD: Record<string, { text: string; lang: string; voice?: string }> = {
  '아름다운': { text: '아름다운 외모뿐만 아니라 마음도 따뜻한 사람이에요.', lang: 'ko' },
  '귀엽다': { text: '아기는 통통한 볼이 정말 귀여워요.', lang: 'ko' },
  '이국적인': { text: '그 모델은 이국적인 얼굴선이 아주 매력적이에요.', lang: 'ko' },
  '이국적이다': { text: '그 모델은 이국적인 얼굴선이 아주 매력적이에요.', lang: 'ko' },
}

const EXAMPLE_LANG_OVERRIDE: Record<string, string> = {
  'Simu yangu ina urambazaji wa GPS.': 'sw',
}

const EXAMPLE_SSML_OVERRIDE: Record<string, string> = {
  'Simu yangu ina urambazaji wa GPS.': "Simu yangu ina urambazaji wa <say-as interpret-as='characters'>GPS</say-as>",
}

const EXAMPLE_VOICE_OVERRIDE: Record<string, string> = {
  '이 보고서는 통계 자료를 바탕으로 썼어요.': 'ko-KR-SeoHyeonNeural',
  '남의 사생활을 침해하면 안 돼요.': 'ko-KR-SeoHyeonNeural',
  '강간 범죄는 절대 용납될 수 없어요.': 'ko-KR-SeoHyeonNeural',
  '우리 회사는 태양광 전기를 써요.': 'ko-KR-SeoHyeonNeural',
}

// Also include EXAMPLE_DISPLAY_OVERRIDE examples that have voice overrides but aren't in EXAMPLE_TTS_OVERRIDE
const EXTRA_EXAMPLE_VOICE_WORDS = new Set([
  '이 보고서는 통계 자료를 바탕으로 썼어요.',
  '우리 회사는 태양광 전기를 써요.',
])

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function processWordAudio() {
  console.log('\n══════════════════════════════════════')
  console.log(' A. 단어(word) 음성 교정')
  console.log('══════════════════════════════════════\n')

  const targets = getWordOverrideTargets()
  let done = 0, skipped = 0, failed = 0

  for (const [dbWord, cfg] of targets) {
    console.log(`[${done + skipped + failed + 1}/${targets.size}] word="${dbWord}" → tts="${cfg.ttsText}" lang=${cfg.lang}`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, word_audio_url')
      .eq('word', dbWord)

    if (error) { console.error('  DB 조회 실패:', error.message); failed++; continue }
    if (!data?.length) { console.log('  DB에 없음, 건너뜀'); skipped++; continue }

    for (const row of data) {
      try {
        const audio = await azureTts(cfg.ttsText, cfg.lang, cfg.voice, cfg.speed, cfg.ssml)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_word_f_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const { error: upErr } = await supabase
          .from('generated_vocab')
          .update({ word_audio_url: newUrl })
          .eq('id', row.id)

        if (upErr) { console.error(`  DB 업데이트 실패: ${upErr.message}`); failed++ }
        else { console.log(`  OK → ${newUrl.slice(-40)}`); done++ }
      } catch (e) {
        console.error(`  TTS 실패: ${e instanceof Error ? e.message : String(e)}`); failed++
      }
      await delay(100)
    }
  }
  console.log(`\n단어 음성: 완료=${done}, 건너뜀=${skipped}, 실패=${failed}`)
}

async function processEnMeaningAudio() {
  console.log('\n══════════════════════════════════════')
  console.log(' B. 영어 뜻(meaning_en) 음성')
  console.log('══════════════════════════════════════\n')

  const reverseMap = buildEnReverseMap()
  let done = 0, skipped = 0, failed = 0
  const total = EN_FORCE_TTS.size

  for (const displayText of EN_FORCE_TTS) {
    const ttsText = (EN_TTS_TEXT_OVERRIDE[displayText] ?? displayText).replace(/\//g, ' ')
    const voice = EN_VOICE_OVERRIDE[displayText]
    const ssml = EN_SSML_OVERRIDE[displayText] ?? (displayText.includes('/') ? displayText.replace(/\//g, "<break time='200ms'/>") : undefined)

    console.log(`[${done + skipped + failed + 1}/${total}] "${displayText}" → tts="${ttsText}"`)

    // Find DB records: check if displayText itself is a DB meaning_en, or find original values via reverse map
    const dbMeaningEnValues = new Set<string>()
    dbMeaningEnValues.add(displayText) // displayText itself might be in DB
    const originals = reverseMap.get(displayText)
    if (originals) originals.forEach((v) => dbMeaningEnValues.add(v))

    let foundAny = false
    for (const meaningEn of dbMeaningEnValues) {
      const { data, error } = await supabase
        .from('generated_vocab')
        .select('id, mode, word, meaning_en, meaning_en_audio_url')
        .eq('meaning_en', meaningEn)

      if (error) { console.error(`  DB 조회 실패 (meaning_en="${meaningEn}"): ${error.message}`); continue }
      if (!data?.length) continue

      foundAny = true
      for (const row of data) {
        try {
          const audio = await azureTts(ttsText, 'en', voice, undefined, ssml)
          const ts = Date.now()
          const path = `fix/${row.mode}/${row.id}_meaning_en_f_${ts}.mp3`
          const newUrl = await uploadAudio(path, audio)

          const { error: upErr } = await supabase
            .from('generated_vocab')
            .update({ meaning_en_audio_url: newUrl })
            .eq('id', row.id)

          if (upErr) { console.error(`  DB 업데이트 실패: ${upErr.message}`); failed++ }
          else { console.log(`  OK [${row.word}] → ${newUrl.slice(-40)}`); done++ }
        } catch (e) {
          console.error(`  TTS 실패: ${e instanceof Error ? e.message : String(e)}`); failed++
        }
        await delay(100)
      }
    }

    if (!foundAny) { skipped++ }
  }
  console.log(`\n영어 뜻 음성: 완료=${done}, 건너뜀=${skipped}, 실패=${failed}`)
}

async function processExampleAudio() {
  console.log('\n══════════════════════════════════════')
  console.log(' C. 예문(example) 음성')
  console.log('══════════════════════════════════════\n')

  const allExamples = new Set([...EXAMPLE_TTS_OVERRIDE, ...EXTRA_EXAMPLE_VOICE_WORDS])
  let done = 0, skipped = 0, failed = 0

  for (const exampleText of allExamples) {
    const lang = EXAMPLE_LANG_OVERRIDE[exampleText] || 'ko'
    const voice = EXAMPLE_VOICE_OVERRIDE[exampleText]
    const ssml = EXAMPLE_SSML_OVERRIDE[exampleText]

    console.log(`예문: "${exampleText.slice(0, 30)}..." lang=${lang}`)

    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, example, example_audio_url')
      .eq('example', exampleText)

    if (error) { console.error('  DB 조회 실패:', error.message); failed++; continue }
    if (!data?.length) { console.log('  DB에 없음, 건너뜀'); skipped++; continue }

    for (const row of data) {
      try {
        const audio = await azureTts(exampleText, lang, voice, undefined, ssml)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_example_f_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const { error: upErr } = await supabase
          .from('generated_vocab')
          .update({ example_audio_url: newUrl })
          .eq('id', row.id)

        if (upErr) { console.error(`  DB 업데이트 실패: ${upErr.message}`); failed++ }
        else { console.log(`  OK [${row.word}] → ${newUrl.slice(-40)}`); done++ }
      } catch (e) {
        console.error(`  TTS 실패: ${e instanceof Error ? e.message : String(e)}`); failed++
      }
      await delay(100)
    }
  }
  console.log(`\n예문 음성: 완료=${done}, 건너뜀=${skipped}, 실패=${failed}`)
}

async function processExampleAudioByWord() {
  const entries = Object.entries(EXAMPLE_TTS_BY_WORD)
  if (!entries.length) return
  console.log('\n══════════════════════════════════════')
  console.log(' D. 예문 음성 (word 기준)')
  console.log('══════════════════════════════════════\n')

  let done = 0, failed = 0
  for (const [word, cfg] of entries) {
    console.log(`word="${word}" → "${cfg.text.slice(0, 40)}..."`)
    const { data, error } = await supabase
      .from('generated_vocab')
      .select('id, mode, word, example_audio_url')
      .eq('word', word)

    if (error) { console.error('  DB 조회 실패:', error.message); failed++; continue }
    if (!data?.length) { console.log('  DB에 없음'); failed++; continue }

    for (const row of data) {
      try {
        const audio = await azureTts(cfg.text, cfg.lang, cfg.voice)
        const ts = Date.now()
        const path = `fix/${row.mode}/${row.id}_example_f_${ts}.mp3`
        const newUrl = await uploadAudio(path, audio)

        const { error: upErr } = await supabase
          .from('generated_vocab')
          .update({ example_audio_url: newUrl })
          .eq('id', row.id)

        if (upErr) { console.error(`  DB 업데이트 실패: ${upErr.message}`); failed++ }
        else { console.log(`  OK [${row.mode}/${row.word}] → ${newUrl.slice(-40)}`); done++ }
      } catch (e) {
        console.error(`  TTS 실패: ${e instanceof Error ? e.message : String(e)}`); failed++
      }
      await delay(100)
    }
  }
  console.log(`\n예문(word기준) 음성: 완료=${done}, 실패=${failed}`)
}

async function main() {
  console.log('=== 교정 TTS 일괄 생성/업로드 스크립트 ===')
  console.log(`Azure TTS region: ${AZURE_TTS_REGION}`)
  console.log(`Supabase URL: ${SUPABASE_URL}\n`)

  if (!AZURE_TTS_KEY) { console.error('VITE_AZURE_TTS_KEY 환경변수가 없습니다.'); process.exit(1) }
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase 환경변수가 없습니다.'); process.exit(1) }

  await processWordAudio()
  await processEnMeaningAudio()
  await processExampleAudio()
  await processExampleAudioByWord()

  console.log('\n=== 모든 처리 완료 ===')
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
