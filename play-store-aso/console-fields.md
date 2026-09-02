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

Short description: Study Oxford 5000 English words with Korean meanings, quizzes, and review.

Full description: see `../fastlane/metadata/android/en-US/full_description.txt`

## ko-KR

Title: JHP 영어 단어 암기

Short description: Oxford 5000 영어 단어를 Day별 학습, 퀴즈, 오답노트, 사전으로 공부하세요.

Full description: see `../fastlane/metadata/android/ko-KR/full_description.txt`

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

## App content answers (Play Console UI)

API로 넣을 수 없는 항목. 콘솔에서 아래처럼 제출한다.

### Privacy policy

정책 및 프로그램 → 앱 콘텐츠 → 개인정보처리방침

URL: `https://jhpenglish.web.app/privacy`

### Ads

앱에 광고가 포함됨: **예** (AdMob 배너/전면/보상형)

### Target audience

- 대상 연령: **13세 이상** (만 13세 미만 대상 아님)
- 아동 대상 앱 아님
- Appeal to children: No

### Content rating (IARC)

카테고리: **유틸리티 / 교육 / 참고** 중 교육에 가깝게

- 폭력: 없음
- 성적 콘텐츠: 없음
- 욕설: 없음
- 약물: 없음
- 사용자 간 소통/UGC: 없음
- 위치 공유: 없음
- 디지털 구매: 없음 (보상형 광고는 IAP 아님)
- 무제한 인터넷 접속: **예** (광고, 사전 검색)

예상 등급: Everyone / PEGI 3 / IARC 3+

이메일: jpmajo2137@gmail.com

### Data safety (요약)

수집/공유 **예** (AdMob + Firebase Analytics)

- 암호화 전송: 예 (HTTPS)
- 계정 삭제: 해당 없음 (계정 없음). 기기 데이터는 앱 설정에서 삭제
- 대략적 위치: 수집+공유 / 광고, 분석, 사기 방지
- 앱 상호작용: 수집+공유 / 광고, 분석
- 진단/충돌 로그: 수집+공유 / 분석, 사기 방지
- 기기 또는 기타 ID: 수집+공유 / 광고, 분석, 사기 방지
- 사용자 선택: 광고 ID는 기기 설정에서 재설정 가능. 광고 기능상 일부 수집은 필수

### Other declarations

- 뉴스 앱: 아니오
- COVID-19: 아니오
- 정부 앱: 아니오
- 금융 기능: 아니오
- 건강: 아니오
- 앱 액세스: 로그인 없이 모든 학습 기능 사용 가능
- 데이터 보안 / 삭제: 위 개인정보처리방침 URL

## Publishing status (API로 확인한 값)

- 스토어 등록정보 ko-KR / en-US: 설정됨
- 연락처 웹사이트/이메일: 설정됨
- 내부 테스트 트랙 1.00 (1): **completed** (draft 아님)
- 콘텐츠 등급 / 앱 콘텐츠 개인정보처리방침 폼: 콘솔 UI 필요
- 프로덕션: 위 폼이 끝난 뒤에만 승격

## Before first upload checklist

1. Create a **new** Play Console app (do not update the old `com.kenyavocab.app` listing)
2. Create a **new** upload keystore for this package (do not reuse the old Kenya keystore if you want a fully separate app identity)
3. Register AdMob Android/iOS apps for `com.jph.oxfordenglish` and replace unit IDs in `src/lib/admob.ts` + AndroidManifest
4. Deploy Firebase Hosting privacy pages (`firebase deploy --only hosting`)
5. On macOS: `npx cap add ios` (if needed) then set bundle id `com.jph.oxfordenglish` and copy `native-config/GoogleService-Info.plist`
6. Build AAB: `npm run release:android`
