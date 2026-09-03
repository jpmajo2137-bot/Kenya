# Play Console Fields — JHP 영어 단어 암기

## App identity

- Package name: `com.jph.oxfordenglish`
- Default language: Korean (ko-KR)
- App name (ko): JHP 영어 단어 암기
- App name (en): JHP English Words
- versionCode: `1`
- versionName: `1.00`

## Store URLs

- Site: https://jhpenglish.web.app
- Privacy: https://jhpenglish.web.app/privacy
- Data deletion: https://jhpenglish.web.app/delete-data
- Contact email: jpmajo2137@gmail.com
- Planned custom domain: `jhpenglish.com` (Firebase Hosting에 연결됨, 소유권 DNS 대기)
- Firebase site: `jhpenglish` → https://jhpenglish.web.app
- 레거시 미러: https://jph-learn-korean.web.app/privacy (같은 페이지)

구매 후 등록 기관에 넣을 DNS (Firebase Hosting이 요구하는 고정 레코드):

| 유형 | 호스트 | 값 |
|------|--------|-----|
| A | `@` | `199.36.158.100` |
| TXT | `@` | `hosting-site=jhpenglish` |
| CNAME | `www` | `jhpenglish.web.app` |

SSL용 `_acme-challenge` TXT는 인증서 발급 시 Firebase 콘솔에 표시되는 최신 값을 넣는다.

도메인 결제는 이 환경에서 할 수 없음 (Firebase 프로젝트 `jph-learn-korean`에 결제 계정 없음). `jhpenglish.com` 은 현재 미등록(NXDOMAIN).

## en-US

Title: JHP English Words

Short description: Oxford 5000 English words + Korean meanings. Day study, quizzes & wrong notes.

Full description: see `listings/en-US/full_description.txt` (mirrored in `../fastlane/metadata/android/en-US/`)

## ko-KR

Title: JHP 영어 단어 암기

Short description: Oxford 5000 영단어 암기앱 — Day학습, 퀴즈, 오답노트, 한영사전, 수능·토익 대비

Full description: see `listings/ko-KR/full_description.txt` (mirrored in `../fastlane/metadata/android/ko-KR/`)

## Graphics (uploaded via API)

- Play icon + feature graphic + 7 phone screenshots (ko-KR / en-US)
- App Store Connect: ko + en-US description/keywords/promo
  - iPhone 6.7" screenshots (7 each) — COMPLETE
  - **iPad 12.9" (`APP_IPAD_PRO_3GEN_129`) screenshots (7 each)** — COMPLETE
- Price: **Free ($0)** via `appPriceSchedules`
- Availability: all territories (`appAvailabilities` v2)
- Regenerators: `scripts/capture-store-screens.mjs`, `scripts/compose-store-graphics.py`, `scripts/upload-store-listings.py`, `scripts/upload-ipad-screenshots.py`

## Remaining Admin UI only

- ASC App Privacy nutrition labels + tracking answers → see `ASC_REMAINING_ADMIN_UI.md`
- Play App content forms (privacy policy form, ads, target audience, IARC) → see `PLAY_CONSOLE_REMAINING_UI.md`

## Recommended Play Console Classification

Category: Education

Tags / store positioning:

- Language learning
- Vocabulary
- English
- Korean
- Oxford 5000
- Dictionary
- Flashcards
- Quiz

## App content answers (Play Console)

### Data safety — API로 제출 완료

파일: `play-store-aso/data-safety.csv`

- 수집/공유: 예 (AdMob + Firebase Analytics + 사전 검색)
- 전송 암호화: 예
- 계정 생성: 없음 (`PSL_ACM_NONE`)
- 데이터 삭제: 예 — https://jhpenglish.web.app/delete-data
- 대략적 위치, 앱 상호작용, 기기 ID: 수집+공유 / 광고·분석·사기 방지 / 필수
- 진단·충돌 로그: 수집+공유 / 분석·사기 방지
- 인앱 검색어: 수집+공유 / 앱 기능 / 선택(검색할 때만)

### Privacy policy URL 폼 — 콘솔 UI 필요

정책 및 프로그램 → 앱 콘텐츠 → 개인정보처리방침  
URL: `https://jhpenglish.web.app/privacy`  
(스토어 설명/연락처 웹사이트에는 이미 반영됨. **앱 콘텐츠 전용 필드**는 Publisher API에 없음.)

### Ads / Target audience / Content rating — 콘솔 UI 필요

- 광고 포함: **예** (AdMob)
- 대상 연령: **13세 이상**, 아동 대상 아님
- IARC: 교육/유틸, 폭력·성인물·UGC 없음, 위치 공유 없음, 무제한 인터넷 예
- 예상 등급: Everyone / PEGI 3

### Internal testers

트랙 1.00 (1) 은 **completed**. Testers API는 Google 그룹만 지원해 이메일을 넣을 수 없음.  
콘솔 → 테스트 → 내부 테스트 → 테스터에 이메일 또는 Google 그룹 추가.

## App Store Connect (API로 반영됨)

- App id: `6807980665` / bundle `com.jph.oxfordenglish` / 버전 1.0
- 개인정보처리방침: ko·en-US 모두 `https://jhpenglish.web.app/privacy`
- 개인정보 선택/삭제: `https://jhpenglish.web.app/delete-data`
- 연령 등급 설문: 광고 예, 그 외 NONE/없음 → 계산 등급 **4+**
- 카테고리: Education / Reference
- 콘텐츠 권리: DOES_NOT_USE_THIRD_PARTY_CONTENT
- 저작권: 2026 JHP
- IDFA 사용: 예 (AdMob)
- ko/en-US 설명·키워드·지원 URL
- TestFlight 내부 그룹 `Internal Testers` + 계정 소유자 `jhgp2137@naver.com`
- 앱 개인정보 nutrition labels: API 없음 → 콘솔에서 AdMob/기기 식별자 선언 필요
- 심사 연락처 전화: API 필수값. 번호가 없어 미기입
- IPA/빌드: 아직 없음 (macOS Archive 필요)

## Publishing status (API로 확인한 값)

- 스토어 등록정보 ko-KR / en-US: 설정됨
- 연락처 웹사이트/이메일: 설정됨
- 데이터 안전: **제출됨**
- 내부 테스트 트랙 1.00 (1): **completed**
- 콘텐츠 등급 / 광고 / 대상 연령 / 앱 콘텐츠 개인정보처리방침 폼: 콘솔 UI
- 프로덕션: 위 폼이 끝나기 전에는 `FAILED_PRECONDITION`

## Before first upload checklist

1. Create a **new** Play Console app (do not update the old `com.kenyavocab.app` listing)
2. Create a **new** upload keystore for this package (do not reuse the old Kenya keystore if you want a fully separate app identity)
3. Register AdMob Android/iOS apps for `com.jph.oxfordenglish` and replace unit IDs in `src/lib/admob.ts` + AndroidManifest
4. Deploy Firebase Hosting privacy pages (`firebase deploy --only hosting`)
5. On macOS: `npx cap add ios` (if needed) then set bundle id `com.jph.oxfordenglish` and copy `native-config/GoogleService-Info.plist`
6. Build AAB: `npm run release:android`
