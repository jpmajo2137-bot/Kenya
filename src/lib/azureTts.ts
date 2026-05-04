import { callEdgeFunctionBinary, isEdgeFunctionsConfigured } from './edgeFunctions'

type TTSLang = 'sw' | 'ko' | 'en'

// Azure Neural Voice 기본값 (프록시 없이 voice 만 지정)
const VOICE_MAP: Record<TTSLang, string> = {
  ko: 'ko-KR-SunHiNeural',
  sw: 'sw-KE-ZuriNeural',
  en: 'en-US-JennyNeural',
}

/**
 * Microsoft Azure TTS 로 음성 생성 (Edge Function 프록시 경유)
 *  - 클라이언트는 Azure 키를 갖지 않습니다.
 */
export async function azureSynthesizeSpeech(
  text: string,
  language: TTSLang,
  voiceOverride?: string,
  rateOverride?: string,
  /** SSML 콘텐츠 (escape 없이 삽입). 제공시 prosody 안에 그대로 삽입됩니다. */
  ssmlContentOverride?: string
): Promise<ArrayBuffer> {
  if (!isEdgeFunctionsConfigured()) {
    throw new Error('Backend not configured')
  }

  const voice = voiceOverride || VOICE_MAP[language] || VOICE_MAP.en
  const rate = rateOverride ?? '0.9'

  // ssmlContentOverride 가 있으면 클라이언트에서 SSML 직접 구성
  let ssml: string | undefined
  if (ssmlContentOverride) {
    const langCode = langCodeFromVoice(voice)
    ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langCode}'>
  <voice name='${voice}'>
    <prosody rate='${rate}'>
      ${ssmlContentOverride}
    </prosody>
  </voice>
</speak>`
  }

  const audio = await callEdgeFunctionBinary<{
    text: string
    language: TTSLang
    voice: string
    rate: string
    ssml?: string
  }>('azure-tts', { text, language, voice, rate, ssml }, { timeoutMs: 60_000 })

  return audio
}

function langCodeFromVoice(voiceName: string): string {
  const parts = voiceName.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

/**
 * Azure TTS 설정 확인 (백엔드 프록시 사용)
 */
export function hasAzureTts(): boolean {
  return isEdgeFunctionsConfigured()
}

/**
 * 사용 가능한 음성 목록 (참고용)
 */
export const AZURE_VOICES = {
  ko: [
    { name: 'ko-KR-SunHiNeural', gender: 'Female', description: '선희 (기본)' },
    { name: 'ko-KR-InJoonNeural', gender: 'Male', description: '인준' },
    { name: 'ko-KR-BongJinNeural', gender: 'Male', description: '봉진' },
    { name: 'ko-KR-GookMinNeural', gender: 'Male', description: '국민' },
    { name: 'ko-KR-JiMinNeural', gender: 'Female', description: '지민' },
    { name: 'ko-KR-SeoHyeonNeural', gender: 'Female', description: '서현' },
    { name: 'ko-KR-SoonBokNeural', gender: 'Female', description: '순복' },
    { name: 'ko-KR-YuJinNeural', gender: 'Female', description: '유진' },
  ],
  sw: [
    { name: 'sw-KE-ZuriNeural', gender: 'Female', description: 'Zuri (기본)' },
    { name: 'sw-KE-RafikiNeural', gender: 'Male', description: 'Rafiki' },
    { name: 'sw-TZ-RehemaNeural', gender: 'Female', description: 'Rehema (탄자니아)' },
    { name: 'sw-TZ-DaudiNeural', gender: 'Male', description: 'Daudi (탄자니아)' },
  ],
  en: [
    { name: 'en-US-JennyNeural', gender: 'Female', description: 'Jenny (기본)' },
    { name: 'en-US-GuyNeural', gender: 'Male', description: 'Guy' },
    { name: 'en-US-AriaNeural', gender: 'Female', description: 'Aria' },
    { name: 'en-US-DavisNeural', gender: 'Male', description: 'Davis' },
    { name: 'en-GB-SoniaNeural', gender: 'Female', description: 'Sonia (영국)' },
    { name: 'en-GB-RyanNeural', gender: 'Male', description: 'Ryan (영국)' },
  ],
}
