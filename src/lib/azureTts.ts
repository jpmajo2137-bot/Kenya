import { env } from './env'

type TTSLang = 'sw' | 'ko' | 'en'

// Azure Neural Voice 설정
// https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
const VOICE_MAP: Record<TTSLang, string> = {
  ko: env.azureTtsKoVoice || 'ko-KR-SunHiNeural',      // 한국어 (여성)
  sw: env.azureTtsSwVoice || 'sw-KE-ZuriNeural',      // 스와힐리어 (여성)
  en: env.azureTtsEnVoice || 'en-US-JennyNeural',     // 영어 (여성)
}

// 음성 이름에서 언어 코드 추출 (예: ko-KR-SunHiNeural -> ko-KR)
function langCodeFromVoice(voiceName: string): string {
  const parts = voiceName.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

/**
 * Microsoft Azure TTS로 음성 생성
 * @param text 변환할 텍스트
 * @param language 언어 코드 ('sw' | 'ko' | 'en')
 * @param voiceOverride 특정 음성 지정 (예: 'ko-KR-InJoonNeural')
 * @param rateOverride 속도 오버라이드 (예: '0.75' = 더 느리게)
 * @returns MP3 ArrayBuffer
 */
export async function azureSynthesizeSpeech(
  text: string,
  language: TTSLang,
  voiceOverride?: string,
  rateOverride?: string,
  /** SSML 콘텐츠 (escape 없이 삽입, "혁" 등 소리 길이 조정용) */
  ssmlContentOverride?: string
): Promise<ArrayBuffer> {
  const subscriptionKey = env.azureTtsKey
  const region = env.azureTtsRegion

  if (!subscriptionKey) {
    throw new Error('Azure TTS subscription key not configured (VITE_AZURE_TTS_KEY)')
  }
  if (!region) {
    throw new Error('Azure TTS region not configured (VITE_AZURE_TTS_REGION)')
  }

  const voiceName = voiceOverride || VOICE_MAP[language] || VOICE_MAP.en
  const langCode = langCodeFromVoice(voiceName)
  const rate = rateOverride ?? env.azureTtsSpeed ?? '0.9'

  const prosodyContent = ssmlContentOverride ?? escapeXml(text)

  // SSML 형식으로 요청 생성
  const ssml = `
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langCode}'>
  <voice name='${voiceName}'>
    <prosody rate='${rate}'>
      ${prosodyContent}
    </prosody>
  </voice>
</speak>`.trim()

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': subscriptionKey,
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

/**
 * XML 특수 문자 이스케이프
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Azure TTS 설정 확인
 */
export function hasAzureTts(): boolean {
  return Boolean(env.azureTtsKey && env.azureTtsRegion)
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
