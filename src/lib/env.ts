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





