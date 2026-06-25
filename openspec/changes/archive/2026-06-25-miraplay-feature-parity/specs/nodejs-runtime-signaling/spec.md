## ADDED Requirements

### Requirement: messageToDart bidirectional channel
The Node.js runtime SHALL expose `inReq.server.messageToDart(msg)` function that sends a JSON message to the native Dart/iOS layer and returns a response.

#### Scenario: sniff action
- **WHEN** spider play handler calls `messageToDart({action:'sniff', opt:{url, timeout, rule}})`
- **THEN** native layer receives the message, opens WebView, performs sniff, returns result
- **THEN** spider receives `{url, headers}` response asynchronously

#### Scenario: Response timeout
- **WHEN** native layer does not respond within the message timeout
- **THEN** `messageToDart` resolves with null/empty

### Requirement: Signaled port handshake
Node.js runtime SHALL report its listening port to the native layer via HTTP callback to `http://127.0.0.1:{catDartServerPort}/onCatPawOpenPort?port={nodePort}` on startup.

#### Scenario: Port registration
- **WHEN** Node.js server starts listening
- **THEN** creates HTTP request to native Dart server notifying of the assigned port
- **THEN** native layer stores the port for future message routing
