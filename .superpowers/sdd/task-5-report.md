# Task 5 Report: URL Sniffing Infrastructure

## Changes Summary
- **`CatPlayer/app/ios/CatPlayer/PlayerBridge/SniffModule.h`** — RCTBridgeModule interface declaring `sniff:rule:timeout:resolver:rejecter:`
- **`CatPlayer/app/ios/CatPlayer/PlayerBridge/SniffModule.m`** — Full implementation with:
  - `_SniffScriptHandler` — dedicated WKScriptMessageHandler subclass (avoids `self` as handler, fixing brief's `initWithBlock` antipattern)
  - WKWebView created with `CGRectMake(0, 0, 1, 1)` and added to key window (fixes brief's `CGRectZero` that prevents rendering)
  - User-Agent extracted via `evaluateJavaScript:navigator.userAgent`
  - Cookies extracted via `httpCookieStore.getAllCookies:`
  - Returns `{url: foundUrl, headers: {User-Agent, Cookie}}` or `null` on timeout

## Files Changed
- **`CatPlayer/overlay/src/node/NodeService.tsx`** (lines 191-198, 562-571):
  - Added `data.type === 'sniff'` case inside `channel.on('message')` — calls `handleSniff()` and sends result with `correlationId` back via `NodeJS.channel.send`
  - Added `handleSniff(data)` private method — requires `NativeModules.SniffModule`, calls `SniffModule.sniff(url, rule, timeout)`, returns result or `null` on failure
- **`nodejs/src/main.js`** (lines 126-136, 168-183):
  - Added correlationId detection in `rn_bridge.channel.on('message')` — if message has `correlationId`, routes to pending requests map
  - Added `pendingRequests` map and `registerPendingRequest(correlationId, timeout)` function for future spider use

## Test Evidence
- LSP diagnostics not applicable (ObjC files have no TS LSP; NodeService.tsx and main.js have no syntax errors per read-back)
- No build step run (requires Xcode — not available in this environment)

## Concerns
- `SniffModule.m` references `[UIApplication sharedApplication].keyWindow` — deprecated in iOS 15+ but functional; brief's requirement matches iOS 13+ guard
- `pendingRequests` in `main.js` has no max-size guard; in practice only 1-2 pending requests expected per sniff cycle — safe for now
