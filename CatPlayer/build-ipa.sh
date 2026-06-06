#!/usr/bin/env bash
# 编译未签名 .ipa（侧载用）。需先跑 setup.sh。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IOS="$HERE/app/ios"
DD="$IOS/build/dd"

if [ ! -d "$IOS" ]; then echo "✗ app/ios not found — run ./setup.sh first"; exit 1; fi

cd "$IOS"
rm -rf "$IOS/build"

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
    AD_HOC_CODE_SIGNING_ALLOWED=YES

APP="$DD/Build/Products/Release-iphoneos/CatPlayer.app"
[ -d "$APP" ] || { echo "✗ build failed: $APP not found"; exit 1; }

echo "▶ packaging .ipa …"
mkdir -p "$IOS/build/Payload"
cp -R "$APP" "$IOS/build/Payload/"
( cd "$IOS/build" && rm -f CatPlayer.ipa && zip -qry CatPlayer.ipa Payload )

echo "✅ →  $IOS/build/CatPlayer.ipa   (unsigned — sideload with Sideloadly / AltStore / TrollStore)"
