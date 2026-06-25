## ADDED Requirements

### Requirement: NodeMobile 集成
The app SHALL integrate nodejs-mobile-react-native as the Node.js runtime, using NodeMobile.framework extracted from MiraPlay IPA.

#### Scenario: NodeMobile 初始化
- **WHEN** the app starts
- **THEN** NodeMobile runtime SHALL be started with `NodeJS.start('main.js')`
- **THEN** the runtime SHALL load `nodejs-assets/nodejs-project/main.js` as the entry point
- **THEN** the runtime SHALL send a `server-ready` message via rn-bridge channel with `port` field
- **THEN** the app SHALL wait for `server-ready` (event-driven, no timeout)
- **THEN** the app SHALL use direct HTTP requests to `127.0.0.1:<port>` for all API calls

#### Scenario: main.js 职责
- **WHEN** NodeMobile finishes loading `main.js`
- **THEN** main.js SHALL expose `globalThis.catServerFactory` for the HTTP server factory
- **THEN** main.js SHALL expose `globalThis.catDartServerPort` returning the native message port
- **THEN** main.js SHALL expose `loadScript(path)` for loading remote bundles via `require()`
- **THEN** main.js SHALL listen on rn-bridge channel for `action:'run'` → `loadScript(path)`
- **THEN** main.js SHALL **NOT** bundle any spider server — spider source comes exclusively from remote URL

#### Scenario: remote bundle 加载
- **WHEN** the app sends an rn-bridge message with `action:'run'` and `path` field
- **THEN** main.js SHALL call `loadScript(path)`
- **THEN** loadScript SHALL stop previous source, clear cache, require `${path}/index.js` and `${path}/index.config.js`
- **THEN** loadScript SHALL call `sourceModule.start(config.default || config)`

#### Scenario: NodeMobile 启动失败
- **WHEN** NodeMobile fails to start
- **THEN** the boot screen SHALL display the error
- **THEN** there SHALL be NO WebView polyfill fallback
- **THEN** the user SHALL see a "重试" button

#### Scenario: NodeMobile 重启
- **WHEN** the user triggers "重试" or source reload
- **THEN** NodeMobile runtime SHALL be stopped and restarted
- **THEN** the app SHALL wait for the new `server-ready` signal

### Requirement: 框架集成
NodeMobile.framework SHALL be extracted from MiraPlay IPA and placed in the project.

#### Scenario: 框架复制
- **WHEN** setting up the project
- **THEN** `docs/ipa/MiraPlay_extracted/.../NodeMobile.framework` SHALL be copied to `CatPlayer/app/Frameworks/NodeMobile.framework/`
- **WHEN** pod install runs
- **THEN** `FRAMEWORK_SEARCH_PATHS` SHALL include `../Frameworks` (via patch.js post_install)
- **THEN** Xcode SHALL link the extracted NodeMobile.framework instead of npm's bundled version

### Requirement: 依赖安装
The project SHALL install nodejs-mobile-react-native.

#### Scenario: setup.sh 集成
- **WHEN** setup.sh runs
- **THEN** it SHALL install `nodejs-mobile-react-native` via npm
- **THEN** it SHALL copy `dist/nodejs-runtime.js` into `app/nodejs-assets/nodejs-project/main.js`
