# Play Store ASO Metadata

Prepared for the app at `http://localhost:5173/`.

Observed app positioning:

- Four language pairs: English → Korean, Korean → English, Swahili/Kiswahili → Korean, Korean → Swahili/Kiswahili
- Core features: wordbook, dictionary, Hangul, audio pronunciation, quiz, wrong notes
- Vocabulary depth shown in app: about 4,988 all words, with beginner/elementary/intermediate/advanced and topic decks
- Important ASO terms used naturally: learn Korean, Korean vocabulary, Hangul, Korean pronunciation, Korean dictionary, English vocabulary, Korean English dictionary, Swahili Korean, Kiswahili, flashcards, quiz, wrong notes

Files ready for Play Console or fastlane supply:

- `fastlane/metadata/android/en-US/title.txt`
- `fastlane/metadata/android/en-US/short_description.txt`
- `fastlane/metadata/android/en-US/full_description.txt`
- `fastlane/metadata/android/ko-KR/title.txt`
- `fastlane/metadata/android/ko-KR/short_description.txt`
- `fastlane/metadata/android/ko-KR/full_description.txt`
- `fastlane/metadata/android/sw/title.txt`
- `fastlane/metadata/android/sw/short_description.txt`
- `fastlane/metadata/android/sw/full_description.txt`

Notes:

- Google Play does not provide a separate keyword field. Keywords are placed in title, short description and full description.
- Avoiding unnatural keyword stuffing is intentional. Google Play can reject or downrank spammy repeated keyword blocks.
- I did not claim offline learning because the app currently shows that it requires an internet connection.
- I did not use the Oxford brand in store copy because that can create trademark/licensing risk unless you have explicit rights.
