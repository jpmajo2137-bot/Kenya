/**
 * Environment variables (Vite exposes VITE_ prefixed vars)
 *
 * 보안 정책: 민감 API 키는 더 이상 클라이언트 번들에 포함하지 않습니다.
 *  - OpenAI / Gemini → Supabase Edge Function 으로 이동
 *  - TTS → Supabase Storage 사전 캐시 mp3 + Web Speech 폴백 (외부 TTS 호출 없음)
 *  - Supabase URL / anon key / app secret 만 클라이언트에 노출
 */

export const env = {
  // Supabase (URL + anon key 만)
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,

  // 앱 공유 시크릿 (선택, Edge Function 추가 검증용 - 빌드 시 박힘)
  appSecret: import.meta.env.VITE_APP_SECRET as string | undefined,

  /** 선택: 로컬·실험용 클라이언트 GCP TTS (주입 시에만 사용; 프로덕션은 Edge 권장) */
  gcpTtsAccessToken: import.meta.env.VITE_GCP_TTS_ACCESS_TOKEN as string | undefined,
  gcpTtsKoVoice: import.meta.env.VITE_GCP_TTS_KO_VOICE as string | undefined,
  gcpTtsSwVoice: import.meta.env.VITE_GCP_TTS_SW_VOICE as string | undefined,
  gcpTtsEnVoice: import.meta.env.VITE_GCP_TTS_EN_VOICE as string | undefined,
  gcpTtsSpeed: (() => {
    const v = import.meta.env.VITE_GCP_TTS_SPEED as string | undefined
    if (v === undefined || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  })(),
}

export function hasSupabase() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey)
}

/**
 * 백엔드 (Edge Function) 가 모든 외부 API 를 프록시하므로
 * "OpenAI/Gemini 사용 가능 여부" 는 모두 supabase 설정 여부와 동일합니다.
 */
export function hasOpenAI() {
  return hasSupabase()
}
