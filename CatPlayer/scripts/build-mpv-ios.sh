#!/usr/bin/env bash
set -euo pipefail
# build-mpv-ios.sh — 一键编译 mpv + FFmpeg iOS arm64 static lib
# 依赖: Xcode Command Line Tools, git
# 产物: CatPlayer/app/Frameworks/*.xcframework

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
FRAMEWORKS_DIR="$PROJECT_DIR/app/Frameworks"
mkdir -p "$FRAMEWORKS_DIR"

# 1. FFmpegKit — 下载 pre-built xcframework
FFMPEG_KIT_VERSION="6.0"
FFMPEG_KIT_URL="https://github.com/arthenica/ffmpeg-kit/releases/download/v${FFMPEG_KIT_VERSION}/ffmpeg-kit-https-${FFMPEG_KIT_VERSION}-ios-xcframework.zip"
FFMPEG_KIT_ZIP="/tmp/ffmpeg-kit-ios.zip"

if [ ! -d "$FRAMEWORKS_DIR/libavcodec.xcframework" ]; then
    echo "==> Downloading FFmpegKit..."
    curl -L -o "$FFMPEG_KIT_ZIP" "$FFMPEG_KIT_URL"
    echo "==> Extracting FFmpegKit..."
    unzip -o "$FFMPEG_KIT_ZIP" -d "$FRAMEWORKS_DIR"
    echo "==> FFmpegKit installed"
else
    echo "==> FFmpegKit already exists, skipping"
fi

# 2. mpv-build — 编译 libmpv static lib
MPV_BUILD_DIR="/tmp/mpv-build"
MPV_VERSION="0.38.0"

if [ ! -f "$FRAMEWORKS_DIR/libmpv.xcframework/libmpv.a" ]; then
    echo "==> Cloning mpv-build..."
    if [ -d "$MPV_BUILD_DIR" ]; then
        rm -rf "$MPV_BUILD_DIR"
    fi
    git clone --depth=1 --branch "v${MPV_VERSION}" https://github.com/mpv-player/mpv-build.git "$MPV_BUILD_DIR"
    cd "$MPV_BUILD_DIR"

    # 应用编译配置
    cp "$SCRIPT_DIR/build-mpv-ios.conf" ./options.conf

    echo "==> Building mpv for iOS arm64..."
    # mpv-build 的 iOS 编译目标
    ./use-ffmpeg-release
    ./build -j4

    echo "==> Copying mpv static lib..."
    mkdir -p "$FRAMEWORKS_DIR/libmpv.xcframework"
    cp ./build/libmpv.a "$FRAMEWORKS_DIR/libmpv.xcframework/"
    cp -r ./build/include "$FRAMEWORKS_DIR/libmpv.xcframework/"

    echo "==> libmpv built"
else
    echo "==> libmpv already exists, skipping"
fi

echo "==> Done. Frameworks in $FRAMEWORKS_DIR"
ls -lh "$FRAMEWORKS_DIR"/*.xcframework/
