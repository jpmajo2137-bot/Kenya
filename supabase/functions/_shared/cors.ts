// 공통 CORS 헤더
// 프로덕션에서는 ALLOWED_ORIGINS 환경변수로 제한 가능 (쉼표 구분)
//   예: ALLOWED_ORIGINS="https://localhost,capacitor://localhost,https://your-pwa.com"
// 미설정 시 모든 origin 허용 (Capacitor WebView 도 포함)
//
// 보안: 실제 인증은 apikey + x-app-secret 검증으로 수행하므로,
// 매칭되지 않는 origin 에는 와일드카드(*) 로 폴백하여 dev/모바일 WebView 등
// 다양한 origin 에서도 동작하도록 한다 (단, 와일드카드는 credentials 미허용).

const allowList = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowOrigin =
    allowList.length === 0
      ? '*'
      : allowList.includes(origin)
        ? origin
        : '*'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-app-version, x-app-secret',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders(req) })
  }
  return null
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

export function errorResponse(
  req: Request,
  message: string,
  status = 400
): Response {
  return jsonResponse(req, { error: message }, status)
}

export function binaryResponse(
  req: Request,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
  status = 200
): Response {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(req),
      'content-type': contentType,
      'cache-control': 'no-store',
    },
  })
}
