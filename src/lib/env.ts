// Environment variables (Vite exposes VITE_ prefixed vars)

export const env = {
  // OpenAI
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY as string | undefined,
  openaiModel: (import.meta.env.VITE_OPENAI_MODEL as string) || 'gpt-4o-mini',

  // Google TTS
  gcpTtsApiKey: import.meta.env.VITE_GCP_TTS_API_KEY as string | undefined,
  gcpTtsAccessToken: import.meta.env.VITE_GCP_TTS_ACCESS_TOKEN as string | undefined,
  gcpTtsKoVoice: import.meta.env.VITE_GCP_TTS_KO_VOICE as string | undefined,
  gcpTtsSwVoice: import.meta.env.VITE_GCP_TTS_SW_VOICE as string | undefined, // default set in gcpTts.ts
  gcpTtsEnVoice: import.meta.env.VITE_GCP_TTS_EN_VOICE as string | undefined,
  gcpTtsSpeed: import.meta.env.VITE_GCP_TTS_SPEED ? Number(import.meta.env.VITE_GCP_TTS_SPEED) : undefined,

  // Microsoft Azure TTS
  azureTtsKey: import.meta.env.VITE_AZURE_TTS_KEY as string | undefined,
  azureTtsRegion: import.meta.env.VITE_AZURE_TTS_REGION as string | undefined,
  azureTtsKoVoice: import.meta.env.VITE_AZURE_TTS_KO_VOICE as string | undefined,
  azureTtsSwVoice: import.meta.env.VITE_AZURE_TTS_SW_VOICE as string | undefined,
  azureTtsEnVoice: import.meta.env.VITE_AZURE_TTS_EN_VOICE as string | undefined,
  azureTtsSpeed: import.meta.env.VITE_AZURE_TTS_SPEED as string | undefined, // 0.5 ~ 2.0

  // Gemini (Translation Dictionary)
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY as string | undefined,

  // Supabase
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}

export function hasOpenAI() {
  return Boolean(env.openaiApiKey)
}

export function hasSupabase() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey)
}

export function hasAzureTts() {
  return Boolean(env.azureTtsKey && env.azureTtsRegion)
}





