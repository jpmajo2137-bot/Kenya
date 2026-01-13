import { env } from './env'

type TTLLang = 'sw' | 'ko' | 'en'

const VOICE_MAP: Record<TTLLang, string> = {
  ko: env.gcpTtsKoVoice || 'ko-KR-Wavenet-D',
  sw: env.gcpTtsSwVoice || 'sw-KE-Standard-A', // TZ가 실패하면 KE 기본
  en: env.gcpTtsEnVoice || 'en-US-Wavenet-D',
}

function langCodeFromVoice(name: string) {
  const parts = name.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : 'en-US'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof atob === 'function') {
    const binary = atob(base64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  }

  const maybeBuffer = (globalThis as typeof globalThis & { Buffer?: { from(data: string, enc: string): Uint8Array } }).Buffer
  if (maybeBuffer) {
    const buf = maybeBuffer.from(base64, 'base64')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }

  throw new Error('Base64 decode not supported in this environment')
}

export async function gcpSynthesizeSpeech(
  text: string,
  language: TTLLang,
): Promise<{ audio: ArrayBuffer; voiceName: string; rate: number }> {
  const accessToken = env.gcpTtsAccessToken
  if (!accessToken) {
    throw new Error('GCP TTS access token not configured (VITE_GCP_TTS_ACCESS_TOKEN)')
  }

  const voiceName = VOICE_MAP[language] || VOICE_MAP.en
  const speakingRate = env.gcpTtsSpeed ?? 0.9

  const payload = {
    input: { text },
    voice: {
      languageCode: langCodeFromVoice(voiceName),
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate,
    },
  }

  async function callTts(p: typeof payload) {
    return fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(p),
    })
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/22b9e1a6-367e-484f-b3b6-8f1412235620', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'verify',
      hypothesisId: 'G',
      location: 'gcpTts:gcpSynthesizeSpeech:start',
      message: 'google tts start',
      data: { language, voiceName, textLength: text.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  let res = await callTts(payload)

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)

    // 보이스 미지원 시 voice name 제거 후 언어 코드만으로 재시도
    const shouldRetry = res.status === 400 && errText.includes('does not exist')
    if (shouldRetry) {
      const fallbackPayload = {
        ...payload,
        voice: { languageCode: payload.voice.languageCode, name: '' }, // name 빈 문자열로
      }
      res = await callTts(fallbackPayload)
      if (!res.ok) {
        throw new Error(`Google TTS HTTP ${res.status}: ${res.statusText}`)
      }
    } else {
      throw new Error(`Google TTS HTTP ${res.status}: ${res.statusText}`)
    }
  }

  const json = (await res.json()) as { audioContent?: string }
  if (!json.audioContent) {
    throw new Error('Google TTS returned empty audioContent')
  }

  const audio = base64ToArrayBuffer(json.audioContent)

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/22b9e1a6-367e-484f-b3b6-8f1412235620', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'verify',
      hypothesisId: 'G',
      location: 'gcpTts:gcpSynthesizeSpeech:success',
      message: 'google tts success',
      data: { language, voiceName, byteLength: audio.byteLength, rate: speakingRate },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion

  return { audio, voiceName, rate: speakingRate }
}

