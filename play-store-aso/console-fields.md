# Play Console Fields — 영어 단어장 (신규 앱)

## App identity

- Package name: `com.jph.oxfordenglish`
- Default language: Korean (ko-KR)
- App name (ko): 영어 단어장
- App name (en): Oxford English Words
- versionCode: starts at `1`
- versionName: starts at `1.00`

## en-US

Title: Oxford English Words

Short description: Study Oxford 5000 English words with Korean meanings, quizzes, and review.

Full description: see `../fastlane/metadata/android/en-US/full_description.txt`

## ko-KR

Title: 영어 단어장 Oxford 5000

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

## Before first upload checklist

1. Create a **new** Play Console app (do not update the old `com.kenyavocab.app` listing)
2. Create a **new** upload keystore for this package (do not reuse the old Kenya keystore if you want a fully separate app identity)
3. Register AdMob Android/iOS apps for `com.jph.oxfordenglish` and replace unit IDs in `src/lib/admob.ts` + AndroidManifest
4. Deploy Firebase Hosting privacy pages (`firebase deploy --only hosting`)
5. On macOS: `npx cap add ios` (if needed) then set bundle id `com.jph.oxfordenglish` and copy `native-config/GoogleService-Info.plist`
6. Build AAB: `npm run release:android`
