## ADDED Requirements

### Requirement: mpv + FFmpeg iOS 编译
The build-mpv-ios.sh script SHALL compile libmpv and FFmpeg libraries for iOS arm64.

#### Scenario: 本地编译
- **WHEN** the user runs `bash scripts/build-mpv-ios.sh`
- **THEN** it SHALL clone mpv-build and FFmpeg (shallow clone, retry on failure)
- **THEN** it SHALL run `./rebuild -j4` with iOS-specific options
- **THEN** the resulting `libmpv.xcframework` and FFmpeg `.xcframework` bundles SHALL be placed in `CatPlayer/app/Frameworks/`
- **WHEN** compilation is complete
- **THEN** setup.sh SHALL detect the frameworks and include them in the build

#### Scenario: CI 编译
- **WHEN** CI workflow runs
- **THEN** it SHALL execute `build-mpv-ios.sh` before `build-ipa.sh`
- **THEN** the IPA SHALL include `Frameworks/` with all compiled `.xcframework` bundles
- **WHEN** CI timeout is 90 minutes
- **THEN** the build steps SHALL complete within that window
- **THEN** CI timeout MAY be increased if mpv compilation exceeds 90 minutes

### Requirement: 编译产物结构
The compiled libraries SHALL produce the following frameworks:

#### Scenario: 必要框架
- **WHEN** build-mpv-ios.sh completes successfully
- **THEN** the following frameworks SHALL be present in `CatPlayer/app/Frameworks/`:
  - `libmpv.xcframework`
  - `Libavcodec.xcframework`
  - `Libavformat.xcframework`
  - `Libavutil.xcframework`
  - `Libavfilter.xcframework`
  - `Libswresample.xcframework`
  - `Libswscale.xcframework`

### Requirement: MPVPlayer NativeModule
The MPVPlayer SHALL be exposed as an RCTBridgeModule for RN to control playback.

#### Scenario: MPV 播放控制
- **WHEN** RN calls `NativeModules.MPVPlayer.play(url, headers)`
- **THEN** MPVPlayer SHALL load the URL and begin playback
- **THEN** `pause()` SHALL pause, `resume()` SHALL resume
- **THEN** `seek(position)` SHALL seek to the given position in seconds
- **THEN** `setRate(rate)` SHALL set playback speed
- **THEN** `destroy()` SHALL release the mpv context

#### Scenario: 事件回调
- **WHEN** playback progresses
- **THEN** MPVPlayer SHALL emit `onPosition` event with current position and duration
- **WHEN** playback ends
- **THEN** MPVPlayer SHALL emit `onEnd` event
- **WHEN** an error occurs
- **THEN** MPVPlayer SHALL emit `onError` event with error description
- **WHEN** the video loads
- **THEN** MPVPlayer SHALL emit `onLoad` event with total duration
