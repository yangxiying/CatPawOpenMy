#!/usr/bin/env bash
# 生成 RN 原生壳 → 装依赖 → 覆盖 overlay 源码 → 注入原生补丁 → (可选) pod install
# 参数：
#   --skip-pod   跳过 pod install（CI 用）
#   --minimal    极简模式：无 nodejs-mobile / react-native-video，纯 RN 空壳（排查用）
set -euo pipefail
SKIP_POD=false
MINIMAL=false
for arg in "$@"; do
    [ "$arg" = "--skip-pod" ] && SKIP_POD=true
    [ "$arg" = "--minimal" ] && MINIMAL=true
done

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/app"
NAME="CatPlayer"
RN_VERSION="0.74.7"

if [ ! -d "$APP_DIR" ]; then
    echo "▶ generating RN shell (react-native $RN_VERSION) …"
    npm cache clean --force 2>/dev/null || true
    npx "@react-native-community/cli@12.3.7" init CatPlayer --directory app --skip-install --version "$RN_VERSION"
fi

cd "$APP_DIR"
mkdir -p nodejs-assets 2>/dev/null || true  # 保留目录兼容性

echo "▶ installing JS deps …"
npm install
if [ "$MINIMAL" = "false" ]; then
    npm install --save react-native-webview react-native-fs react-native-video@5.2.2
fi

echo "▶ applying overlay (RN source) …"
rm -rf "$APP_DIR/src"
cp -R "$HERE/overlay/src" "$APP_DIR/src"
rm -f "$APP_DIR/App.js" "$APP_DIR/App.tsx" "$APP_DIR/index.js"
if [ "$MINIMAL" = "true" ]; then
    cp "$HERE/overlay/App.minimal.tsx" "$APP_DIR/App.tsx"
    cp "$HERE/overlay/index.js" "$APP_DIR/index.js"
else
    cp "$HERE/overlay/App.tsx" "$APP_DIR/App.tsx"
    cp "$HERE/overlay/index.js" "$APP_DIR/index.js"
fi
cp "$HERE/overlay/metro.config.js" "$APP_DIR/metro.config.js"

echo "▶ applying overlay (nodejs-project) — skipped (WebView approach)"
# nodejs-project no longer needed: source bundle runs inside WebView with polyfills
if [ "$MINIMAL" = "false" ]; then
    : # no-op
fi

echo "▶ patching native config …"
node "$HERE/patch.js" "$APP_DIR"

echo "▶ installing app icon …"
ICON_SRC="$HERE/overlay/ios/AppIcon.appiconset"
ICON_DST="$APP_DIR/ios/$NAME/Images.xcassets/AppIcon.appiconset"
if [ -d "$ICON_SRC" ] && [ -d "$ICON_DST" ]; then
    cp "$ICON_SRC"/icon-*.png "$ICON_DST/"
    # 生成 Contents.json 让 Xcode 识别所有图标尺寸
    cat > "$ICON_DST/Contents.json" << 'ICONS'
{
  "images": [
    {"idiom": "iphone", "size": "20x20", "scale": "2x", "filename": "icon-40.png"},
    {"idiom": "iphone", "size": "20x20", "scale": "3x", "filename": "icon-60.png"},
    {"idiom": "iphone", "size": "29x29", "scale": "2x", "filename": "icon-58.png"},
    {"idiom": "iphone", "size": "29x29", "scale": "3x", "filename": "icon-87.png"},
    {"idiom": "iphone", "size": "40x40", "scale": "2x", "filename": "icon-80.png"},
    {"idiom": "iphone", "size": "40x40", "scale": "3x", "filename": "icon-120.png"},
    {"idiom": "iphone", "size": "60x60", "scale": "2x", "filename": "icon-120.png"},
    {"idiom": "iphone", "size": "60x60", "scale": "3x", "filename": "icon-180.png"},
    {"idiom": "ipad", "size": "20x20", "scale": "1x", "filename": "icon-20.png"},
    {"idiom": "ipad", "size": "20x20", "scale": "2x", "filename": "icon-40.png"},
    {"idiom": "ipad", "size": "29x29", "scale": "1x", "filename": "icon-29.png"},
    {"idiom": "ipad", "size": "29x29", "scale": "2x", "filename": "icon-58.png"},
    {"idiom": "ipad", "size": "40x40", "scale": "1x", "filename": "icon-40.png"},
    {"idiom": "ipad", "size": "40x40", "scale": "2x", "filename": "icon-80.png"},
    {"idiom": "ipad", "size": "76x76", "scale": "1x", "filename": "icon-76.png"},
    {"idiom": "ipad", "size": "76x76", "scale": "2x", "filename": "icon-152.png"},
    {"idiom": "ipad", "size": "83.5x83.5", "scale": "2x", "filename": "icon-167.png"},
    {"idiom": "ios-marketing", "size": "1024x1024", "scale": "1x", "filename": "icon-1024.png"}
  ],
  "info": {"version": 1, "author": "xcode"}
}
ICONS
    echo "  icon: $(ls "$ICON_DST"/icon-*.png | wc -l) files"
fi

if [ "$SKIP_POD" = "true" ]; then
    echo "⏭ skipping pod install (--skip-pod)"
else
    echo "▶ pod install …"
    cd "$APP_DIR/ios"
    pod install --repo-update
fi

if [ "$MINIMAL" = "true" ]; then
    echo "✅ minimal setup complete (no native modules)"
else
    echo "✅ setup complete →  run  $HERE/build-ipa.sh"
fi
