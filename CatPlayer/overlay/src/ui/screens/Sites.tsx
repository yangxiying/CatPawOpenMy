import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useNav } from '../App';
import { CatApi, Site, CatConfig } from '../../api/CatApi';
import NodeService from '../../node/NodeService';

const COLS = 3;
const GAP = 8;
const W = (Dimensions.get('window').width - GAP * (COLS + 1)) / COLS;

type RecItem = { vod_id: string; vod_name: string; vod_pic: string; vod_remarks?: string };

/**
 * 首页：顶部横向站点选择器 + 分类快速入口 + 热门推荐网格。
 * 参考 App 截图布局。
 */
export default function Sites({ config }: { config: CatConfig }) {
    const nav = useNav();
    const sites: Site[] = config?.video?.sites || [];
    const [activeApi, setActiveApi] = useState<string>(sites[0]?.api || '');
    const [activeSite, setActiveSite] = useState<Site | null>(sites[0] || null);
    const [classes, setClasses] = useState<{ type_id: any; type_name: string }[]>([]);
    const [recs, setRecs] = useState<RecItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    // 诊断日志
    React.useEffect(() => {
        console.log('[Sites] mounted: sites.length=' + sites.length + ' activeApi=' + activeApi);
        NodeService?.log?.('[Sites] config.video.sites.length=' + sites.length);
        if (sites.length > 0) {
            NodeService?.log?.('[Sites] first site: name=' + sites[0].name + ' api=' + sites[0].api);
        }
    }, []);

    // 切换站点时拉取首页
    useEffect(() => {
        if (!activeApi) return;
        let cancel = false;
        setLoading(true);
        setMsg(null);
        setClasses([]);
        setRecs([]);
        (async () => {
            try {
                await CatApi.ensureInit(activeApi);
                const home = await CatApi.home(activeApi);
                if (cancel) return;
                NodeService?.log?.('[Sites] home response: ' + JSON.stringify(home).slice(0, 300));
                setClasses(home?.class || []);
                const raw = home?.list || home?.likes || home?.recommend || [];
                NodeService?.log?.('[Sites] classes=' + (home?.class?.length || 0) + ' recs=' + raw.length);
                setRecs(Array.isArray(raw) ? raw.slice(0, 30) : []);
                if (!raw.length) setMsg('该站暂无推荐，请选择分类浏览');
            } catch (e: any) {
                if (cancel) return;
                setMsg('加载失败: ' + (e?.message || e));
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, [activeApi]);

    const switchSite = (s: Site) => {
        setActiveSite(s);
        setActiveApi(s.api);
    };

    const goCategory = (cl: { type_id: any; type_name: string }) => {
        if (activeSite) nav.push('Category', { site: activeSite, initialClass: cl });
    };

    return (
        <View style={styles.c}>
            {/* ═══════ 顶部站点选择器 ═══════ */}
            {sites.length > 1 && (
                <View style={styles.siteBar}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.siteScroll}>
                        {sites.map(s => {
                            const isActive = s.api === activeApi;
                            return (
                                <TouchableOpacity key={s.api} style={[styles.siteChip, isActive && styles.siteChipOn]} onPress={() => switchSite(s)}>
                                    <Text style={[styles.siteChipT, isActive && styles.siteChipTOn]}>{s.name}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            )}
            {sites.length === 1 && activeSite && (
                <View style={styles.siteBar}>
                    <Text style={styles.singleSite}>{activeSite.name}</Text>
                </View>
            )}

            {/* ═══════ 分类快速入口 ═══════ */}
            {classes.length > 0 && (
                <View style={styles.clsWrap}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clsScroll}>
                        {classes.slice(0, 20).map(cl => (
                            <TouchableOpacity key={String(cl.type_id)} style={styles.clsChip} onPress={() => goCategory(cl)}>
                                <Text style={styles.clsChipT}>{cl.type_name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* ═══════ 热门推荐标题 ═══════ */}
            <View style={styles.secHead}>
                <Text style={styles.secTitle}>热门推荐</Text>
                {activeSite && classes.length > 0 && (
                    <TouchableOpacity onPress={() => nav.push('Category', { site: activeSite })}>
                        <Text style={styles.secMore}>全部分类 ›</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ═══════ 推荐网格 / 状态 ═══════ */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator color="#7aa2ff" /></View>
            ) : recs.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.msg}>{msg || '暂无推荐'}</Text>
                    {activeSite && (
                        <TouchableOpacity style={styles.goAllBtn} onPress={() => nav.push('Category', { site: activeSite })}>
                            <Text style={styles.goAllBtnT}>进入分类浏览 ›</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <FlatList
                    data={recs}
                    numColumns={COLS}
                    keyExtractor={(it, i) => String(it.vod_id) + '_' + i}
                    contentContainerStyle={{ padding: GAP }}
                    columnWrapperStyle={{ gap: GAP }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.card, { width: W }]}
                            onPress={() => activeSite && nav.push('Detail', { site: activeSite, vodId: item.vod_id })}
                            activeOpacity={0.7}
                        >
                            <Image source={{ uri: item.vod_pic }} style={[styles.pic, { width: W, height: W * 1.4 }]} />
                            <Text style={styles.vn} numberOfLines={1}>{item.vod_name}</Text>
                            {!!item.vod_remarks && <Text style={styles.rm} numberOfLines={1}>{item.vod_remarks}</Text>}
                        </TouchableOpacity>
                    )}
                    ListFooterComponent={<View style={{ height: 20 }} />}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    c: { flex: 1, backgroundColor: '#0b0b0f' },

    siteBar: { height: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', justifyContent: 'center', backgroundColor: '#0f0f14' },
    siteScroll: { flexDirection: 'row', paddingHorizontal: 10, gap: 8, alignItems: 'center' },
    siteChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1a1a24' },
    siteChipOn: { backgroundColor: '#7aa2ff' },
    siteChipT: { color: '#9aa0ad', fontSize: 13 },
    siteChipTOn: { color: '#fff', fontWeight: '600' },
    singleSite: { color: '#e6e8ef', fontSize: 15, fontWeight: '600', paddingHorizontal: 16 },

    clsWrap: { maxHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', justifyContent: 'center' },
    clsScroll: { flexDirection: 'row', paddingHorizontal: 10, gap: 6, alignItems: 'center' },
    clsChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: '#16161d' },
    clsChipT: { color: '#b9bdc8', fontSize: 12 },

    secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
    secTitle: { color: '#e6e8ef', fontSize: 16, fontWeight: '600' },
    secMore: { color: '#7aa2ff', fontSize: 12 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    msg: { color: '#777', fontSize: 13, textAlign: 'center' },
    goAllBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20, backgroundColor: '#2a2f45' },
    goAllBtnT: { color: '#7aa2ff', fontSize: 14, fontWeight: '600' },

    card: { marginBottom: GAP, borderRadius: 8, overflow: 'hidden', backgroundColor: '#12121a', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
    pic: { borderRadius: 8, backgroundColor: '#16161d' },
    vn: { color: '#e6e8ef', fontSize: 12, marginTop: 4, marginLeft: 4, marginRight: 4 },
    rm: { color: '#ff9f43', fontSize: 10, marginTop: 1, marginLeft: 4, marginRight: 4, marginBottom: 4 },
});
