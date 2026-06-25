# Fix: IPA Shows Only 2 Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the iOS IPA build that only shows 2 hardcoded demo sites on the phone, when the Node.js spider server actually registers 7+ spiders (dozens of sites when counting sub-sites).

**Architecture:** Two root causes: (1) `overlay/src/ui/App.tsx` started on the `Demo` screen (hardcoded 2 sites) instead of `Boot` (live parse), (2) `dist/index.js` (spider server bundle with all 7 spiders) was never embedded in the IPA — `main.js` only started the Node.js runtime but didn't load the spider server, relying on a remote download that may have fewer spiders.

**Tech Stack:** React Native (TypeScript), Node.js (Fastify), esbuild, nodejs-mobile-react-native

## Global Constraints

- **No cosmetic/structural changes outside the fix scope.** Only change what's needed.
- **Remote `action: 'run'` override preserved** — the bundle is auto-loaded at startup, but remote updates via rn-bridge still work.
- **Follow established patterns** in the codebase: the `Boot → parseSites → replace('Sites', { config })` flow is already working.
- **Prettier printWidth=10000**: don't break long lines.

---
### Task 1: Fix Initial Route in overlay App.tsx

**Files:**
- Modify: `CatPlayer/overlay/src/ui/App.tsx:41`

**Interfaces:**
- Consumes: existing `Boot` component (already imported, already in `SCREENS` map)
- Produces: app starts on `Boot` screen, which auto-runs `parseSites()` and navigates to `Sites` with the full config

**Root cause:** The committed version of `overlay/src/ui/App.tsx` line 41 still has `{ name: 'Demo' }`. The working tree already has `{ name: 'Boot' }` but it was never committed. The IPA was built from the committed `'Demo'` version.

- [x] **Step 1-4:** Already applied in working tree. Stage and commit.

```bash
git add CatPlayer/overlay/src/ui/App.tsx
```

The diff is:
```diff
-    const [stack, setStack] = useState<Route[]>([{ name: 'Demo' }]);
+    const [stack, setStack] = useState<Route[]>([{ name: 'Boot' }]);
```

---
### Task 2: Embed Spider Server Bundle in IPA

**Files:**
- Create (copy): `nodejs/dist/index.js` → `nodejs-assets/nodejs-project/index.js` (via setup.sh)
- Modify: `nodejs/src/main.js:49-59` (add auto-load)
- Modify: `CatPlayer/setup.sh:83-87` (add copy step)

**Interfaces:**
- Consumes: `dist/index.js` (built by `npm run build`, contains all 7 spiders), `dist/index.config.js` (already embedded), `dist/nodejs-runtime.js` (already embedded as `main.js`)
- Produces: Node.js runtime auto-loads the spider server at startup, making the IPA fully self-contained

**Root cause:** `setup.sh` only copied `nodejs-runtime.js` and `index.config.js` to `nodejs-assets/`, but NOT `index.js` (the spider server bundle). The phone's Node.js runtime (`main.js`) only started the Node.js shell and waited for an `action: 'run'` message to load the spider server. Without a remote download, no server started → no config served → Boot timed out → back to Demo fallback? No — Boot never gets to Demo, but the app still starts on Demo because of the initial route bug.

- [x] **Step 1: Add auto-load in main.js** — Already applied. After `node-started` message, `main.js` auto-calls `loadScript(__dirname)` to load the embedded spider bundle from `nodejs-assets/nodejs-project/`.

```diff
+ // Auto-load embedded spider server from the same directory (nodejs-assets/nodejs-project/)
+ // This makes the IPA self-contained — all spiders are bundled at build time.
+ // Remote `action: 'run'` can still override with a newer bundle at runtime.
+ try {
+   loadScript(__dirname);
+   console.log('[main.js] embedded spider server loaded from', __dirname);
+ } catch (e) {
+   console.error('[main.js] auto-load embedded spider server failed:', e?.message || e);
+ }
```

The `loadScript(__dirname)` call finds `index.js` (spider bundle) and `index.config.js` (config) in the same directory as `main.js`, loads them, and starts the Fastify server with all 7 spiders.

- [x] **Step 2: Copy dist/index.js in setup.sh** — Already applied. Added after the existing `nodejs-runtime.js` copy:

```bash
    # 复制蜘蛛服务 bundle（含所有爬虫），main.js 自动加载
    if [ -f "$SPIDER_DIR/dist/index.js" ]; then
        cp "$SPIDER_DIR/dist/index.js" "$APP_DIR/nodejs-assets/nodejs-project/index.js"
        echo "  index.js (spider bundle) copied to nodejs-assets/"
    fi
```

- [x] **Step 3: Verify build** — Build succeeded, all 7/7 spiders in `dist/index.js`, auto-load code present in minified `dist/nodejs-runtime.js`.

- [ ] **Step 4: Commit**

```bash
git add nodejs/src/main.js CatPlayer/setup.sh CatPlayer/overlay/src/ui/App.tsx
git commit -m "fix: embed spider bundle in IPA and auto-load on startup

Root cause 1: overlay/src/ui/App.tsx defaulted to Demo screen with
2 hardcoded sites. Changed initial route to Boot so it calls
CatApi.getConfig() to get the full site list.

Root cause 2: dist/index.js (spider server with all 7 spiders) was
never embedded in the IPA. setup.sh only copied nodejs-runtime.js
and index.config.js. The phone relied on a remote download that
had fewer spiders.

Fix:
- overlay/src/ui/App.tsx: Demo → Boot (initial route)
- nodejs/src/main.js: auto-load embedded spider server via
  loadScript(__dirname) at startup
- CatPlayer/setup.sh: copy dist/index.js to
  nodejs-assets/nodejs-project/index.js

Co-Authored-By: AtomCode (deepseek-v4-flash) <noreply@atomgit.com>"
```

---
## Self-Review

**1. Spec coverage:** The user's bug ("IPA shows only 2 sites") is fully addressed: (a) the app no longer starts on the hardcoded Demo screen, (b) the spider bundle is embedded in the IPA so all 7 spiders are available locally, (c) `main.js` auto-loads it on startup.

**2. Placeholder scan:** No placeholders.

**3. Type consistency:** All interfaces are consistent. `loadScript(__dirname)` uses the same path pattern as `loadScript(data.path)` from `action: 'run'`. The `start(config)` function in `src/index.js` already handles being called multiple times (it creates a new Fastify server each time).
