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
    home: (api: string) => {
        // Mock /home 响应：返回分类数据（远程 bundle 的 home 路由不可用）
        NodeService?.log?.('[CatApi] home MOCK for ' + api);
        return Promise.resolve({
            class: [
                { type_id: 'recommend', type_name: '推荐' },
                { type_id: 'hot', type_name: '热门' },
                { type_id: 'time', type_name: '最新' },
                { type_id: 'rank', type_name: '评分' }
            ],
            list: []
        });
    },
    category: (api: string, id: any, page: number, filters?: any) => {
        NodeService?.log?.('[CatApi] category MOCK for ' + api + ' id=' + id);
        return Promise.resolve({
            page: 1,
            pagecount: 1,
            list: [
                { vod_id: 'demo1', vod_name: '测试视频 1', vod_pic: 'https://picsum.photos/seed/demo1/300/400', vod_score: '8.5', vod_remarks: '更新至12集' },
                { vod_id: 'demo2', vod_name: '测试视频 2', vod_pic: 'https://picsum.photos/seed/demo2/300/400', vod_score: '7.9', vod_remarks: '完结' },
                { vod_id: 'demo3', vod_name: '测试视频 3', vod_pic: 'https://picsum.photos/seed/demo3/300/400', vod_score: '9.2', vod_remarks: '更新至6集' },
            ]
        });
    },
    detail: (api: string, id: any) => {
        NodeService?.log?.('[CatApi] detail MOCK for ' + api + ' id=' + id);
        return Promise.resolve({
            vod_id: id || 'demo1',
            vod_name: '测试视频',
            vod_pic: 'https://picsum.photos/seed/demo1/300/400',
            vod_score: '8.5',
            vod_content: '这是一个演示视频。',
            vod_play_from: '默认线路',
            vod_play_url: '第1集$https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
        });
    },
    play: (api: string, flag: string, id: string) => {
        NodeService?.log?.('[CatApi] play MOCK id=' + id);
        return Promise.resolve({ url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' });
    },
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
