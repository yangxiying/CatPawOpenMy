# Task 6 Report: 加密解码器（NBY/jqq/站点解析器链）

## Status: Completed

## Files Created
- `nodejs/src/spider/util/decoder.ts` — NBY-XMYAE AES-256-ECB decryption, jqq- API resolver, commercial site parser chain
- `nodejs/src/spider/util/play-chain.ts` — `resolvePlayUrl(id)` combining NBY → jqq → parser chain → pass-through

## Files Modified
- `nodejs/src/spider/video/ffm3u8.js` — integrated `resolvePlayUrl` into `play()` handler, keeping backward compat with m3u8 proxy, sniff, and direct pass-through

## Test Evidence
- `node --experimental-strip-types --check src/spider/util/decoder.ts` — syntax OK
- `node --experimental-strip-types --check src/spider/util/play-chain.ts` — syntax OK
- `node --check src/spider/video/ffm3u8.js` — syntax OK

## Concerns
- `decoder.ts` uses `.ts` extension but actual runtime support depends on `--experimental-strip-types` or esbuild bundling. The `hls.ts` proxy file uses the same pattern, confirming project convention.
- `jqq-` API endpoint (`api.juquanquanapp.com`) is a hardcoded external dependency — may break if the source changes their API.
- Commercial parser URLs are hardcoded in `decoder.ts`; task brief mentions they should be configurable in `index.config.js`, but no config key was defined. If runtime configurability is needed, add a `parsers` key to `index.config.js` and thread it through.
