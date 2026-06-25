# player-engine-mpv Specification

## Purpose
TBD - created by archiving change miraplay-feature-parity. Update Purpose after archive.
## Requirements
### Requirement: mpv + FFmpeg iOS framework
The system SHALL compile libmpv and FFmpeg components (avcodec, avformat, avfilter, avutil, swresample, swscale) as iOS frameworks for arm64.

#### Scenario: Framework build succeeds
- **WHEN** build script runs for iOS arm64 target
- **THEN** all .framework bundles are generated under CatPlayer/app/Frameworks/

#### Scenario: VideoToolbox hardware decoding
- **WHEN** mpv plays an H.264/H.265 video on iOS
- **THEN** VideoToolbox hardware decoder is used for GPU acceleration

### Requirement: Player engine abstraction
The system SHALL provide a unified player interface that supports switching between mpv, MDK, and react-native-video backends at runtime.

#### Scenario: Engine switch applies immediately
- **WHEN** user selects a different player engine in Settings
- **THEN** subsequent video plays use the selected engine

#### Scenario: Fallback on engine failure
- **WHEN** mpv engine fails to initialize for a given URL
- **THEN** system falls back to react-native-video without user intervention

