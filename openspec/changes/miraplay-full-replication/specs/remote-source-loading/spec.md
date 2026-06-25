## ADDED Requirements

### Requirement: 远程源 URL 配置
The app SHALL allow users to configure a remote source URL for downloading spider server bundles. This is the ONLY way to load spider sources — there is no embedded spider server.

#### Scenario: 未配置源
- **WHEN** the app starts with no custom source configured (sourceUrl is empty)
- **THEN** the boot screen SHALL display a message guiding the user to set a source URL in Settings
- **THEN** the app SHALL NOT attempt to load any embedded spider
- **THEN** the app SHALL wait for the user to configure a source URL and tap "重试"

#### Scenario: 远程源下载
- **WHEN** the user has configured a remote source URL
- **THEN** the app SHALL download `index.js.md5` from the base URL for MD5 comparison
- **WHEN** the remote MD5 differs from local cache
- **THEN** the app SHALL download `index.js` and `index.config.js`
- **THEN** files SHALL be cached in `Documents/catplayer/`
- **THEN** the MD5 SHALL be persisted for future cache-hit detection

#### Scenario: Basic Auth
- **WHEN** the remote URL contains `user:pass@host` format
- **THEN** the app SHALL extract credentials and set `Authorization: Basic ...` header
- **WHEN** downloading the bundle
- **THEN** the auth header SHALL be included in all download requests

#### Scenario: loadScript 集成
- **WHEN** the remote bundle is downloaded
- **THEN** the RN side SHALL send an rn-bridge message with `action:'run'` and `path` fields
- **WHEN** NodeMobile receives the message via rn-bridge
- **THEN** it SHALL call `loadScript(path)` → stop old source → `require(index.js)` → `start(config.default)`
- **THEN** the spider server SHALL start its HTTP server and send `server-ready` with port number

### Requirement: MD5 缓存校验
The app SHALL maintain an MD5 cache to avoid redundant downloads.

#### Scenario: 缓存命中
- **WHEN** the local MD5 matches the remote MD5
- **THEN** the app SHALL use the cached `index.js` without downloading
- **WHEN** the local MD5 does not match
- **THEN** the app SHALL download fresh `index.js` and `index.config.js`
- **THEN** the cached MD5 SHALL be updated after successful download
