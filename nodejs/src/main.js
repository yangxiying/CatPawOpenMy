/**
 * Node.js 运行时入口 — 嵌入到 App 中运行的真实 Node.js 环境。
 * 替代 WebView polyfill 方案，提供完整的 Node.js API。
 * 参考 MiraPlay 的 loadScript + catServerFactory 模式。
 *
 * 通信方式：通过 rn-bridge（nodejs-mobile-react-native）与 RN 侧通信。
 */
import { createServer } from 'http';
import { start as startServer } from './index.js';
import * as config from './index.config.js';

// ============================================================
// 0. 日志转发 + 启动心跳
// ============================================================
(function() {
    var rn_bridge = null;
    try { rn_bridge = require('rn-bridge'); } catch(e) {}

    // 立即发送心跳，确认 rn-bridge 通道正常工作
    if (rn_bridge) {
        try {
            rn_bridge.channel.send(JSON.stringify({ type: 'node-started', message: 'runtime init' }));
        } catch(e) {}
    }

    function sendLog(level, msg) {
        try {
            if (rn_bridge) {
                rn_bridge.channel.send(JSON.stringify({ type: 'node-log', level: level, message: String(msg).slice(0, 500) }));
            }
        } catch(e) {}
    }
    
    var _origLog = console.log;
    var _origError = console.error;
    var _origWarn = console.warn;
    
    console.log = function() {
        var msg = Array.prototype.map.call(arguments, String).join(' ');
        sendLog('log', msg);
        return _origLog.apply(console, arguments);
    };
    
    console.error = function() {
        var msg = Array.prototype.map.call(arguments, String).join(' ');
        sendLog('error', msg);
        return _origError.apply(console, arguments);
    };
    
    console.warn = function() {
        var msg = Array.prototype.map.call(arguments, String).join(' ');
        sendLog('warn', msg);
        return _origWarn.apply(console, arguments);
    };
})();

// ============================================================
// 1. catServerFactory — 创建真实 HTTP 服务器
// ============================================================
let _fastifyPort = 0;

globalThis.catServerFactory = (handle) => {
    let port = 0;
    const server = createServer((req, res) => {
        handle(req, res);
    });
    server.on('listening', () => {
        port = server.address().port;
        console.log('[NodeJS] Run on ' + port);
        // 通知 RN 侧端口已就绪
        try {
            const rn_bridge = require('rn-bridge');
            rn_bridge.channel.send(JSON.stringify({
                type: 'server-ready',
                port: port,
            }));
        } catch (e) {
            console.log('[NodeJS] rn-bridge not available, port=' + port);
        }
    });
    server.on('close', () => {
        console.log('[NodeJS] Close on ' + port);
    });
    return server;
};

// ============================================================
// 2. catDartServerPort — 返回 native 端端口
// ============================================================
let _dartPort = 0;
globalThis.catDartServerPort = () => _dartPort;

// ============================================================
// 3. loadScript — 加载远程 bundle（参考 MiraPlay）
// ============================================================
let sourceModule = null;

function loadScript(path) {
    try {
        const indexJSPath = `${path}/index.js`;
        const indexConfigJSPath = `${path}/index.config.js`;
        // 清除缓存以确保每次重新加载
        delete require.cache[require.resolve(indexJSPath)];
        delete require.cache[require.resolve(indexConfigJSPath)];
        sourceModule = require(indexJSPath);
        const cfg = require(indexConfigJSPath);
        const cfgObj = cfg.default || cfg;
        sourceModule.start(cfgObj);
        console.log('[NodeJS] remote bundle loaded from ' + path);
    } catch (e) {
        console.error('[NodeJS] loadScript failed:', e.message || e);
    }
}

// ============================================================
// 4. rn-bridge 通道通信
// ============================================================
try {
    const rn_bridge = require('rn-bridge');
    
    rn_bridge.channel.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            console.log('[NodeJS] msg from RN:', data.type || 'unknown');

            // 有 correlationId → 来自 RN 的异步响应（如 sniff 结果），路由给 pending request
            if (data.correlationId) {
                const pending = pendingRequests[data.correlationId];
                if (pending) {
                    delete pendingRequests[data.correlationId];
                    pending.resolve(data.result || data);
                } else {
                    console.log('[NodeJS] orphan correlationId:', data.correlationId);
                }
                return;
            }

            switch (data.type) {
                case 'native-server-port':
                    _dartPort = data.port;
                    console.log('[NodeJS] native server port set to ' + _dartPort);
                    break;
                    
                case 'load-remote-bundle':
                    // data.path: 远程 bundle 文件路径
                    loadScript(data.path);
                    break;
                    
                case 'api-request':
                    // data.id, data.method, data.url, data.headers, data.body
                    // 处理 API 请求
                    handleApiRequest(data);
                    break;
                    
                default:
                    console.log('[NodeJS] unknown message type:', data.type);
            }
        } catch (e) {
            console.error('[NodeJS] message handling error:', e.message);
        }
    });
    
    console.log('[NodeJS] rn-bridge channel initialized');
} catch (e) {
    console.log('[NodeJS] rn-bridge not available (dev mode), running standalone');
}

// ============================================================
// 5. correlationId pending requests（嗅探等异步响应路由）
// ============================================================
const pendingRequests = {};

function registerPendingRequest(correlationId, timeout) {
  return new Promise((resolve, reject) => {
    pendingRequests[correlationId] = { resolve, reject };
    setTimeout(() => {
      if (pendingRequests[correlationId]) {
        delete pendingRequests[correlationId];
        reject(new Error('correlationId timeout'));
      }
    }, timeout || 15000);
  });
}

// ============================================================
// 6. API 请求处理（通过 rn-bridge 接收 RN 请求）
// ============================================================
const http = require('http');

function handleApiRequest(data) {
    const { id, method, url, headers, body } = data;
    
    // 构造请求转发到本地 Fastify 服务器
    const options = {
        hostname: '127.0.0.1',
        port: globalThis._serverPort || 18080,
        path: url,
        method: method || 'GET',
        headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
    };
    
    const req = http.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => responseBody += chunk);
        res.on('end', () => {
            try {
                const rn_bridge = require('rn-bridge');
                rn_bridge.channel.send(JSON.stringify({
                    type: 'api-response',
                    id: id,
                    status: res.statusCode,
                    headers: res.headers,
                    body: responseBody,
                }));
            } catch (e) {
                console.error('[NodeJS] failed to send response:', e.message);
            }
        });
    });
    
    req.on('error', (e) => {
        try {
            const rn_bridge = require('rn-bridge');
            rn_bridge.channel.send(JSON.stringify({
                type: 'api-response',
                id: id,
                status: 500,
                headers: {},
                body: JSON.stringify({ error: e.message }),
            }));
        } catch (e2) {
            console.error('[NodeJS] failed to send error:', e2.message);
        }
    });
    
    if (body) {
        req.write(body);
    }
    req.end();
}

// ============================================================
// 6. 启动服务
// ============================================================
console.log('[NodeJS] starting server...');
startServer(config.default);
