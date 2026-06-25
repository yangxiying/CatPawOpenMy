## ADDED Requirements

### Requirement: BuiltinEngine 补全
The BuiltinEngine SHALL provide a working react-native-video based player as fallback when mpv frameworks are not compiled.

#### Scenario: 引擎选择
- **WHEN** `createEngine('builtin')` is called
- **THEN** it SHALL return a BuiltinEngine instance
- **WHEN** mpv is not available (`libmpv.xcframework` not present)
- **THEN** `createEngine('mpv')` SHALL return the BuiltinEngine as fallback

#### Scenario: 播放控制
- **WHEN** `play(url, headers)` is called on BuiltinEngine
- **THEN** it SHALL render a `react-native-video` `<Video>` component
- **WHEN** `pause()` is called
- **THEN** the video SHALL pause
- **WHEN** `resume()` is called
- **THEN** the video SHALL resume
- **WHEN** `seek(position)` is called
- **THEN** the video SHALL seek to the given position in seconds

#### Scenario: 事件回调
- **WHEN** playback progresses
- **THEN** BuiltinEngine SHALL call `onProgress` with position and duration
- **WHEN** playback ends
- **THEN** BuiltinEngine SHALL call `onEnd`
- **WHEN** an error occurs
- **THEN** BuiltinEngine SHALL call `onError` with error description
- **WHEN** the video loads
- **THEN** BuiltinEngine SHALL call `onLoad` with duration

#### Scenario: 多引擎切换
- **WHEN** the user changes player type in Settings (Settings.tsx)
- **THEN** the setting `playerType` SHALL be persisted via StorageService
- **WHEN** VideoPlayer receives a new `engineKey` prop
- **THEN** it SHALL destroy the old engine and create a new one via `createEngine(engineKey)`
