# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CatPawOpenMy — Node.js API server embedded inside CatVodApp (Dart/Flutter mobile app). Provides content spider (scraper) endpoints for video, books, comics, music, and cloud storage sources.

## Commands

```bash
cd nodejs

# Dev server (port 3006, auto-reloads src/)
npm run dev

# Production build → dist/
npm run build

# Development build (with inline sourcemaps)
npm run build:dbg

# Install dependencies
npm install
```

## Architecture

### Embedding model

The server does NOT run standalone in production. The CatVodApp Dart runtime calls `start(config)` → `stop()` lifecycle functions exported from `src/index.js`. The runtime injects:

- `globalThis.catServerFactory` — custom HTTP server factory (set in `src/dev.js` for local dev)
- `globalThis.catDartServerPort` — returns the Dart app's internal message port (0 = no Dart host)

The built `dist/index.js` and `dist/index.config.js` are bundled as app assets. Each build produces a matching `.md5` hash file.

### Spider plugin system

Each spider in `src/spider/<category>/` exports `{ meta, api }`:

- `meta.key` — unique spider id
- `meta.type` — content category: `<10` video, `10-20` book, `20-30` comic, `30-40` music, `40-50` pan
- `api` — Fastify plugin registering standard routes: `init`, `home`, `category`/`dir`, `detail`/`file`, `play`, `search`, `test`

Routes auto-register at `/spider/<key>/<type>`. The `/config` endpoint assembles all spider metadata into the CatVodApp config format, grouped by type range.

Spider `test` route does self-test: calls its own routes via `inReq.server.inject()` and returns the full chain result.

### Key files

| File | Role |
|------|------|
| `src/index.js` | Server entry: `start(config)`, Fastify setup, JSON DB init, Dart message bridge |
| `src/router.js` | Spider registration + `/check` + `/config` endpoints |
| `src/index.config.js` | User-facing config: site URLs, Alist servers, Material You color themes |
| `src/dev.js` | Local dev launcher, sets up `catServerFactory`/`catDartServerPort` globals |
| `src/util/req.js` | Axios instance with keep-alive, no SSL verify |
| `src/util/misc.js` | Device fingerprint gen, URL fixing, HTML stripping, play URL formatting |

### Data flow

1. CatVodApp calls `start(config)` → Fastify server starts on `127.0.0.1:<port>`
2. App discovers routes via `/config` → builds UI from spider metadata
3. User browses: `POST /spider/<key>/<type>/home` → spider scrapes upstream API
4. User plays: `POST /spider/<key>/<type>/play` → spider resolves play URL (may chain through parser/ALI auth)

### JSON DB

`node-json-db` persisted at `$NODE_PATH/db.json`. Used for device fingerprints and other persistent state. Cleared when app cache is cleared.

## Build

- **esbuild** (active): bundles to CJS, target node18, minifies index but NOT config (config must stay readable)
- **rollup** (obsolete): scripts kept for reference (`build:rollup*` in package.json)

GH Actions CI (`build-nodejs.yml`): manual trigger → `npm i && npm run build` → uploads `dist/` artifact.

## Constraints

- No WASM support in embedded runtime
- No JIT on macOS/iOS (embedded Node lacks JIT)
- Production server uses port 0 (OS auto-assign); dev uses port 3006
- All spider HTTP goes through `src/util/req.js` (keep-alive, no SSL reject)
- `forceCloseConnections: true` for clean app restart cycles
- `printWidth: 10000` in Prettier config (effectively disables line-width wrapping)
