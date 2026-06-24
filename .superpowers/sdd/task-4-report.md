# Task 4 Report: HLS 反向代理

## Status
Done.

## Files changed
- `nodejs/src/proxy/hls.ts` (create) — Fastify plugin with `/:encoded/:path(*)` route, handles m3u8 fetch+rewrite and TS stream passthrough
- `nodejs/src/index.js` (modify, 2 lines) — import + register plugin after `server.register(router)` with prefix `/proxy/hls`

## Test evidence
- `npm run build` succeeds (dist/index.js generated)
- Bundle contains `proxy/hls/` route registration, `encodeURIComponent` for base URL encoding, and playlist URI rewrite logic

## Concerns
- `.ts` import in index.js works because esbuild handles it natively (no separate tsconfig needed)
- The brief originally said to modify `router.js` but the instructions (and architecture pattern) correctly direct registration in `index.js` — HLS proxy is a general service, not a spider
