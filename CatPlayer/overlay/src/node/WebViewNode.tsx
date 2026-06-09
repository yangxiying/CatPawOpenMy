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
const CDN_SCRIPTS = `
<script src="https://lib.baomitu.com/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://lib.baomitu.com/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://lib.baomitu.com/axios/0.26.0/axios.min.js"></script>
<script src="https://lib.baomitu.com/dayjs/1.10.8/dayjs.min.js"></script>
<link rel="stylesheet" href="https://lib.baomitu.com/antd/5.23.3/reset.min.css" />
<script src="https://lib.baomitu.com/antd/5.23.3/antd.min.js"></script>
`;

const WebViewNode = forwardRef<WebViewNodeRef, Props>(({ bundleCode, configCode, polyfillCode, onReady, onError, onLog, visible, onPlay }, ref) => {
    const wvRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const isWebsite = bundleCode.includes('globalThis.websiteBundle');

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
            return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>${CDN_SCRIPTS}</head><body><div id="www"></div><script>
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
                onLog?.('WebView polyfill ready');
                if (isWebsite) {
                    // 网站源：new Function bundle → websiteBundle() → new Function inner → render
                    wvRef.current?.injectJavaScript(`
(async () => {
var _log = window._log || function(m) { try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'log',msg:'[WV] '+m})); } catch(e) {} };
try {
    const bCode = ${JSON.stringify(bundleCode)};
    _log('website eval start, len=' + bCode.length);
    var __req = window.__catpaw_require || globalThis.require || window.require || function(n) { return {}; };
    _log('require type=' + typeof __req);
    var __fn = new Function('require', 'module', 'exports', '__filename', '__dirname', bCode);
    var __m = { exports: {} };
    __fn(__req, __m, __m.exports, '/main.js', '/');
    _log('websiteBundle=' + (typeof globalThis.websiteBundle));
    if (typeof globalThis.websiteBundle !== 'function') { throw new Error('not a website source'); }
    const innerCode = globalThis.websiteBundle();
    _log('inner len=' + innerCode.length);
    var lastIdx = innerCode.lastIndexOf('})()');
    var patched = innerCode.slice(0, lastIdx) + 'globalThis.__WS=module.exports;' + innerCode.slice(lastIdx);
    var __fn2 = new Function('require', 'module', 'exports', '__filename', '__dirname', patched);
    var __m2 = { exports: {} };
    __fn2(__req, __m2, __m2.exports, '/main.js', '/');
    var ws = globalThis.__WS; delete globalThis.__WS;
    _log('ws exports: ' + (ws ? Object.keys(ws).join(',') : 'undefined'));
    if (ws && typeof ws.renderClient === 'function') {
        var app = ws.renderClient();
        _log('renderClient returned: ' + typeof app);
        if (app != null) {
            var www = document.getElementById('www');
            if (typeof app === 'function') { ReactDOM.createRoot(www).render(React.createElement(app)); }
            else { ReactDOM.createRoot(www).render(app); }
        }
        _log('website rendered');
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'websiteReady', port:1}));
    } else {
        _log('no renderClient in ws exports');
    }
} catch(e) {
    _log('website error: ' + (e && e.stack ? e.stack : String(e)));
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',error:String(e)})); } catch(ee) {}
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
    const code = ${JSON.stringify(bCode)};
    const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', code);
    const m = { exports: {} };
    fn(window.__catpaw_require || globalThis.require, m, m.exports, '/main.js', '/');
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
        await mod.start(config.default);
        _log('mod.start returned');
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
                        wvRef.current?.injectJavaScript(`
(() => {
    const p = window.__PENDING_REQUESTS.get(${msg.reqId});
    if (p) { p.resolve({ statusCode: ${resp.status}, headers: ${JSON.stringify(respHeaders)}, body: ${JSON.stringify(respBody)} }); window.__PENDING_REQUESTS.delete(${msg.reqId}); }
})();
`);
                    } catch (e: any) {
                        wvRef.current?.injectJavaScript(`
(() => {
    const p = window.__PENDING_REQUESTS.get(${msg.reqId});
    if (p) { p.reject(new Error(${JSON.stringify(String(e))})); window.__PENDING_REQUESTS.delete(${msg.reqId}); }
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
    visible: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    webview: { flex: 1 },
});

export default WebViewNode;
