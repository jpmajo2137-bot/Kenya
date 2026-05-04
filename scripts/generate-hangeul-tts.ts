/**
 * Pre-generate Azure TTS for every text spoken on the Hangeul learning screen,
 * upload each MP3 to Supabase Storage, and write a static URL map at
 * `src/data/hangeulAudio.ts`. The app then plays directly from those URLs so
 * runtime never calls the Azure API again.
 *
 * Usage: npx tsx scripts/generate-hangeul-tts.ts
 *
 * Idempotent: existing URLs are reused. Pass --force to regenerate everything.
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { getAllHangeulTtsTexts } from '../src/data/hangeul'

dotenv.config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const AZURE_TTS_KEY = process.env.AZURE_SPEECH_KEY || process.env.VITE_AZURE_TTS_KEY!
const AZURE_TTS_REGION = process.env.AZURE_SPEECH_REGION || process.env.VITE_AZURE_TTS_REGION || 'eastus'
const VOICE = process.env.VITE_AZURE_TTS_KO_VOICE || 'ko-KR-SunHiNeural'
const RATE = '0.85'
const BUCKET = 'vocabaudio'
const FORCE = process.argv.includes('--force')
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='))
const ONLY: string[] | null = ONLY_ARG
  ? ONLY_ARG.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : null

/**
 * 특정 텍스트에 한해 음성·속도·SSML을 덮어쓰는 보정 테이블.
 * 일부 단음절(ㅍ, ㅌ 등)이 SunHi 여성 음성에서 식별이 어려울 때
 * 남성 음성과 강세(emphasis) 조합으로 또렷하게 만든다.
 */
type TtsOverride = { voice?: string; rate?: string; ssml?: string }
/**
 * ㅢ(자음+ㅢ) 음절은 표준 한국어에서 [i]로 발음되어 TTS가 '긔→기', '희→히'처럼 들려준다.
 * 학습 화면에서는 ㅡ+ㅣ 이중모음을 또렷이 들려주기 위해 두 음절 표기로 합성시킨다.
 * 키는 원래 음절(긔, 희, ...)이지만, 실제 합성 텍스트는 '그이', '흐이' 등으로 분리한다.
 */
const EUI_DIPHTHONG_TEXT: Record<string, string> = {
  '긔': '그이',
  '늬': '느이',
  '듸': '드이',
  '릐': '르이',
  '믜': '므이',
  '븨': '브이',
  '싀': '스이',
  '의': '으이',
  '즤': '즈이',
  '츼': '츠이',
  '킈': '크이',
  '틔': '트이',
  '픠': '프이',
  '희': '흐이',
}

/**
 * ㅘ(자음+ㅗ+ㅏ) 음절은 단음절로 합성하면 'ㅗ'가 묻혀 단순 'ㅏ'음으로 들린다.
 * (예: 돠→다, 톼→타, 퐈→파)
 * ㅢ와 동일하게 두 음절(고+아)로 분리해 ㅗㅏ 이중모음을 또렷하게 들려준다.
 */
const WA_DIPHTHONG_TEXT: Record<string, string> = {
  '과': '고아',
  '놔': '노아',
  '돠': '도아',
  '롸': '로아',
  '뫄': '모아',
  '봐': '보아',
  '솨': '소아',
  '와': '오아',
  '좌': '조아',
  '촤': '초아',
  '콰': '코아',
  '톼': '토아',
  '퐈': '포아',
  '화': '호아',
}

/**
 * ㅃ + 모음 음절은 SunHi 기본 음성에서 두 입술 격음(fortis bilabial)이 약하게 발음되어
 * 'ㄲ + 모음'(꺼/꼬 등)처럼 들리는 문제가 있다.
 * 강세(emphasis) + 느린 속도 + 선행 break 조합으로 ㅃ을 또렷하게 살린다.
 */
const PP_SYLLABLES = ['빠', '뺘', '뻐', '뼈', '뽀', '뾰', '뿌', '쀼', '쁘', '삐']

