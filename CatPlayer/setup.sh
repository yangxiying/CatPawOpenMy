#!/usr/bin/env bash
# 生成 RN 原生壳 → 装依赖 → 覆盖 overlay 源码 → 注入原生补丁 → (可选) pod install
# 接受 --skip-pod 参数跳过 pod install（CI 用，便于用 Node 18 跑原生构建）
set -euo pipefail
SKIP_POD=false
for arg in "$@"; do [ "$arg" = "--skip-pod" ] && SKIP_POD=true; done

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/app"
RN_VERSION="0.72.17"

if [ ! -d "$APP_DIR" ]; then
    echo "▶ generating RN shell (react-native $RN_VERSION) …"
    # pin CLI to 11.3.7 (last RN 0.72-compatible CLI; its own versioning ≠ RN version)
    npm cache clean --force 2>/dev/null || true
    npx "@react-native-community/cli@11.3.7" init CatPlayer --directory app --skip-install --version "$RN_VERSION"
fi

cd "$APP_DIR"

# nodejs-mobile postinstall writes helper scripts into nodejs-assets/ during npm install
mkdir -p nodejs-assets

echo "▶ installing JS deps …"
npm install
npm install --save nodejs-mobile-react-native@18.20.4
# react-native-video@5.2.2 — uncomment when base app launches OK:
# npm install --save react-native-video@5.2.2

echo "▶ applying overlay (RN source) …"
rm -rf "$APP_DIR/src"
cp -R "$HERE/overlay/src" "$APP_DIR/src"
# overwrite App.js/.tsx and index.js (metro resolves .js before .tsx, delete defaults)
rm -f "$APP_DIR/App.js" "$APP_DIR/App.tsx" "$APP_DIR/index.js"
cp "$HERE/overlay/App.tsx" "$APP_DIR/App.tsx"
cp "$HERE/overlay/index.js" "$APP_DIR/index.js"
# metro blacklist — prevent bundling nodejs-assets (Node-only code)
cp "$HERE/overlay/metro.config.js" "$APP_DIR/metro.config.js"

echo "▶ applying overlay (nodejs-project) …"
mkdir -p "$APP_DIR/nodejs-assets/nodejs-project"
cp "$HERE/overlay/nodejs-project/main.js" "$APP_DIR/nodejs-assets/nodejs-project/main.js"
cp "$HERE/overlay/nodejs-project/package.json" "$APP_DIR/nodejs-assets/nodejs-project/package.json"

echo "▶ patching native config …"
node "$HERE/patch.js" "$APP_DIR"

if [ "$SKIP_POD" = "true" ]; then
    echo "⏭ skipping pod install (--skip-pod)"
else
    echo "▶ pod install …"
    cd "$APP_DIR/ios"
    pod install --repo-update
fi

echo "✅ setup complete →  run  $HERE/build-ipa.sh"
