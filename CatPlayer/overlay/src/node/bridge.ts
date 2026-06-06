/**
 * WebView ↔ RN 通信桥：request/response ID 匹配，异步等待。
 */

let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }>();

export interface BridgeRequest {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface BridgeResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}

/** 从 WebView onMessage 回调处理 */
export function handleWebViewMessage(event: any) {
    try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'response' && pending.has(msg.reqId)) {
            const p = pending.get(msg.reqId)!;
            clearTimeout(p.timer);
            pending.delete(msg.reqId);
            if (msg.error) {
                p.reject(new Error(msg.error));
            } else {
                p.resolve({ status: msg.status, headers: msg.headers || {}, body: msg.body || '' });
            }
        }
    } catch {}
}

/** RN → WebView 发送请求，等待响应 */
export function sendRequest(
    postMessage: (msg: string) => void,
    req: BridgeRequest,
    timeoutMs = 30000
): Promise<BridgeResponse> {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('bridge request timeout'));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        postMessage(JSON.stringify({ type: 'request', reqId: id, ...req }));
    });
}

export function rejectAll(error: string) {
    pending.forEach((p) => {
        clearTimeout(p.timer);
        p.reject(new Error(error));
    });
    pending.clear();
}
