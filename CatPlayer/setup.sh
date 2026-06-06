#!/usr/bin/env bash
# 生成 RN 原生壳 → 装依赖 → 覆盖 overlay 源码 → 注入原生补丁 → pod install
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/app"
RN_VERSION="0.72.17"

if [ ! -d "$APP_DIR" ]; then
    echo "▶ generating RN shell (react-native $RN_VERSION) …"
    # pin CLI to same version as RN (0.72) to avoid mismatched template.config.js lookup
    npm cache clean --force 2>/dev/null || true
    npx "@react-native-community/cli@0.72.17" init CatPlayer --directory app --skip-install --version "$RN_VERSION"
fi

cd "$APP_DIR"

echo "▶ installing JS deps …"
npm install
npm install --save nodejs-mobile-react-native@18.20.4 react-native-video@6.19.2

echo "▶ applying overlay (RN source) …"
rm -rf "$APP_DIR/src"
cp -R "$HERE/overlay/src" "$APP_DIR/src"
cp "$HERE/overlay/App.tsx" "$APP_DIR/App.tsx"

echo "▶ applying overlay (nodejs-project) …"
mkdir -p "$APP_DIR/nodejs-assets/nodejs-project"
cp "$HERE/overlay/nodejs-project/main.js" "$APP_DIR/nodejs-assets/nodejs-project/main.js"
cp "$HERE/overlay/nodejs-project/package.json" "$APP_DIR/nodejs-assets/nodejs-project/package.json"

echo "▶ patching native config …"
node "$HERE/patch.js" "$APP_DIR"

echo "▶ pod install …"
cd "$APP_DIR/ios"
pod install --repo-update

echo "✅ setup complete →  run  $HERE/build-ipa.sh"
