#!/usr/bin/env bash
# ============================================================
# Play Store AAB release 빌드 자동화
#
# 동작:
#   1. android/app/build.gradle 의 versionCode +1, versionName +0.01
#   2. 웹 빌드 (npm run build)
#   3. Capacitor sync (npx cap sync android)
#   4. Android AAB release 빌드 (./gradlew bundleRelease)
#   5. 결과 AAB 절대 경로·크기·서명 fingerprint 출력
#
# 사용:
#   npm run release:android              # 패치 버전 +0.01 (기본)
#   BUMP=minor npm run release:android   # +0.10
#   BUMP=major npm run release:android   # +1.00
#   SKIP_BUMP=1 npm run release:android  # 버전 안 올림 (재빌드용)
# ============================================================
set -euo pipefail

# ---------- 0. 사전 준비: 환경 변수 ----------
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
  if command -v brew >/dev/null 2>&1; then
    JDK21="$(brew --prefix openjdk@21 2>/dev/null)/libexec/openjdk.jdk/Contents/Home"
    if [ -d "$JDK21" ]; then
      export JAVA_HOME="$JDK21"
      export PATH="$JAVA_HOME/bin:$PATH"
    fi
  fi
fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_GRADLE="$ROOT_DIR/android/app/build.gradle"
LOCAL_PROPS="$ROOT_DIR/android/local.properties"

[ -f "$BUILD_GRADLE" ] || { echo "❌ $BUILD_GRADLE 없음"; exit 1; }

# ---------- 1. versionCode / versionName 자동 +1 ----------
# 주의: macOS BSD sed/grep 은 \s 미지원 → [[:space:]] 사용
if [ "${SKIP_BUMP:-0}" != "1" ]; then
  CUR_CODE=$(grep -E '^[[:space:]]*versionCode[[:space:]]+[0-9]+' "$BUILD_GRADLE" | head -1 | awk '{print $2}')
  CUR_NAME=$(grep -E '^[[:space:]]*versionName[[:space:]]+"' "$BUILD_GRADLE" | head -1 | sed -E 's/.*versionName[[:space:]]+"([^"]+)".*/\1/')
  if [ -z "$CUR_CODE" ] || [ -z "$CUR_NAME" ]; then
    echo "❌ 현재 버전 파싱 실패 (CUR_CODE='$CUR_CODE', CUR_NAME='$CUR_NAME')"
    exit 1
  fi
  NEW_CODE=$((CUR_CODE + 1))

  BUMP="${BUMP:-patch}"
  case "$BUMP" in
    major)
      NEW_NAME=$(awk -v v="$CUR_NAME" 'BEGIN{ split(v,a,"."); printf "%d.0", a[1]+1 }')
      ;;
    minor)
      NEW_NAME=$(awk -v v="$CUR_NAME" 'BEGIN{ split(v,a,"."); printf "%d.%02d", a[1], a[2]+10 }')
      ;;
    patch|*)
      NEW_NAME=$(awk -v v="$CUR_NAME" 'BEGIN{ split(v,a,"."); printf "%d.%02d", a[1], a[2]+1 }')
      ;;
  esac

  echo "▶ versionCode: $CUR_CODE → $NEW_CODE"
  echo "▶ versionName: $CUR_NAME → $NEW_NAME (bump=$BUMP)"

  sed -i.bak -E \
    -e "s/^([[:space:]]*)versionCode[[:space:]]+[0-9]+/\1versionCode $NEW_CODE/" \
    -e "s/^([[:space:]]*)versionName[[:space:]]+\"[^\"]+\"/\1versionName \"$NEW_NAME\"/" \
    "$BUILD_GRADLE"
  rm -f "$BUILD_GRADLE.bak"

  # 검증
  CHECK_CODE=$(grep -E '^[[:space:]]*versionCode[[:space:]]+[0-9]+' "$BUILD_GRADLE" | head -1 | awk '{print $2}')
  CHECK_NAME=$(grep -E '^[[:space:]]*versionName[[:space:]]+"' "$BUILD_GRADLE" | head -1 | sed -E 's/.*versionName[[:space:]]+"([^"]+)".*/\1/')
  if [ "$CHECK_CODE" != "$NEW_CODE" ] || [ "$CHECK_NAME" != "$NEW_NAME" ]; then
    echo "❌ 버전 bump 적용 실패 (실제: $CHECK_CODE / $CHECK_NAME)"
    exit 1
  fi
else
  echo "▶ SKIP_BUMP=1 → 버전 그대로 사용"
fi

# ---------- 2. local.properties 자동 생성 (없으면) ----------
if [ ! -f "$LOCAL_PROPS" ] && [ -n "${ANDROID_HOME:-}" ]; then
  echo "sdk.dir=$ANDROID_HOME" > "$LOCAL_PROPS"
  echo "▶ android/local.properties 생성됨"
fi

# ---------- 3. JDK / SDK 검증 ----------
echo ""
echo "=== 환경 ==="
echo "JAVA_HOME    = ${JAVA_HOME:-(미설정)}"
echo "ANDROID_HOME = ${ANDROID_HOME:-(미설정)}"
java -version 2>&1 | head -1 || { echo "❌ Java 없음"; exit 1; }
[ -d "${ANDROID_HOME:-}" ] || { echo "❌ Android SDK 없음 ($ANDROID_HOME)"; exit 1; }

# ---------- 4. 웹 빌드 → Capacitor sync → AAB ----------
echo ""
echo "=== 1/3 웹 빌드 ==="
cd "$ROOT_DIR"
npm run build

echo ""
echo "=== 2/3 Capacitor sync ==="
npx cap sync android

echo ""
echo "=== 3/3 Android AAB 빌드 (bundleRelease) ==="
cd "$ROOT_DIR/android"
./gradlew bundleRelease

# ---------- 5. 결과 검증 ----------
AAB="$ROOT_DIR/android/app/build/outputs/bundle/release/app-release.aab"
[ -f "$AAB" ] || { echo "❌ AAB 생성 실패"; exit 1; }

echo ""
echo "============================================================"
echo "✅ AAB 빌드 완료"
echo "============================================================"
echo "📦 파일 : $AAB"
echo "📏 크기 : $(du -h "$AAB" | awk '{print $1}')"
NEW_CODE_FINAL=$(grep -E '^[[:space:]]*versionCode[[:space:]]+[0-9]+' "$BUILD_GRADLE" | head -1 | awk '{print $2}')
NEW_NAME_FINAL=$(grep -E '^[[:space:]]*versionName[[:space:]]+"' "$BUILD_GRADLE" | head -1 | sed -E 's/.*versionName[[:space:]]+"([^"]+)".*/\1/')
echo "🔢 versionCode : $NEW_CODE_FINAL"
echo "🏷  versionName : $NEW_NAME_FINAL"

if command -v jarsigner >/dev/null 2>&1; then
  VERIFY=$(jarsigner -verify "$AAB" 2>&1 | grep -E "verified" | head -1)
  echo "🔐 서명       : $VERIFY"
fi

echo ""
echo "Finder에서 열기:"
echo "  open \"$(dirname "$AAB")\""
