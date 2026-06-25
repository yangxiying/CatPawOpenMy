const { builtinModules } = require('module');
const rn_bridge = require('rn-bridge');

// 加载所有内置模块到 globalThis
builtinModules.forEach(mod => {
  if (!['trace_events'].includes(mod)) {
    globalThis[mod] = require(mod);
  }
});

let sourceModule;
let nativeServerPort = 0;

globalThis.catServerFactory = handle => {
  const server = require('http').createServer((req, res) => handle(req, res));
  server.on('listening', () => {
    const port = server.address().port;
    rn_bridge.channel.send(JSON.stringify({ type: 'server-ready', port }));
  });
  return server;
};

globalThis.catDartServerPort = () => nativeServerPort;

function loadScript(path) {
  try { sourceModule?.stop?.(); } catch {}
  delete require.cache[require.resolve(path + '/index.js')];
  const mod = require(path + '/index.js');
  sourceModule = mod;
  delete require.cache[require.resolve(path + '/index.config.js')];
  const config = require(path + '/index.config.js');
  mod.start(config.default || config);
}

rn_bridge.channel.on('message', (msg) => {
  try {
    const data = JSON.parse(msg);
    switch (data.action) {
      case 'run':
        loadScript(data.path);
        break;
      case 'nativeServerPort':
        nativeServerPort = data.port;
        break;
    }
  } catch (e) { console.error(e); }
});

rn_bridge.channel.send(JSON.stringify({ type: 'node-started', message: 'runtime ready' }));

// Auto-load embedded spider server from the same directory (nodejs-assets/nodejs-project/)
// This makes the IPA self-contained — all spiders are bundled at build time.
// Remote `action: 'run'` can still override with a newer bundle at runtime.
try {
  loadScript(__dirname);
  console.log('[main.js] embedded spider server loaded from', __dirname);
} catch (e) {
  console.error('[main.js] auto-load embedded spider server failed:', e?.message || e);
}