const TEXT_OVERRIDES: Record<string, TtsOverride> = {
  // 파: 'ㅍ' 자음을 강세로 또렷하게 발화
  '파': {
    voice: 'ko-KR-JiMinNeural',
    rate: '0.7',
    ssml: `<break time='80ms'/><emphasis level='strong'>파</emphasis>`,
  },
  // ㅢ 이중모음: 단음절은 ㅡ가 묻혀 ㅣ로만 들리고, 분리 표기는 두 음절로 들린다.
  // 분리 표기 + 무휴지(<break strength='none'/>) + 빠른 속도 조합으로
  // 두 음절을 자연 글라이드로 합쳐 한 호흡의 ㅡ+ㅣ 이중모음에 가깝게 만든다.
  ...Object.fromEntries(
    Object.entries(EUI_DIPHTHONG_TEXT).map(([key, spelled]) => {
      const [c1, c2] = [...spelled]
      return [
        key,
        {
          rate: '1.25',
          ssml: `${escapeXml(c1)}<break time='0ms' strength='none'/>${escapeXml(c2)}`,
        } as TtsOverride,
      ]
    })
  ),
  // ㅘ 이중모음: 대부분은 단음절 + 매우 느린 속도 + 강세로 ㅗ 글라이드 확보.
  // SunHi에서 글라이드가 묻혀 다/타/파처럼 들리는 자음들은 다른 여성 음성으로 바꾼다.
  // - 돠, 톼: YuJin (자연스러움)
  // - 퐈: JiMin (이미 '파'에서 ㅍ 격음 보정에 사용한 음성, 일관성 유지)
  ...Object.fromEntries(
    Object.keys(WA_DIPHTHONG_TEXT).map((key) => {
      let voice: string | undefined
      if (key === '돠' || key === '톼') voice = 'ko-KR-YuJinNeural'
      else if (key === '퐈') voice = 'ko-KR-JiMinNeural'
      return [
        key,
        {
          voice,
          rate: '0.55',
          ssml: `<emphasis level='strong'>${escapeXml(key)}</emphasis>`,
        } as TtsOverride,
      ]
    })
  ),
  // ㅃ + 모음 10개: 두 입술 경음(된소리)을 또렷하게
  // 6개(빠/뺘/뻐/뼈/뽀/뾰)는 JiMin + emphasis 조합으로 명료하지만
  // 4개(뿌/쀼/쁘/삐)는 고/원순 모음과 결합해 자음이 묻혀 다른 음성/볼륨이 필요하다.
  ...Object.fromEntries(
    [
      { syl: '빠', voice: 'ko-KR-JiMinNeural', rate: '0.7', volume: undefined },
      { syl: '뺘', voice: 'ko-KR-JiMinNeural', rate: '0.7', volume: undefined },
      { syl: '뻐', voice: 'ko-KR-JiMinNeural', rate: '0.7', volume: undefined },
      { syl: '뼈', voice: 'ko-KR-JiMinNeural', rate: '0.7', volume: undefined },
      { syl: '뽀', voice: 'ko-KR-JiMinNeural', rate: '0.7', volume: undefined },
      { syl: '뾰', voice: 'ko-KR-JiMinNeural', rate: '0.7', volume: undefined },
      { syl: '뿌', voice: 'ko-KR-SeoHyeonNeural', rate: '0.65', volume: '+15%' },
      { syl: '쀼', voice: 'ko-KR-SeoHyeonNeural', rate: '0.65', volume: '+15%' },
      { syl: '쁘', voice: 'ko-KR-SeoHyeonNeural', rate: '0.65', volume: '+15%' },
      { syl: '삐', voice: 'ko-KR-SeoHyeonNeural', rate: '0.65', volume: '+15%' },
    ].map(({ syl, voice, rate, volume }) => {
      const inner = `<break time='100ms'/><emphasis level='strong'>${escapeXml(syl)}</emphasis>`
      const ssml = volume ? `<prosody volume='${volume}'>${inner}</prosody>` : inner
      return [syl, { voice, rate, ssml } as TtsOverride]
    })
  ),
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function azureTts(text: string): Promise<ArrayBuffer> {
  const override = TEXT_OVERRIDES[text]
  const voice = override?.voice ?? VOICE
  const rate = override?.rate ?? RATE
  const inner = override?.ssml ?? escapeXml(text)
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ko-KR'>
  <voice name='${voice}'>
    <prosody rate='${rate}'>
      ${inner}
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

function pathFor(text: string): string {
  // SHA1 short hash keeps storage paths predictable and ASCII-safe.
  const hash = crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 16)
  return `hangeul/${hash}.mp3`
}

async function uploadAudio(storagePath: string, audio: ArrayBuffer): Promise<string> {
  const blob = new Blob([audio], { type: 'audio/mpeg' })
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return urlData.publicUrl
}

const OUT_PATH = path.resolve(process.cwd(), 'src', 'data', 'hangeulAudio.ts')

function readExistingMap(): Record<string, string> {
  if (!fs.existsSync(OUT_PATH)) return {}
  try {
    const src = fs.readFileSync(OUT_PATH, 'utf8')
    const match = src.match(/export const HANGEUL_AUDIO\s*:\s*Record<string,\s*string>\s*=\s*(\{[\s\S]*?\})\s*;?\s*\n/)
    if (!match) return {}
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const parsed = new Function('return ' + match[1])() as Record<string, string>
    return parsed
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, string>) {
  const sortedKeys = Object.keys(map).sort()
  const entries = sortedKeys
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`)
    .join('\n')
  const banner = '// AUTO-GENERATED by scripts/generate-hangeul-tts.ts. Do not edit by hand.'
  const content = `${banner}\nexport const HANGEUL_AUDIO: Record<string, string> = {\n${entries}\n};\n`
  fs.writeFileSync(OUT_PATH, content, 'utf8')
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!AZURE_TTS_KEY) {
    console.error('Missing VITE_AZURE_TTS_KEY / AZURE_SPEECH_KEY in env')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in env')
    process.exit(1)
  }

  const allTexts = getAllHangeulTtsTexts()
  const texts = ONLY ? allTexts.filter((t) => ONLY.includes(t)) : allTexts
  if (ONLY && texts.length === 0) {
    console.error(`No matching texts in --only filter: ${ONLY.join(', ')}`)
    process.exit(1)
  }
  // --only 사용 시 해당 텍스트는 항상 강제로 재생성하기 위해 기존 매핑에서 제거
  const existingRaw = FORCE ? {} : readExistingMap()
  const existing = { ...existingRaw }
  if (ONLY) {
    for (const t of ONLY) delete existing[t]
  }
  console.log(`Total texts: ${texts.length}`)
  console.log(`Already present: ${Object.keys(existing).length}`)
  console.log(`Voice: ${VOICE} | Region: ${AZURE_TTS_REGION} | Rate: ${RATE}`)
  console.log(`Force: ${FORCE}${ONLY ? ` | Only: ${ONLY.join(',')}` : ''}\n`)

  // 전체 매핑 보존: --only 모드에서도 다른 항목은 그대로 두고 대상만 갱신
  const map: Record<string, string> = { ...existingRaw, ...existing }
  let done = 0
  let skipped = 0
  let failed = 0
  let i = 0

  for (const text of texts) {
    i++
    // --only 대상은 무조건 재생성, 그 외엔 기존 URL이 있으면 스킵
    const isForced = ONLY?.includes(text) ?? false
    if (!isForced && map[text]) {
      skipped++
      continue
    }
    process.stdout.write(`[${i}/${texts.length}] "${text}" `)
    try {
      const audio = await azureTts(text)
      const baseUrl = await uploadAudio(pathFor(text), audio)
      // --only 재생성 시엔 같은 storage 경로를 덮어쓰므로 ?v= 캐시버스터를 부착
      const url = isForced ? `${baseUrl}?v=${Date.now()}` : baseUrl
      map[text] = url
      done++
      console.log(`OK ${url.slice(-50)}`)
      // Persist incrementally so a crash mid-run does not lose progress.
      if (done % 25 === 0) writeMap(map)
    } catch (e) {
      failed++
      console.log(`FAIL ${e instanceof Error ? e.message : String(e)}`)
    }
    await delay(80)
  }

  writeMap(map)
  console.log(`\nDone: generated=${done}, reused=${skipped}, failed=${failed}`)
  console.log(`Output: ${OUT_PATH}`)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
