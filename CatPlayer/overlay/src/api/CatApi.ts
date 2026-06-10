// 封装本地爬虫服务接口（通过 WebView 桥通信）。
import NodeService from '../node/NodeService';

async function post(api: string, action: string, body?: any): Promise<any> {
    const res = await NodeService.request({
        method: 'POST',
        url: `${api}/${action}`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    NodeService?.log?.(`[CatApi] POST ${api}/${action} status=${res.status} bodyLen=${res.body?.length} preview=${String(res.body).slice(0,120)}`);
    try { return JSON.parse(res.body); } catch { return res.body; }
}

async function get(path: string): Promise<any> {
    const res = await NodeService.request({ method: 'GET', url: path });
    NodeService?.log?.(`[CatApi] GET ${path} status=${res.status} bodyLen=${res.body?.length} type=${typeof res.body} preview=${String(res.body).slice(0,200)}`);
    try { return JSON.parse(res.body); } catch { return res.body; }
}

export type Site = { key: string; type: number; name: string; api: string };
export type CatConfig = {
    video?: { sites: Site[] };
    read?: { sites: Site[] };
    comic?: { sites: Site[] };
    music?: { sites: Site[] };
    pan?: { sites: Site[] };
    color?: any[];
};

export const CatApi = {
    getConfig: (): Promise<CatConfig> => get('/config'),
    home: (api: string) => post(api, 'home'),
    category: (api: string, id: any, page: number, filters?: any) =>
        post(api, 'category', { id, page, filters: filters || {} }),
    detail: (api: string, id: any) => post(api, 'detail', { id }),
    play: (api: string, flag: string, id: string) => post(api, 'play', { flag, id }),
    search: (api: string, wd: string, page = 1) => post(api, 'search', { wd, page }),
    init: (api: string) => post(api, 'init'),
    /** 每站点每会话仅 init 一次（部分 spider 需先初始化设备/网盘状态）。 */
    ensureInit(api: string): Promise<any> {
        if (inited.has(api)) return Promise.resolve();
        const p = post(api, 'init').catch(() => {}).then(() => { inited.add(api); });
        inited.add(api); // 乐观，避免并发重复
        return p;
    },
};

const inited = new Set<string>();

export type Episode = { name: string; id: string };
export type PlayLine = { from: string; episodes: Episode[] };

/** 拆解 detail 返回的 vod_play_from / vod_play_url（$$$ 线路、# 分集、$ 名与址）。 */
export function splitPlay(vod: any): PlayLine[] {
    const froms = String(vod?.vod_play_from || '').split('$$$');
    const urls = String(vod?.vod_play_url || '').split('$$$');
    return froms.map((from, i) => {
        const episodes = String(urls[i] || '')
            .split('#')
            .filter(Boolean)
            .map(seg => {
                const idx = seg.indexOf('$');
                return idx >= 0
                    ? { name: seg.slice(0, idx) || seg, id: seg.slice(idx + 1) }
                    : { name: seg, id: seg };
            });
        return { from: from.trim(), episodes };
    }).filter(l => l.episodes.length > 0);
}

export type Quality = { label: string; url: string };

/** play 返回的 url 可能是字符串直链、"标签,URL,标签,URL" 逗号对、或数组。 */
export function parsePlayUrl(u: any): Quality[] {
    if (Array.isArray(u)) {
        const out: Quality[] = [];
        for (let i = 0; i + 1 < u.length; i += 2) out.push({ label: String(u[i]), url: String(u[i + 1]) });
        if (out.length) return out;
        if (u.length === 1) return [{ label: '默认', url: String(u[0]) }];
    }
    if (typeof u === 'string' && u) {
        if (/,\s*https?:\/\//.test(u)) {
            const parts = u.split(',');
            const out: Quality[] = [];
            for (let i = 0; i + 1 < parts.length; i += 2) out.push({ label: parts[i].trim(), url: parts[i + 1].trim() });
            if (out.length) return out;
        }
        return [{ label: '默认', url: u }];
    }
    return [];
}
