# 백엔드 배포 가이드 (Supabase Edge Functions)

이 앱의 v8.6 부터는 모든 외부 AI/TTS API 키가 **Supabase Edge Function** 으로 이동되었습니다.
클라이언트 (Android/Web) 에는 더 이상 OpenAI / Gemini / Azure 키가 박혀있지 않습니다.

## 사전 준비

1. **Supabase CLI 설치**
   ```powershell
   # Windows (Scoop)
   scoop install supabase
   # 또는 npm
   npm install -g supabase
   ```

2. **Supabase 로그인**
   ```powershell
   supabase login
   ```

3. **프로젝트 link** (이미 만들어진 Supabase 프로젝트와 연결)
   ```powershell
   cd "C:\cursor app\kenya-vocab"
   supabase link --project-ref <PROJECT_REF>
   ```
   `PROJECT_REF` 는 Supabase 대시보드 URL 에서 확인 가능합니다.
   예: `https://supabase.com/dashboard/project/abcd1234efgh5678` → `abcd1234efgh5678`

## 1단계: Edge Function Secrets 설정

Supabase Dashboard 또는 CLI 로 환경변수를 설정합니다.

### Dashboard 방법 (권장)
1. Supabase Dashboard → Project → **Settings** → **Edge Functions** → **Manage Secrets**
2. 다음 키들을 추가:

| Key | Value | 필수 |
|-----|-------|------|
| `OPENAI_API_KEY` | `sk-...` | ✅ |
| `OPENAI_MODEL` | `gpt-4o-mini` | (선택) |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | (선택) |
| `GEMINI_API_KEY` | `AIza...` | ✅ |
| `AZURE_TTS_KEY` | Azure Speech 구독 키 | ✅ |
| `AZURE_TTS_REGION` | `koreacentral` 등 | ✅ |
| `SUPABASE_ANON_KEY` | 앱과 동일한 anon key | ✅ |
| `APP_SHARED_SECRET` | 임의의 강한 문자열 (예: `openssl rand -hex 32`) | (권장) |
| `ALLOWED_ORIGINS` | `https://localhost,capacitor://localhost,https://your-pwa.com` | (선택) |

### CLI 방법
```powershell
supabase secrets set OPENAI_API_KEY=sk-xxx
supabase secrets set GEMINI_API_KEY=AIzaxxx
supabase secrets set AZURE_TTS_KEY=xxx
supabase secrets set AZURE_TTS_REGION=koreacentral
supabase secrets set SUPABASE_ANON_KEY=eyJxxx
supabase secrets set APP_SHARED_SECRET=randomstring
```

> ⚠️ **주의**: `SUPABASE_URL` 과 `SUPABASE_ANON_KEY` 는 Supabase 가 자동으로 주입하는 예약 변수와 충돌할 수 있습니다. 만약 충돌 에러가 나면 Edge Function 의 코드에서 다른 이름으로 변경하세요.

## 2단계: Edge Functions 배포

```powershell
cd "C:\cursor app\kenya-vocab"

supabase functions deploy openai-vocab --no-verify-jwt
supabase functions deploy openai-image --no-verify-jwt
supabase functions deploy gemini-translate --no-verify-jwt
supabase functions deploy azure-tts --no-verify-jwt
```

배포 후 함수 URL 확인:
```powershell
supabase functions list
```
URL 형식: `https://<PROJECT_REF>.supabase.co/functions/v1/<function-name>`

## 3단계: RLS 정책 적용

Supabase Dashboard → **SQL Editor** 에서 `supabase/migrations/20260502_harden_rls.sql` 의 내용을 복사해서 실행.

또는 CLI:
```powershell
supabase db push
```

> ⚠️ 적용 전 **백업 필수**. 기존 RLS 정책이 있으면 **모두 교체**됩니다.

