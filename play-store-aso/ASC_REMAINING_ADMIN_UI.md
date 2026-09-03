# App Store Connect — 관리자(Admin/Account Holder) UI로만 가능한 남은 항목

API로 iPad 스크린샷·무료 가격·국가 배포·리스팅·심사 연락처까지는 반영했습니다.  
아래 **앱이 수집하는 개인정보(Nutrition Labels)** 는 Apple이 API 키로 열어두지 않아 **App Store Connect 웹에서 Account Holder/Admin 계정으로** 입력해야 합니다.

## 1) 앱이 수집하는 개인정보 (필수)

경로: [App Store Connect](https://appstoreconnect.apple.com) → 나의 앱 → **JHP 영어 단어 암기**  
→ **앱 개인정보** (App Privacy) → **시작하기 / 편집**

1. **이 앱에서 데이터 수집?** → **예**
2. 아래 데이터 유형을 선택하고, **각 유형마다** “사용자에게 연결됨 / 추적에 사용”을 설정합니다.

| 데이터 유형 | 연결됨 | 추적에 사용 | 목적 |
|---|---|---|---|
| 기기 ID (Device ID) | 예 | **예** | 타사 광고, 분석, 사기 방지 |
| 광고 데이터 (Advertising Data) | 예 | **예** | 타사 광고 |
| 제품 상호작용 (Product Interaction) | 예 | 아니오 | 분석, 앱 기능 |
| 충돌 데이터 (Crash Data) | 예 | 아니오 | 분석 |
| 성능 데이터 (Performance Data) | 예 | 아니오 | 분석 |
| 기타 진단 데이터 | 예 | 아니오 | 분석 |
| 검색 기록 (Search History) | 예 | 아니오 | 앱 기능 (사전 검색) |
| 대략적 위치 (Coarse Location) | 예 | 아니오 | 타사 광고, 분석 |

3. **게시(Publish)** 를 눌러 답변을 게시합니다.  
   - `NSUserTrackingUsageDescription` / ATT 가 바이너리에 있으므로, **기기 ID·광고 데이터에 “추적에 사용 = 예”** 가 반드시 필요합니다.

## 2) 심사 제출

개인정보 게시 후:

1. 버전 **1.0** → **App Review에 추가** / **심사에 제출**
2. iPhone 6.7" + iPad 12.9" 스크린샷이 채워져 있는지 확인
3. 가격이 **무료(0)** 인지 확인 (이미 API로 설정됨)
4. 빌드가 선택되어 있는지 확인 (현재 연결된 빌드 있음)

## 이미 API로 완료된 항목

- iPhone 6.7" 스크린샷 (ko / en-US) 각 7장
- **iPad 12.9" 스크린샷 (ko / en-US) 각 7장**
- 가격 등급: **무료 ($0)**
- 판매 지역: 전 세계 가능하도록 availability 설정
- 설명/키워드/프로모션/자막/개인정보 URL
- 심사 연락처·노트
- 연령 등급 4+, 카테고리 Education/Reference
