# Native store app config

신규 앱 정체성:

| 항목 | 값 |
|------|----|
| Package / Bundle ID | `com.jph.oxfordenglish` |
| Display name | `영어 단어장` |
| English title | `Oxford English Words` |
| Android versionCode | starts at `1` |
| Android versionName | starts at `1.00` |

## Files

- `google-services.json` → copy to `android/app/google-services.json` (gitignored there)
- `GoogleService-Info.plist` → copy to `ios/App/App/GoogleService-Info.plist` after `npx cap add ios`

## Store upload notes

1. Play Console / App Store Connect 에 **새 앱**으로 등록 (기존 `com.kenyavocab.app` 업데이트 금지)
2. 신규 업로드 키스토어 생성 (`OXFORD_KEYSTORE_*` 환경변수 또는 `android/keystore.properties`)
3. AdMob에 `com.jph.oxfordenglish` 앱을 새로 만들고 유닛 ID 교체
4. macOS에서 iOS 아카이브: `npm run build && npx cap sync ios` 후 Xcode Archive