이 마이그레이션은 다음을 수행합니다:
- `generated_vocab` 테이블: 모든 사용자 SELECT 허용, **INSERT/UPDATE/DELETE 는 service_role 만**
- `vocabaudio` Storage: 모든 사용자 SELECT 허용, **쓰기는 service_role 만**

→ 결과: 클라이언트 (anon key) 로는 데이터를 **읽기만** 가능. 단어 생성/저장은 Edge Function 을 통해서만 가능.

## 4단계: 클라이언트 .env 정리

루트의 `.env` 파일에서 **민감 키를 제거**하고 다음만 남깁니다:

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_APP_SECRET=<APP_SHARED_SECRET 과 동일한 값>
```

**제거할 키들** (이제 Edge Function secrets 에 있음):
- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_MODEL`
- `VITE_GEMINI_API_KEY`
- `VITE_AZURE_TTS_KEY`
- `VITE_AZURE_TTS_REGION`
- `VITE_AZURE_TTS_*_VOICE`
- `VITE_AZURE_TTS_SPEED`
- `VITE_GCP_TTS_*`

## 5단계: 앱 빌드

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat bundleRelease
```

생성된 AAB: `android\app\build\outputs\bundle\release\app-release.aab`

## 6단계: 검증

배포 후 동작 확인:

```powershell
# 단어 생성 테스트
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/openai-vocab" `
  -H "apikey: <ANON_KEY>" `
  -H "Authorization: Bearer <ANON_KEY>" `
  -H "Content-Type: application/json" `
  -H "x-app-secret: <APP_SHARED_SECRET>" `
  -d '{"systemPrompt":"You are a translator","userPrompt":"Translate hello to Swahili","temperature":50,"responseFormat":"text"}'

# 번역 테스트
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/gemini-translate" `
  -H "apikey: <ANON_KEY>" `
  -H "Authorization: Bearer <ANON_KEY>" `
  -H "Content-Type: application/json" `
  -d '{"prompt":"Translate hello to Korean","model":"gemini-2.5-flash"}'
```

## Rate Limit 정책

각 Edge Function 의 IP 기반 rate limit:

| Function | 분당 | 시간당 |
|----------|------|--------|
| `openai-vocab` | 20 | 200 |
| `openai-image` | 5 | 30 |
| `gemini-translate` | 30 | 500 |
| `azure-tts` | 60 | 1000 |

> 인메모리이므로 Edge Function 인스턴스마다 독립적입니다.
> 강력한 rate limit 이 필요하면 Upstash Redis 또는 Supabase DB Counter 테이블로 마이그레이션 권장.

## 트러블슈팅

### 401 Unauthorized
- `apikey` / `Authorization: Bearer` 헤더에 anon key 가 들어있는지 확인
- `APP_SHARED_SECRET` 을 설정한 경우 클라이언트의 `VITE_APP_SECRET` 과 일치하는지 확인

### 502 OpenAI/Gemini/Azure error
- Edge Function secret 의 외부 API 키 유효성 확인
- 외부 API 의 quota / billing 상태 확인

### 429 Too Many Requests
- IP 기준이므로 동일 IP 에서 호출이 많은 경우 발생
- 응답의 `retryAfterSec` 만큼 대기 후 재시도

### CORS 에러
- `ALLOWED_ORIGINS` 환경변수 미설정 → `*` (모든 origin 허용)
- 설정한 경우, 클라이언트의 origin 이 목록에 있는지 확인
- Capacitor 의 origin 은 보통 `https://localhost` 또는 `capacitor://localhost`

## 비용 관리 팁

- **OpenAI Image** 가 가장 비싸므로 분당/시간당 limit 을 더 엄격하게 설정 (현재 5/분, 30/시간)
- 자주 쓰이는 결과는 클라이언트 IndexedDB 에 캐시 (`translate.ts` 의 cache 처럼)
- TTS 는 Supabase Storage 에 결과를 업로드해 재사용 (현재 `ttsCache.ts` 가 이미 처리)
