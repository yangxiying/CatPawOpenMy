/**
 * 端到端测试：模拟 WebView 环境加载 polyfill + bundle
 * 验证全链路：polyfill init → ready msg → bundle load → start → port msg
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();

const polyfillSrc = readFileSync(path.join(ROOT, 'CatPlayer/overlay/src/node/polyfills.js'), 'utf8');
const bundleSrc = readFileSync(path.join(ROOT, 'nodejs/dist/index.js'), 'utf8');
const configSrc = readFileSync(path.join(ROOT, 'nodejs/dist/index.config.js'), 'utf8');

console.log(`polyfill: ${(polyfillSrc.length / 1024).toFixed(1)} KB`);
console.log(`bundle:   ${(bundleSrc.length / 1024).toFixed(1)} KB`);
console.log(`config:   ${(configSrc.length / 1024).toFixed(1)} KB`);

// ===== 模拟 WebView 环境 =====
const messages = [];
globalThis.window = globalThis;
globalThis.addEventListener = (type, cb) => {
    globalThis.__messageHandler = cb;
};
globalThis.postMessage = (data) => {
    if (globalThis.__messageHandler)
        globalThis.__messageHandler({ data: typeof data === 'string' ? data : JSON.stringify(data) });
};
globalThis.ReactNativeWebView = {
    postMessage: (json) => {
        try {
            const msg = JSON.parse(json);
            messages.push(msg);
            console.log(`[→ RN] type=${msg.type}${msg.port !== undefined ? ' port='+msg.port : ''}${msg.error ? ' error='+msg.error.slice(0,80) : ''}`);
        } catch (e) {
            console.log('[→ RN] raw (partial):', json.slice(0, 100));
        }
    },
};
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.btoa = btoa;
globalThis.atob = atob;
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;
globalThis.console = console;
globalThis.fetch = async (url) => {
    console.log(`[fetch] ${url}`);
    const code = bundleSrc;
    return {
        ok: true, status: 200,
        headers: { get: () => null, forEach: () => {} },
        text: async () => code, json: async () => JSON.parse(code),
    };
};

// ===== 加载 polyfill =====
console.log('\n=== 1. 加载 polyfill ===');
try {
    (new Function(polyfillSrc))();
    console.log('[PASS] polyfill init');
} catch(e) {
    console.error('[FAIL] polyfill init:', e.message);
    process.exit(1);
}

const readyMsg = messages.find(m => m.type === 'ready');
console.log(`  → ${readyMsg ? '收到 ready 消息' : '未收到 ready 消息 [WARN]'}`);

const checks = [
    ['require', typeof globalThis.require === 'function'],
    ['Buffer', typeof globalThis.Buffer?.from === 'function'],
    ['process', typeof globalThis.process?.cwd === 'function'],
    ['catServerFactory', typeof globalThis.catServerFactory === 'function'],
    ['catDartServerPort', typeof globalThis.catDartServerPort === 'function'],
];
for (const [name, ok] of checks) {
    console.log(`  ${ok ? '[OK]' : '[FAIL]'} ${name}`);
}
if (checks.some(c => !c[1])) {
    console.error('\n[FAIL] 基础设施检查失败，终止');
    process.exit(1);
}

// ===== 模拟 WebViewNode: 收到 'ready' → 注入 bundle =====
console.log('\n=== 2. 注入 bundle ===');

async function runBundle(bundleCode, configCode) {
    const m = { exports: {} };
    const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', bundleCode);
    fn(globalThis.require, m, m.exports, '/main.js', '/');
    const mod = m.exports.default || m.exports;
    console.log(`  mod type: ${typeof mod}, keys: [${Object.keys(mod).slice(0,15)}]`);
    console.log(`  mod.start: ${typeof mod.start}`);

    const config = {};
    try {
        const cfgFn = new Function('exports','module', configCode);
        const cfgM = {exports:{}};
        cfgFn(cfgM.exports, cfgM);
        Object.assign(config, cfgM.exports.default || cfgM.exports);
        console.log(`  config loaded, keys: [${Object.keys(config).slice(0,10)}]`);
    } catch(e) {
        console.log(`  config load skipped: ${e.message}`);
    }

    if (typeof mod.start === 'function') {
        console.log('  calling mod.start(config)...');
        try {
            await mod.start(config);
            console.log('  mod.start() returned OK');
        } catch(e) {
            console.error(`  [FAIL] mod.start threw: ${e.message}`);
            if (e.stack) console.error(e.stack.split('\n').slice(0,6).join('\n'));
            throw e;
        }
    } else {
        console.log('  [WARN] no start function');
    }
}

try {
    await runBundle(bundleSrc, configSrc);
} catch(e) {
    console.error(`\n[FAIL] Bundle execution failed: ${e.message}`);
    process.exit(1);
}

// 等待 avvio 异步 boot → listen → port
console.log('  等待异步 boot...');
await new Promise(r => setTimeout(r, 500));

// ===== 验证 =====
console.log('\n=== 3. 验证结果 ===');
const portMsg = messages.find(m => m.type === 'port');
if (portMsg) {
    console.log(`[PASS] 收到 port 消息: port=${portMsg.port}`);
} else {
    console.log(`[FAIL] 未收到 port 消息`);
    console.log(`  共 ${messages.length} 条消息:`, messages.map(m => m.type).join(', '));
}

const errMsgs = messages.filter(m => m.type === 'error');
if (errMsgs.length) {
    console.log(`\n警告: ${errMsgs.length} 条错误消息:`);
    errMsgs.forEach(m => console.log(`  error=${m.error}`));
}

// 尝试发出请求测试
if (portMsg) {
    console.log('\n=== 4. 模拟请求 ===');
    const port = portMsg.port;
    // 通过 polyfill 的消息通道发出请求
    globalThis.__messageHandler({
        data: JSON.stringify({
            type: 'request',
            reqId: 1,
            method: 'GET',
            url: '/config',
            port,
            headers: {},
            body: null,
        })
    });
    // 等一个 tick 让 handler 处理
    await new Promise(r => setTimeout(r, 100));
    const respMsgs = messages.filter(m => m.type === 'response');
    if (respMsgs.length) {
        console.log(`[PASS] 收到 ${respMsgs.length} 条响应`);
        const finalResp = respMsgs[respMsgs.length - 1];
        console.log(`  status=${finalResp.status}, body=${(finalResp.body||'').slice(0,200)}`);
    } else {
        console.log('[WARN] 未收到响应消息');
    }
}

console.log('\n=== DONE ===');
