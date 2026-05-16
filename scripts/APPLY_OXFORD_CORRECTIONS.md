# Oxford KO-EN / EN-KO 교정 데이터 영구 반영 가이드

`src/lib/displayOverrides.ts` 에 모인 교정값(단어, 단어 뜻, 예문, 예문 번역)과 추가 이미지 교정 데이터를
Supabase `oxford_vocab` 테이블에 영구 반영하기 위한 절차입니다. 한국어→영어, 영어→한국어 두 방향
모두에 동일하게 적용됩니다.

## 0. 전제

- `.env` 에 다음이 설정되어 있어야 합니다.
  - `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (선호) 또는 `VITE_SUPABASE_ANON_KEY`
  - `VITE_APP_SECRET` (선택, edge function `azure-tts` 의 X-App-Secret 매칭이 필요한 경우)
- 모든 스크립트는 기본이 **dry-run** 입니다. `--apply` 플래그로만 실제 변경됩니다.

## 1. 텍스트 교정 적용 (단어/뜻/예문/예문 번역)

```bash
# 1) dry-run: 어떤 행이 어떻게 바뀌는지 미리 확인
npx tsx scripts/apply-displayoverrides-to-oxford.ts

# 2) 실제 반영 (변경된 텍스트의 오디오 url 도 자동으로 NULL 로 비워둡니다)
npx tsx scripts/apply-displayoverrides-to-oxford.ts --apply

# 3) 오디오 url 은 그대로 두고 텍스트만 교정 (TTS 재생성 안 할 때)
npx tsx scripts/apply-displayoverrides-to-oxford.ts --apply --no-clear-audio
```

적용 규칙(요약):

| 컬럼              | 우선순위                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `korean_meaning`  | `WORD_DISPLAY_OVERRIDE.word` → `KO_DISPLAY_OVERRIDE_BY_WORD` → `KO_DISPLAY_OVERRIDE`           |
| `korean_example`  | `EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD.ko` → `EXAMPLE_DISPLAY_OVERRIDE.text` → `EXAMPLE_TRANSLATION_KO_OVERRIDE` |
| `english_example` | `EXAMPLE_TRANSLATION_OVERRIDE_BY_WORD.en` → `EXAMPLE_TRANSLATION_EN_OVERRIDE`                 |

> 참고: `word`(영어 단어 키) 컬럼은 학습 식별자이므로 변경하지 않습니다. `EN_DISPLAY_OVERRIDE_*` 의
> 영어 글로스 보정은 클라이언트 표시 단계에서만 동작합니다(이미 `oxfordAdapter` 가 미리 적용).

## 2. 변경된 텍스트의 TTS 오디오 재생성

1단계가 끝나면 변경된 텍스트의 `*_audio_url` 컬럼이 모두 `NULL` 입니다. 다음을 실행하세요.

```bash
# 어떤 행이 합성될지 미리 보기
npx tsx scripts/regen-corrected-oxford-audio.ts

# 실제 합성 + 업로드 + DB PATCH (병렬 4개 기본)
npx tsx scripts/regen-corrected-oxford-audio.ts --apply

# 한국어만 또는 영어만 재생성
npx tsx scripts/regen-corrected-oxford-audio.ts --apply --kinds=ko
npx tsx scripts/regen-corrected-oxford-audio.ts --apply --kinds=en

