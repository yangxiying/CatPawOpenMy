/**
 * WebView — 支持两类源：
 * 1. 服务源（server source）：隐藏 WebView，通过 postMessage 桥转发 HTTP 请求。
 * 2. 网站源（website source）：可见全屏 WebView，从 CDN 加载 React/antd 后渲染网站源 UI。
 */
import React, { useRef, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { handleWebViewMessage, BridgeRequest, BridgeResponse, sendRequest } from './bridge';

export interface WebViewNodeRef {
    request: (req: BridgeRequest) => Promise<BridgeResponse>;
    injectJS: (code: string) => void;
}

interface Props {
    bundleCode: string;
    configCode: string;
    polyfillCode: string;
    onReady?: (port: number) => void;
    onError?: (msg: string) => void;
    onLog?: (msg: string) => void;
    visible?: boolean;
    onPlay?: (url: string, title?: string) => void;
}

// 网站源依赖的 CDN 库（与 websiteBundle 内引用的版本一致）
// baomitu CDN 已失效（404），改用 unpkg
const CDN_SCRIPTS = `
<link rel="stylesheet" href="https://unpkg.com/antd@5.23.3/dist/reset.css" />
<script src="https://unpkg.com/react@18.2.0/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/dayjs@1.10.8/dayjs.min.js"></script>
<script src="https://unpkg.com/axios@0.26.0/dist/axios.min.js"></script>
<script src="https://unpkg.com/antd@5.23.3/dist/antd.min.js"></script>
`;

const WebViewNode = forwardRef<WebViewNodeRef, Props>(({ bundleCode, configCode, polyfillCode, onReady, onError, onLog, visible, onPlay }, ref) => {
    const wvRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const readyHandledRef = useRef(false);
    const isWebsite = bundleCode.includes('globalThis.websiteBundle') && !bundleCode.includes('catServerFactory');

    const postToWv = useCallback((msg: string) => {
        wvRef.current?.postMessage(msg);
    }, []);

    useImperativeHandle(ref, () => ({
        request: (req) => sendRequest(postToWv, req),
        injectJS: (code) => wvRef.current?.injectJavaScript(code),
    }));

    // 构建 HTML
    const html = useMemo(() => {
        if (isWebsite) {
            return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><style>html,body,#app{margin:0;padding:0;width:100%;height:100%}#root,#www{display:none}</style>${CDN_SCRIPTS}</head><body><div id="root"></div><div id="app"></div><div id="www"></div><script>
(function(){
var _log=function(m){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',msg:m}))}catch(e){}};
function check(){
 if(window.React&&window.ReactDOM&&window.antd&&window.axios&&window.dayjs){
  try{
${polyfillCode}
POLYFILL_SOURCE();
  }catch(e){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',error:'polyfill:'+e}))}catch(ee){}}
  window.__POLYFILL_DONE=1;
  _log('CDN+polyfill ready');
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
 }else{setTimeout(check,50)}
}
check();
})();
</script></body></html>`;
        }
        // 服务源（保持原有行为）
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function(){ try {
${polyfillCode}
POLYFILL_SOURCE();
window.__POLYFILL_DONE = 1;
} catch(e) { try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'error',error:'polyfill exec: '+e})); } catch {} } })();
</script></body></html>`;
    }, [isWebsite, polyfillCode]);

    const handleMessage = useCallback((e: WebViewMessageEvent) => {
        let _msg: any;
        try { _msg = JSON.parse(e.nativeEvent.data); } catch { return; }
        const msg = _msg;
        onLog?.(`msg from WebView: ${msg.type}`);
        switch (msg.type) {
            case 'ready':
                if (readyHandledRef.current) { onLog?.('ready: already handled, skip'); break; }
                readyHandledRef.current = true;
                onLog?.('WebView polyfill ready');
                if (isWebsite) {
                    const bCode = bundleCode;
                    wvRef.current?.injectJavaScript(`
(async () => {
var _log = window._log || function(m) { try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'log',msg:'[WV] '+m})); } catch(e) {} };
try {
    _log('website eval start');
    var __req = window.__catpaw_require || globalThis.require || window.require;
    if (typeof __req !== 'function') { throw new Error('require not available'); }

    // Execute outer bundle to define globalThis.websiteBundle
    var __fn = new Function('require','module','exports','__filename','__dirname', ${JSON.stringify(bCode)});
    var __m = { exports: {} };
    __fn(__req, __m, __m.exports, '/main.js', '/');
    _log('outer bundle executed');

    // 网站源只渲染 WebView UI，不启动 Fastify 服务
    // 发送 port 消息让 RN 端 waitForReady() 继续
    window.ReactNativeWebView?.postMessage(JSON.stringify({type:'port',port:0}));
    _log('website mode: sent port=0');

    if (typeof globalThis.websiteBundle === 'undefined') {
        throw new Error('not a website source');
    }
    var innerCode = typeof globalThis.websiteBundle === 'function' ? globalThis.websiteBundle() : globalThis.websiteBundle;
    _log('innerCode len=' + innerCode.length);
    // inner bundle 内部 renderClient 自渲染到 document.getElementById("app")
    var __fn2 = new Function('require','module','exports','__filename','__dirname', innerCode + ';globalThis.__WS=module.exports;');
    var __m2 = { exports: {} };
    __fn2(__req, __m2, __m2.exports, '/main.js', '/');
    _log('inner bundle executed');
    var ws = globalThis.__WS || __m2.exports; delete globalThis.__WS;
    if (ws && typeof ws.renderClient === 'function') {
        ws.renderClient();
        _log('renderClient OK');
    } else {
        _log('no renderClient, keys=' + (ws ? Object.keys(ws).join(',') : 'null'));
    }
} catch(e) {
    _log('WEBSITE ERROR: ' + (e && e.stack ? e.stack : String(e)));
    window.ReactNativeWebView?.postMessage(JSON.stringify({type:'error',error:'website: '+String(e)}));
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'port',port:-1})); } catch {}
}
})();
`);
                } else {
                    // 服务源（保持原有行为）
                    const bCode = bundleCode;
                    const cCode = configCode;
                    onLog?.('bundle size=' + bCode.length + ' config size=' + cCode.length);
                    wvRef.current?.injectJavaScript(`
(async () => {
var _log = window._log || function(m) { try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'log',msg:'[WV] '+m})); } catch(e) {} };
try {
    _log('bundle eval start, len=${bCode.length}');
    var __req = window.__catpaw_require || globalThis.require;
    if (typeof __req !== 'function') {
        throw new Error('require not available (type=' + typeof __req + ')');
    }
    var _required = ['http','https','stream','util','zlib','events'];
    for (var i = 0; i < _required.length; i++) {
        var _m = __req(_required[i]);
        if (!_m || typeof _m !== 'object') {
            _log('WARN: require("' + _required[i] + '") returned ' + typeof _m);
        }
    }
    _log('polyfill modules OK');
    var _code = ${JSON.stringify(bCode)};
    var _extReqs = _code.match(/require\\("([^"]+)"\\)/g) || [];
    var _extModules = _extReqs.map(function(r){ return r.match(/require\\("([^"]+)"\\)/)[1]; });
    var _unsupported = _extModules.filter(function(m) { return _required.indexOf(m) === -1 && !__req(m); });
    if (_unsupported.length > 0) {
        _log('WARN: unsupported external requires: ' + _unsupported.join(', '));
    }
    const code = _code;
    const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', code);
    const m = { exports: {} };
    fn(__req, m, m.exports, '/main.js', '/');
    _log('bundle fn executed, exports=' + (typeof m.exports));
    const mod = m.exports.default || m.exports;
    _log('mod.start=' + (typeof mod.start));
    if (mod.start) {
        const config = { default: {} };
        try {
            const cfgCode = ${JSON.stringify(cCode)};
            const cfgFn = new Function('exports','module',cfgCode);
            const cfgM = {exports:{}};
            cfgFn(cfgM.exports, cfgM);
            const cfg = cfgM.exports.default || cfgM.exports;
            config.default = cfg;
            _log('config loaded');
        } catch(e) { _log('config fail: ' + e); console.log('config load failed, using empty'); }
        _log('calling mod.start...');
        try {
            await mod.start(config.default);
            _log('mod.start returned OK');
        } catch(startErr) {
            _log('mod.start FAILED: ' + (startErr?.stack || String(startErr)));
            console.error('[WV] mod.start error', startErr);
            throw startErr;
        }
    } else {
        _log('ERROR: no mod.start');
    }
} catch(e) {
    try { _log('bundle error: ' + (e && e.stack ? e.stack : String(e))); } catch(ee) {}
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'error',error:String(e)})); } catch(ee) {}
}
})();
`);
                }
                break;
            case 'port':
                readyRef.current = true;
                onReady?.(msg.port);
                break;
            case 'websiteReady':
                readyRef.current = true;
                onReady?.(1);
                break;
            case 'play':
                onLog?.('play request: ' + (msg.url || ''));
                onPlay?.(msg.url, msg.title);
                break;
            case 'error':
                onError?.(msg.error);
                break;
            case 'log':
                onLog?.(msg.msg);
                break;
            case 'proxyRequest':
                (async () => {
                    try {
                        const url = msg.url;
                        const method = msg.method || 'GET';
                        const headers = msg.headers || {};
                        const body = msg.body || null;
                        const resp = await fetch(url, {
                            method,
                            headers: { ...headers, 'Accept-Encoding': 'identity' },
                            body: method !== 'GET' && method !== 'HEAD' && body ? body : undefined,
                        });
                        const respBody = await resp.text();
                        const respHeaders: Record<string, string> = {};
                        resp.headers.forEach((v: string, k: string) => { respHeaders[k] = v; });
                        const pid = msg.proxyId || msg.reqId;
                        wvRef.current?.injectJavaScript(`
(() => {
    var p = window.__PROXY && window.__PROXY.pending && window.__PROXY.pending[${JSON.stringify(pid)}];
    if (!p) p = window.__PENDING_REQUESTS && window.__PENDING_REQUESTS.get(${msg.reqId});
    if (p) { p.resolve(${JSON.stringify(respBody)}); if(window.__PROXY&&window.__PROXY.pending) delete window.__PROXY.pending[${JSON.stringify(pid)}]; }
})();
`);
                    } catch (e: any) {
                        const pid = msg.proxyId || msg.reqId;
                        wvRef.current?.injectJavaScript(`
(() => {
    var p = window.__PROXY && window.__PROXY.pending && window.__PROXY.pending[${JSON.stringify(pid)}];
    if (!p) p = window.__PENDING_REQUESTS && window.__PENDING_REQUESTS.get(${msg.reqId});
    if (p) { p.reject(new Error(${JSON.stringify(String(e))})); if(window.__PROXY&&window.__PROXY.pending) delete window.__PROXY.pending[${JSON.stringify(pid)}]; }
})();
`);
                    }
                })();
                break;
            default:
                handleWebViewMessage(e);
        }
    }, [bundleCode, configCode, isWebsite, onReady, onError, onLog, onPlay]);

    const polyfillCodeRef = useRef(polyfillCode);

    const handleLoad = useCallback(() => {
        if (isWebsite) return;
        onLog?.('WebView loaded, injecting polyfill (fallback)...');
        wvRef.current?.injectJavaScript(`
if (window.__POLYFILL_DONE) { true; return; }
try {
${polyfillCodeRef.current}
POLYFILL_SOURCE();
} catch(e) {
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'error',error:'polyfill exec: '+e})); } catch {}
}
true;
`);
    }, [onLog, isWebsite]);

    return (
        <View style={visible ? styles.visible : styles.hidden}>
            <WebView
                ref={wvRef}
                source={{ html }}
                style={styles.webview}
                originWhitelist={['*']}
                onMessage={handleMessage}
                onLoad={handleLoad}
                javaScriptEnabled
                allowFileAccess
                allowUniversalAccessFromFileURLs
                mixedContentMode="always"
                cacheEnabled={false}
                allowFileAccessFromFileURLs
                scrollEnabled={!visible}
                bounces={false}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -9999 },
    visible: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
    webview: { flex: 1, width: '100%', height: '100%' },
});

export default WebViewNode;
