#!/usr/bin/env bash
# 编译未签名 .ipa（侧载用）。需先跑 setup.sh。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IOS="$HERE/app/ios"
DD="$IOS/build/dd"

if [ ! -d "$IOS" ]; then echo "✗ app/ios not found — run ./setup.sh first"; exit 1; fi

cd "$IOS"
# 只清 DerivedData 与上次的 ipa 产物；保留 build/generated/ios（codegen 输出）
rm -rf "$DD" "$IOS/build/Payload" "$IOS/build/CatPlayer.ipa"

echo "▶ xcodebuild (Release, iphoneos, unsigned) …"
xcodebuild \
    -workspace CatPlayer.xcworkspace \
    -scheme CatPlayer \
    -configuration Release \
    -sdk iphoneos \
    -derivedDataPath "$DD" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    AD_HOC_CODE_SIGNING_ALLOWED=YES \
    | tail -30

echo "--- looking for .app ---"
find "$DD" -name "CatPlayer.app" -type d 2>/dev/null
APP="$DD/Build/Products/Release-iphoneos/CatPlayer.app"
[ -d "$APP" ] || { echo "✗ build failed: $APP not found"; echo "Contents of $DD:"; ls -R "$DD" 2>/dev/null | head -30; exit 1; }

echo "▶ packaging .ipa …"
mkdir -p "$IOS/build/Payload"
cp -R "$APP" "$IOS/build/Payload/"
( cd "$IOS/build" && rm -f CatPlayer.ipa && zip -qry CatPlayer.ipa Payload )

IPA="$IOS/build/CatPlayer.ipa"
if [ -f "$IPA" ]; then
    echo "✅ IPA created: $(ls -lh "$IPA" | awk '{print $5}') →  $IPA"
else
    echo "✗ IPA not found at $IPA"; exit 1
fi
