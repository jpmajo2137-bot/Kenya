# Play / App Store ASO assets — JHP 영어 단어 암기

## Listings

- `listings/ko-KR/` · `listings/en-US/` — Play title / short / full description
- `../fastlane/metadata/android/` — same Play copy (fastlane mirror)
- `../fastlane/metadata/ios/` — App Store name, subtitle, keywords, promo, description

## Graphics

- `icon-512.png` — Play store icon
- `feature-graphic.png` — Play feature graphic (1024×500)
- `screenshots/phone/{ko-KR,en-US}/` — Play phone screenshots (1080×1920)
- `screenshots/iphone67/{ko,en-US}/` — App Store iPhone 6.7" (1290×2796)
- `screenshots/raw/` — source device captures

## Regenerate / upload

```bash
# 1) Capture UI (dev server on :5173)
node scripts/capture-store-screens.mjs

# 2) Compose marketing frames + feature graphic
python3 scripts/compose-store-graphics.py

# 3) Upload to Play Console + App Store Connect
python3 scripts/upload-store-listings.py
```

Requires `.secrets/play-service-account.json` and `.secrets/apple.env`.