# 더 빠른 병렬 (Azure 한도에 유의)
npx tsx scripts/regen-corrected-oxford-audio.ts --apply --concurrency=8
```

내부 호출은 `supabase/functions/azure-tts` 엣지 함수를 사용합니다. 실패한 행은 다음 실행 시 다시
대상이 됩니다(`audio_url IS NULL` 기준이라 멱등).

## 3. 이미지(사진) 교정 반영

이미지는 다음 3가지 입력 형식 중 하나를 지원합니다.

### 3-A. JSON 매핑 파일

```json
{
  "apple": "https://.../images/apple.png",
  "house": "/local/path/house_corrected.jpg"
}
```

```bash
npx tsx scripts/apply-image-corrections-to-oxford.ts --map=path/to/images.json
npx tsx scripts/apply-image-corrections-to-oxford.ts --map=path/to/images.json --apply
```

### 3-B. CSV 매핑 파일

헤더는 `word`, `image_url` (또는 `file` / `path`) 두 컬럼이면 됩니다.

```csv
word,image_url
apple,https://.../apple.png
house,/local/path/house.jpg
```

```bash
npx tsx scripts/apply-image-corrections-to-oxford.ts --map=path/to/images.csv --apply
```

### 3-C. 로컬 디렉토리

`{word}.png|jpg|jpeg|webp` 형식으로 정리된 폴더를 지정하면 모두 업로드합니다.

```bash
npx tsx scripts/apply-image-corrections-to-oxford.ts --images-dir=/path/to/oxford_images_corrected --apply
```

옵션:

- `--apply` 실제 반영
- `--skip-existing` 이미 `image_url` 이 있는 행은 건너뜀(덮어쓰지 않음)
- `--concurrency=8` 업로드 병렬 수
- `--bucket=oxford-images` 대상 Storage 버킷명

URL 이 들어오면 그대로 `image_url` 에 PATCH 하고, 로컬 경로면 `oxford-images` 버킷에 업로드한 뒤
public URL 을 PATCH 합니다.

## 4. 검증

브라우저(또는 안드로이드 앱) 에서:

1. **온라인 상태**로 전체 단어 화면 진입 → KO-EN, EN-KO 두 모드 모두 단어/뜻/예문이 교정값으로 보이는지 확인.
2. 화면 우상단 “새로고침” 버튼으로 캐시 무효화 후 재확인.
3. 오디오 재생 (단어 / 한국어 뜻 / 영어 예문 / 한국어 예문) 이 새로 합성된 음성으로 들리는지.
4. 이미지가 반영되었는지(특히 `--skip-existing` 을 안 쓴 경우).

이슈 시 SQL 직접 확인:

```sql
-- 변경 결과 일부 확인
SELECT word, korean_meaning, korean_example, english_example,
       meaning_audio_url IS NULL AS need_meaning_tts,
       korean_example_audio_url IS NULL AS need_ko_ex_tts,
       english_example_audio_url IS NULL AS need_en_ex_tts,
       image_url
FROM oxford_vocab
ORDER BY order_index
LIMIT 50;

-- 합성 누락 확인
SELECT count(*) FROM oxford_vocab
WHERE meaning_audio_url IS NULL
   OR korean_example_audio_url IS NULL
   OR english_example_audio_url IS NULL;
```

## 5. 추가 (선택) — displayOverrides.ts 에서 적용된 항목 제거

DB 가 모두 교정된 상태가 되면 `displayOverrides.ts` 의 동일 키들은 더 이상 필요 없습니다.
다만 SW-KO 와 공유되는 항목이 일부 섞여 있어 자동 제거는 권장하지 않습니다. 검증이 끝난 후
수동으로 `KO_DISPLAY_OVERRIDE`, `EXAMPLE_DISPLAY_OVERRIDE` 등의 Oxford 전용 라인을 삭제하면
런타임 오버헤드를 더 줄일 수 있습니다.

## 6. 롤백

`apply-displayoverrides-to-oxford.ts` 는 컬럼 단위 PATCH 라 자동 롤백 기능은 없습니다.
필요시 직전에 `pg_dump --table=oxford_vocab` 으로 백업해 두세요.

```bash
# 예시 (psql 환경 변수 PGURL 사용)
pg_dump "$PGURL" --schema=public --table=oxford_vocab --column-inserts > oxford_vocab.bak.sql
```

## 7. 변경 적용된 코드(앱) 측 변동 사항

이 작업과 별도로, `oxfordAdapter` 와 `FlashcardScreen` 에 다음 보강이 들어갔습니다:

- `src/lib/oxfordAdapter.ts` — Oxford 행을 FlashcardScreen 에 넘기기 전에 `displayOverrides.ts` 의
  모든 교정(단어, 한/영 뜻, 예문, 예문 번역)을 미리 적용하고 `isOxford: true` 마커를 부여.
- `src/screens/FlashcardScreen.tsx` — `isOxford` 마커가 있으면 SW-KO 전용 `applySwOverride` 가
  Oxford EN-KO 모드에서 잘못 끼어들지 못하도록 `applyEnOverride` 만 통과시키는 분기 추가.

따라서 DB 에 반영하기 전이라도 FlashcardScreen 경로(Day별 카드, 오답노트 카드) 가 일관된
교정 결과를 보여 줍니다. DB 반영 후에는 어댑터의 보정이 모두 입력=출력이 되어 비용 0 입니다.
