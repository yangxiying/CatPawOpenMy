# Task 5 Report: BuiltinEngine 补全

## Status: DONE

### Files Modified
- `CatPlayer/overlay/src/player/engines/BuiltinEngine.ts` → renamed to `.tsx`, full implementation
- `CatPlayer/overlay/src/player/VideoPlayer.tsx` — adapted for engine-based rendering

### Commits
```
feat: complete BuiltinEngine implementation with Video component integration
```

### Changes Made

**BuiltinEngine.tsx:**
- Added private `ref`, `currentUri`, `currentHeaders` state fields
- `play(url, headers)` — stores playback state (VideoPlayer drives actual rendering)
- `pause()/resume()/seek()/setRate()` — delegates to Video ref
- `presentFullscreen()` — convenience for fullscreen toggle
- `destroy()` — nulls ref
- `renderVideo(props)` — returns `<Video>` JSX with all event handlers, chain `onLoad` to engine callback for resumePos support
- Added `controls` prop to `<Video>` (was present before, matches original behavior)

**VideoPlayer.tsx:**
- Removed top-level `let Video = require(...)` — BuiltinEngine owns Video import
- Added `hasBuiltinVideo` boolean for fallback check
- Engine creation now happens for ALL modes (previously only for non-builtin)
- Rendering: `engine.renderVideo()` for BuiltinEngine, `<View />` placeholder for MPV
- Fullscreen button uses `engine.presentFullscreen()` via engineRef
- Removed `ref` useRef (now owned by BuiltinEngine internally)
- Removed dead `speedKey`/`setSpeedKey` (no longer needed since Video remount not required for rate changes)

### Verification
- `engines/index.ts` `createEngine('mpv')` already catches errors → fallback to builtin (confirmed)
- `engines.ts` (legacy) references `require('./engines/BuiltinEngine')` — Metro resolves `.tsx`
- TypeScript: `npx tsc --noEmit` — no errors
- Git: `git mv` rename committed (delete .ts, add .tsx, modify VideoPlayer.tsx)

### Key Design Decisions
- `BuiltinEngine.tsx` must be `.tsx` because `renderVideo()` returns JSX
- `hasBuiltinVideo` replaces top-level `Video` check — BuiltinEngine handles its own require
- Engine `resumePos` seek happens via `engine.onLoad` callback (same pattern for both builtin and non-builtin)

## Post-Review Fixes (Task 5 Review)

### Fix 1 (HIGH): Stale closure in engine.onLoad resume
Removed resumePos logic from `engine.onLoad` callback — closure captured `resumePos` as null permanently. The `handleLoad` useCallback + `resumePos` prop on `renderVideo()` already handle resume correctly.

### Fix 2 (MEDIUM): Restore speedKey remount for speed changes
Added `speedKey` state and `<View key={speedKey}>` wrapper around `engine.renderVideo()` call. Increment on `cycleSpeed` to force React remount when speed changes.

### Fix 3 (MEDIUM): Remove duplicate engines/index.ts
`engines/index.ts` was dead code — `from './engines'` resolves to `engines.ts` (exact match wins). Deleted `engines/index.ts`.

### Files Modified
- `CatPlayer/overlay/src/player/VideoPlayer.tsx` — all 3 fixes
- `CatPlayer/overlay/src/player/engines/index.ts` — deleted

### Commits
```
fix: resolve resume position stale closure, restore speedKey remount, clean duplicate engines
```
