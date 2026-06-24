# Task 7 Report: DLNA 投屏（SSDP 发现 + SOAP 控制）

## Status: 完成

## Created files

| File | Description |
|------|-------------|
| `CatPlayer/app/ios/CatPlayer/PlayerBridge/DLNACasting.h` | Objective-C header, RCTEventEmitter subclass |
| `CatPlayer/app/ios/CatPlayer/PlayerBridge/DLNACasting.m` | BSD sockets SSDP discovery + SOAP control (GCDAsyncUdpSocket not available in Podfile) |
| `CatPlayer/overlay/src/player/DLNACasting.ts` | TypeScript wrapper + `DLNAPicker` React component |

## Modified files

| File | Change |
|------|--------|
| `CatPlayer/overlay/src/ui/screens/Settings.tsx` | Added `import` of DLNAPicker + `<DLNAPicker>` JSX after color modal |

## Implementation details

- **SSDP**: Uses BSD sockets (`socket()`, `setsockopt()`, `sendto()`, `recvfrom()`) instead of CocoaAsyncSocket because Podfile does not list that pod.
- **Device discovery**: M-SEARCH multicast to `239.255.255.250:1900`, collects responses via `dispatch_source` read handler for 5s, parses Device.xml for friendlyName/UDN/AVTransport controlURL.
- **SOAP control**: `SetAVTransportURI` → `Play` sequence (`cast`) and `Stop` (`stop`).
- **Events**: `onDeviceFound`, `onDeviceLost`, `onCastStatus` via RCTEventEmitter.
- **TypeScript**: `DLNACastingService` singleton + `DLNAPicker` Modal component integrated into Settings "投屏" row.

## Concerns

- `clang -fsyntax-only` not available in this env. Syntax verified by manual review against existing MPVPlayer/SniffModule patterns.
- No TypeScript language server for diagnostics. File follows same pattern as `MPVEngine.ts`.
- castUrl passed as `undefined` from Settings — DLNAPicker will not call `dlnaService.cast()` until a real video URL is provided.
- BSD socket dispatch loop runs on global background queue; thread safety for `devices` dictionary relies on main-thread event delivery for discovery results.
