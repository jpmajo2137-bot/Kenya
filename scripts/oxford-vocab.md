# Oxford 5000 데이터 셋업 가이드

## 1. Supabase SQL 실행

`supabase/migrations/20260512_oxford_vocab.sql` 파일의 SQL을 Supabase SQL Editor에 붙여 넣고 실행합니다.

## 2. Storage 버킷 생성

Supabase Dashboard → Storage → New bucket:

- 이름: `oxford-images`, Public: ON
- 이름: `oxford-tts`, Public: ON

## 3. 환경 변수

`.env`에 다음이 있어야 합니다 (업로드 스크립트는 service_role 키 필요):

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=ey...
SUPABASE_SERVICE_ROLE_KEY=ey...   # 업로드 전용 (커밋 금지)
OXFORD_DATA_DIR=/Users/jpmajo/Library/CloudStorage/OneDrive-개인/앱 만들기/앱 만들기 자료
```

## 4. 업로드 실행

```bash
npx tsx scripts/upload-oxford-to-supabase.ts
```

- 1단계: CSV → DB upsert (수 분)
- 2단계: 이미지 업로드 (수 GB, 수 시간)
- 3단계: 오디오 업로드 (수백 MB, 수십 분 ~ 1시간)
- 4단계: DB 행에 URL 채움

스크립트는 멱등(idempotent)이라 중간에 끊겨도 재실행으로 이어 받습니다.

## 5. 버킷 비용

- Supabase Pro 플랜: 100GB 무료, 초과 시 GB당 $0.021/월
- 7GB 사용 시 무료 범위
