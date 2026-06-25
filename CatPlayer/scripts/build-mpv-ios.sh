#!/usr/bin/env bash
set -euo pipefail
# build-mpv-ios.sh — 一键编译 mpv + FFmpeg iOS arm64 static lib
# 依赖: Xcode Command Line Tools, git
# 产物: CatPlayer/app/Frameworks/*.xcframework
#
# FFmpeg 通过 mpv-build 的 use-ffmpeg-release 自动下载编译。
# 编译产物包括: libmpv.a + FFmpeg 各库 (libavcodec/libavformat 等)。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
FRAMEWORKS_DIR="$PROJECT_DIR/app/Frameworks"
mkdir -p "$FRAMEWORKS_DIR"

# mpv-build — 编译 libmpv static lib (含 FFmpeg 依赖)
MPV_BUILD_DIR="/tmp/mpv-build"
MPV_VERSION="0.38.0"

if [ ! -f "$FRAMEWORKS_DIR/libmpv.xcframework/libmpv.a" ]; then
    echo "==> Cloning mpv-build..."
    if [ -d "$MPV_BUILD_DIR" ]; then
        rm -rf "$MPV_BUILD_DIR"
    fi
    git clone --depth=1 --branch "v${MPV_VERSION}" https://github.com/mpv-player/mpv-build.git "$MPV_BUILD_DIR"
    cd "$MPV_BUILD_DIR"

    # 应用 iOS 编译选项
    cp "$SCRIPT_DIR/build-mpv-ios.conf" ./options.conf

    echo "==> Building FFmpeg for iOS arm64..."
    ./use-ffmpeg-release

    echo "==> Building mpv for iOS arm64..."
    ./build -j4

    echo "==> Copying libmpv..."
    mkdir -p "$FRAMEWORKS_DIR/libmpv.xcframework"
    cp ./build/libmpv.a "$FRAMEWORKS_DIR/libmpv.xcframework/"
    cp -r ./build/include "$FRAMEWORKS_DIR/libmpv.xcframework/"

    echo "==> Copying FFmpeg libraries from mpv-build ffmpeg build..."
    # mpv-build 在 ffmpeg/ 目录下编译 FFmpeg，产物在 build/ 下
    for lib in libavcodec libavformat libavutil libavfilter libswresample libswscale; do
        if [ -f "build/$lib.a" ]; then
            mkdir -p "$FRAMEWORKS_DIR/$lib.xcframework"
            cp "build/$lib.a" "$FRAMEWORKS_DIR/$lib.xcframework/"
        fi
    done

    echo "==> libmpv + FFmpeg built"
else
    echo "==> libmpv already exists, skipping"
fi

echo "==> Done. Frameworks in $FRAMEWORKS_DIR"
ls -lh "$FRAMEWORKS_DIR"/*.xcframework/ 2>/dev/null || echo "(frameworks not yet built)"
