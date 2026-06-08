/**
 * 隐藏 WebView — 加载 Node.js 源 bundle + polyfill，通过 postMessage 桥通信。
 * RN 侧通过 WebViewRef.postMessage 发请求，WebView 内 http.createServer polyfill 拦截。
 */
import React, { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { handleWebViewMessage, BridgeRequest, BridgeResponse, sendRequest, rejectAll } from './bridge';

export interface WebViewNodeRef {
    request: (req: BridgeRequest) => Promise<BridgeResponse>;
    injectJS: (code: string) => void;
}

interface Props {
    bundleCode: string;           // index.js 源码
    configCode: string;           // index.config.js 源码
    polyfillCode: string;         // polyfill.js 内容（base64 编码的 JS 字符串）
    onReady?: (port: number) => void;
    onError?: (msg: string) => void;
    onLog?: (msg: string) => void;
}

const WebViewNode = forwardRef<WebViewNodeRef, Props>(({ bundleCode, configCode, polyfillCode, onReady, onError, onLog }, ref) => {
    const wvRef = useRef<WebView>(null);
    const readyRef = useRef(false);

    const postToWv = useCallback((msg: string) => {
        wvRef.current?.postMessage(msg);
    }, []);

    useImperativeHandle(ref, () => ({
        request: (req) => sendRequest(postToWv, req),
        injectJS: (code) => wvRef.current?.injectJavaScript(code),
    }));

    const handleMessage = useCallback((e: WebViewMessageEvent) => {
        let _msg: any;
        try { _msg = JSON.parse(e.nativeEvent.data); } catch { return; }
        const msg = _msg;
        onLog?.(`msg from WebView: ${msg.type}`);
        switch (msg.type) {
            case 'ready':
                onLog?.('WebView polyfill ready');
                const bCode = bundleCode;
                const cCode = configCode;
                onLog?.('bundle size=' + bCode.length + ' config size=' + cCode.length);
                // 注入 bundleCode + configCode 直接执行
                wvRef.current?.injectJavaScript(`
                    (async () => {
                        try {
                            window._log('bundle eval start, len=${bCode.length}');
                            const code = ${JSON.stringify(bCode)};
                            const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', code);
                            const m = { exports: {} };
                            fn(globalThis.require, m, m.exports, '/main.js', '/');
                            window._log('bundle fn executed, exports=' + (typeof m.exports));
                            const mod = m.exports.default || m.exports;
                            window._log('mod.start=' + (typeof mod.start));
                            if (mod.start) {
                                const config = { default: {} };
                                try {
                                    const cfgCode = ${JSON.stringify(cCode)};
                                    const cfgFn = new Function('exports','module',cfgCode);
                                    const cfgM = {exports:{}};
                                    cfgFn(cfgM.exports, cfgM);
                                    const cfg = cfgM.exports.default || cfgM.exports;
                                    config.default = cfg;
                                    window._log('config loaded');
                                } catch(e) { window._log('config fail: ' + e); console.log('config load failed, using empty'); }
                                window._log('calling mod.start...');
                                await mod.start(config.default);
                                window._log('mod.start returned');
                            } else {
                                window._log('ERROR: no mod.start');
                            }
                        } catch(e) {
                            window._log('bundle error: ' + (e && e.stack ? e.stack : String(e)));
                            window.ReactNativeWebView?.postMessage(JSON.stringify({type:'error',error:String(e)}));
                        }
                    })();
                `);
                break;
            case 'port':
                readyRef.current = true;
                onReady?.(msg.port);
                break;
            case 'error':
                onError?.(msg.error);
                break;
            case 'log':
                onLog?.(msg.msg);
                break;
            case 'proxyRequest':
                // WebView 内 http.createServer polyfill 发来的外部 API 请求
                // 由 RN 侧执行真实 HTTP 请求并回传响应
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
    }, [bundleCode, configCode, onReady, onError, onLog]);

    // polyfillCode 是 JS 字符串（function POLYFILL_SOURCE() { ... } 的源码）
    // 需要定义 + 立即执行。外层 try/catch 兜底
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
try {
${polyfillCode}
POLYFILL_SOURCE();
} catch(e) {
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'error',error:'polyfill exec: '+e})); } catch {}
}
</script></body></html>`;

    return (
        <View style={styles.hidden}>
            <WebView
                ref={wvRef}
                source={{ html }}
                style={styles.webview}
                originWhitelist={['*']}
                onMessage={handleMessage}
                javaScriptEnabled
                allowFileAccess
                allowUniversalAccessFromFileURLs
                mixedContentMode="always"
                cacheEnabled={false}
                allowFileAccessFromFileURLs
            />
        </View>
    );
});

const styles = StyleSheet.create({
    hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -9999 },
    webview: { flex: 1 },
});

export default WebViewNode;
