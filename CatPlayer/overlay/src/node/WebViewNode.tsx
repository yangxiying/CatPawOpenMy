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
    bundleUri: string;            // file:// URI 或 http URL 指向下载好的 index.js
    polyfillCode: string;         // polyfill.js 内容（base64 编码的 JS 字符串）
    onReady?: (port: number) => void;
    onError?: (msg: string) => void;
    onLog?: (msg: string) => void;
}

const WebViewNode = forwardRef<WebViewNodeRef, Props>(({ bundleUri, polyfillCode, onReady, onError, onLog }, ref) => {
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
        const msg = JSON.parse(e.nativeEvent.data);
        switch (msg.type) {
            case 'ready':
                onLog?.('WebView polyfill ready');
                // 注入下载并启动 bundle 的脚本
                wvRef.current?.injectJavaScript(`
                    (async () => {
                        try {
                            const res = await fetch('${bundleUri}');
                            const code = await res.text();
                            const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', code);
                            const m = { exports: {} };
                            fn(globalThis.require, m, m.exports, '/main.js', '/');
                            const mod = m.exports.default || m.exports;
                            if (mod.start) {
                                const config = { default: {} };
                                try {
                                    const cfgRes = await fetch('${bundleUri}'.replace('index.js','index.config.js'));
                                    const cfgCode = await cfgRes.text();
                                    const cfgFn = new Function('exports','module',cfgCode);
                                    const cfgM = {exports:{}};
                                    cfgFn(cfgM.exports, cfgM);
                                    const cfg = cfgM.exports.default || cfgM.exports;
                                    config.default = cfg;
                                } catch(e) { console.log('config load failed, using empty'); }
                                await mod.start(config.default);
                            }
                        } catch(e) {
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
                // WebView 内 http.createServer polyfill 发来的请求
                // 由 NodeService 处理并回传响应
                break;
            default:
                handleWebViewMessage(e);
        }
    }, [bundleUri, onReady, onError, onLog]);

    // polyfillCode 是 JS 字符串，通过 injectedJavaScript 注入
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>${polyfillCode}</script></body></html>`;

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
