/**
 * Environment variables (Vite exposes VITE_ prefixed vars)
 *
 * 보안 정책: 민감 API 키는 더 이상 클라이언트 번들에 포함하지 않습니다.
 *  - OpenAI / Gemini / Azure TTS / GCP TTS → Supabase Edge Function 으로 이동
 *  - Supabase URL / anon key / app secret 만 클라이언트에 노출
 */

export const env = {
  // Supabase (URL + anon key 만)
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,

  // 앱 공유 시크릿 (선택, Edge Function 추가 검증용 - 빌드 시 박힘)
  appSecret: import.meta.env.VITE_APP_SECRET as string | undefined,
}

export function hasSupabase() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey)
}

/**
 * 백엔드 (Edge Function) 가 모든 외부 API 를 프록시하므로
 * "OpenAI/Gemini/Azure 사용 가능 여부" 는 모두 supabase 설정 여부와 동일합니다.
 */
export function hasOpenAI() {
  return hasSupabase()
}

export function hasAzureTts() {
  return hasSupabase()
}
