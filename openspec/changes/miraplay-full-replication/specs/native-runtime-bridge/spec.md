## ADDED Requirements

### Requirement: 双向消息通道 (rn-bridge)
The app SHALL implement a bidirectional message channel between React Native and the NodeMobile runtime, corresponding to MiraPlay's myaddon (`_linkedBinding('myaddon')`).

#### Scenario: Node.js → RN 消息
- **WHEN** Node.js code calls `sendMessageToNative(msg)`
- **THEN** the message SHALL be delivered via rn-bridge `channel.on('message', ...)`
- **THEN** the RN side SHALL parse the JSON message
- **THEN** the RN side SHALL dispatch based on `type` field:
  - `server-ready` → mark native runtime ready
  - `node-started` → heartbeat
  - `node-log` → log with level
  - `sniff` → call SniffModule and return result

#### Scenario: RN → Node.js 消息
- **WHEN** RN sends a message via `NodeJS.channel.send(msg)`
- **THEN** Node.js SHALL receive it via `rn_bridge.channel.on('message', handler)`
- **THEN** the message SHALL be parsed as JSON
- **THEN** Node.js SHALL dispatch based on `action` field:
  - `run` → call `loadScript(data.path)`
  - `nativeServerPort` → set the Dart port
  - other actions → handled as needed

#### Scenario: SNIFF 请求响应
- **WHEN** Node.js sends a `sniff` message with `url`, `rule`, `timeout`, `correlationId`
- **THEN** RN SHALL call `NativeModules.SniffModule.sniff(url, rule, timeout)`
- **THEN** RN SHALL send the result back via `NodeJS.channel.send(JSON.stringify({correlationId, result}))`

### Requirement: 直连 HTTP 请求
When NodeMobile is ready, the app SHALL use direct HTTP requests instead of WebView postMessage bridge.

#### Scenario: API 请求转发
- **WHEN** `CatApi.getConfig()` is called
- **THEN** the request SHALL go to `http://127.0.0.1:{port}/config` via `fetch()`
- **WHEN** `CatApi.home(api)` is called
- **THEN** the request SHALL go to `http://127.0.0.1:{port}{api}/home` via `fetch()`
- **THEN** all spider endpoints (`/spider/*/home`, `/spider/*/detail`, `/spider/*/play`, etc.) SHALL work through direct HTTP

#### Scenario: 请求头兼容
- **WHEN** making requests through direct HTTP
- **THEN** `content-type: application/json` SHALL be set by default
- **THEN** response SHALL parse as JSON when possible, fallback to raw string
