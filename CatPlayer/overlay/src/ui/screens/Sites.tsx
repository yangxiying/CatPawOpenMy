import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, Image,
    ActivityIndicator, ScrollView, StyleSheet, Dimensions, Modal,
} from 'react-native';
import { useNav } from '../App';
import { CatApi, Site, CatConfig } from '../../api/CatApi';
import NodeService from '../../node/NodeService';

const COLS = 3;
const GAP = 8;
const W = (Dimensions.get('window').width - GAP * (COLS + 1)) / COLS;

type RecItem = {
    vod_id: string; vod_name: string; vod_pic: string;
    vod_score?: string; vod_remarks?: string;
};

export default function Sites({ config }: { config: CatConfig }) {
    const nav = useNav();
    const sites: Site[] = config?.video?.sites || [];
    const hasSites = sites.length > 0;

    const [activeApi, setActiveApi] = useState<string>(hasSites ? sites[0].api : '');
    const [activeSite, setActiveSite] = useState<Site | null>(hasSites ? sites[0] : null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [classes, setClasses] = useState<{ type_id: any; type_name: string }[]>([]);
    const [activeTab, setActiveTab] = useState<string>('');
    const [recs, setRecs] = useState<RecItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const loadingRef = useRef(false);

    /** 加载站点内容（home 或第一分类） */
    const loadSite = useCallback(async (api: string) => {
        if (!api) return;
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        setMsg(null);
        setClasses([]);
        setActiveTab('');
        setRecs([]);

        try {
            await CatApi.ensureInit(api);
            const home = await CatApi.home(api);
            if (!home) { setMsg('接口无返回'); return; }

            const cls = home.class || [];
            setClasses(cls);

            let items: any[] = home.list || home.likes || home.recommend || [];
            if (!Array.isArray(items) || items.length === 0) {
                items = [];
                if (cls.length > 0) {
                    try {
                        const catData = await CatApi.category(api, cls[0].type_id, 1, {});
                        items = catData?.list || [];
                    } catch {}
                }
            }

            const mapped: RecItem[] = (Array.isArray(items) ? items : []).map(it => ({
                vod_id: it.vod_id, vod_name: it.vod_name, vod_pic: it.vod_pic,
                vod_score: it.vod_score || '', vod_remarks: it.vod_remarks || '',
            }));
            setRecs(mapped.slice(0, 30));
            if (mapped.length === 0) setMsg(cls.length > 0 ? '选择分类浏览内容' : '暂无内容');
        } catch (e: any) {
            setMsg('加载失败: ' + (e?.message || e));
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }, []);

    // 站点切换时加载内容
    useEffect(() => {
        if (!activeApi) return;
        loadSite(activeApi);
    }, [activeApi, loadSite]);

    const switchSite = useCallback((s: Site) => {
        setShowDropdown(false);
        setActiveSite(s);
        setActiveApi(s.api);
    }, []);

    /** 切换分类 Tab */
    const switchTab = useCallback(async (cl: { type_id: any; type_name: string }) => {
        setActiveTab(String(cl.type_id));
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        setMsg(null);

        try {
            const data = await CatApi.category(activeApi, cl.type_id, 1, {});
            const items: RecItem[] = (data?.list || []).map((it: any) => ({
                vod_id: it.vod_id, vod_name: it.vod_name, vod_pic: it.vod_pic,
                vod_score: it.vod_score || '', vod_remarks: it.vod_remarks || '',
            }));
            setRecs(items.slice(0, 30));
            if (items.length === 0) setMsg('暂无内容');
        } catch (e: any) {
            setMsg('加载失败: ' + String(e?.message || e));
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }, [activeApi]);

    const goDetail = (item: RecItem) => {
        if (activeSite) nav.push('Detail', { site: activeSite, vodId: item.vod_id });
    };

    const scoreColor = (s: string) => {
        const n = parseFloat(s);
        if (isNaN(n)) return '#ff9f43';
        if (n >= 8) return '#4fc3f7';
        if (n >= 6) return '#ff9f43';
        return '#999';
    };

    // ── 无站点时的空状态 ──
    if (!hasSites) {
        return (
            <View style={styles.c}>
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <View style={styles.siteIcon}><Text style={styles.siteIconT}>G</Text></View>
                        <Text style={styles.headerTitle}>选择站点</Text>
                    </View>
                </View>
                <View style={styles.center}>
                    <Text style={styles.msg}>请先在首页点击「解析」获取站点列表</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.c}>
            {/* ── 顶部站点信息栏 ── */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerLeft} onPress={() => setShowDropdown(true)} activeOpacity={0.7}>
                    <View style={styles.siteIcon}><Text style={styles.siteIconT}>G</Text></View>
                    <Text style={styles.headerTitle} numberOfLines={1}>{activeSite?.name || '选择站点'}</Text>
                    <Text style={styles.headerArrow}>{' ▾'}</Text>
                </TouchableOpacity>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.6} onPress={() => nav.push('Search', { site: activeSite })}>
                        <Text style={styles.headerIcon}>{'🔍'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── 站点下拉选择 ── */}
            <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
                <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowDropdown(false)}>
                    <View style={styles.dropdownPanel}>
                        <Text style={styles.dropdownTitle}>切换站点</Text>
                        <FlatList
                            data={sites}
                            keyExtractor={item => item.api}
                            style={styles.dropdownList}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const isActive = item.api === activeApi;
                                return (
                                    <TouchableOpacity style={[styles.dropdownItem, isActive && styles.dropdownItemOn]} onPress={() => switchSite(item)} activeOpacity={0.7}>
                                        <Text style={[styles.dropdownItemT, isActive && styles.dropdownItemTOn]} numberOfLines={1}>{item.name}</Text>
                                        {isActive && <Text style={styles.dropdownCheck}>{' ✓'}</Text>}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ── 分类 Tab ── */}
            {classes.length > 0 && (
                <View style={styles.tabBar}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
                        {classes.map(cl => {
                            const isActive = String(cl.type_id) === (activeTab || String(classes[0]?.type_id));
                            return (
                                <TouchableOpacity key={String(cl.type_id)} style={styles.tabItem} onPress={() => switchTab(cl)} activeOpacity={0.7}>
                                    <Text style={[styles.tabLabel, isActive && styles.tabLabelOn]}>{cl.type_name}</Text>
                                    {isActive && <View style={styles.tabUnderline} />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {/* ── 内容网格 / 状态 ── */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator color="#7aa2ff" size="large" /></View>
            ) : recs.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.msg}>{msg || '暂无内容'}</Text>
                    {msg?.includes('加载失败') && (
                        <TouchableOpacity style={styles.goAllBtn} onPress={() => { loadSite(activeApi); }}>
                            <Text style={styles.goAllBtnT}>重试</Text>
                        </TouchableOpacity>
                    )}
                    {activeSite && classes.length > 0 && !activeTab && (
                        <TouchableOpacity style={styles.goAllBtn} onPress={() => classes[0] && switchTab(classes[0])}>
                            <Text style={styles.goAllBtnT}>浏览内容 ›</Text>
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
                        <TouchableOpacity style={[styles.card, { width: W }]} onPress={() => goDetail(item)} activeOpacity={0.8}>
                            <View style={[styles.picWrap, { width: W, height: W * 1.4 }]}>
                                <Image source={{ uri: item.vod_pic }} style={styles.pic} />
                                {!!item.vod_score && (
                                    <View style={[styles.scoreBadge, { backgroundColor: scoreColor(item.vod_score) }]}>
                                        <Text style={styles.scoreText}>{item.vod_score}</Text>
                                    </View>
                                )}
                                {!!item.vod_remarks && !item.vod_score && (
                                    <View style={styles.remarkBadge}>
                                        <Text style={styles.remarkText} numberOfLines={1}>{item.vod_remarks}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.vn} numberOfLines={1}>{item.vod_name}</Text>
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
    header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', backgroundColor: '#0f0f14' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    siteIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7aa2ff', alignItems: 'center', justifyContent: 'center' },
    siteIconT: { color: '#fff', fontSize: 14, fontWeight: '700' },
    headerTitle: { color: '#e6e8ef', fontSize: 16, fontWeight: '600', marginLeft: 8, flex: 1 },
    headerArrow: { color: '#9aa0ad', fontSize: 12, marginRight: 8 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1a1a24', alignItems: 'center', justifyContent: 'center' },
    headerIcon: { fontSize: 16 },

    dropdownOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    dropdownPanel: { width: '100%', maxHeight: '70%', backgroundColor: '#1a1a24', borderRadius: 14, overflow: 'hidden' },
    dropdownTitle: { color: '#9aa0ad', fontSize: 13, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
    dropdownList: { maxHeight: 400 },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2a2a35' },
    dropdownItemOn: { backgroundColor: '#2a2f45' },
    dropdownItemT: { color: '#cfd2dc', fontSize: 14, flex: 1 },
    dropdownItemTOn: { color: '#7aa2ff', fontWeight: '600' },
    dropdownCheck: { color: '#7aa2ff', fontSize: 14, fontWeight: '700' },

    tabBar: { height: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', justifyContent: 'center', backgroundColor: '#0f0f14' },
    tabScroll: { flexDirection: 'row', paddingHorizontal: 8, gap: 0, alignItems: 'flex-end' },
    tabItem: { paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    tabLabel: { color: '#8a8f9c', fontSize: 14 },
    tabLabelOn: { color: '#e6e8ef', fontSize: 14, fontWeight: '600' },
    tabUnderline: { position: 'absolute', bottom: 0, left: 14, right: 14, height: 3, borderRadius: 1.5, backgroundColor: '#7aa2ff' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    msg: { color: '#777', fontSize: 13, textAlign: 'center' },
    goAllBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20, backgroundColor: '#2a2f45' },
    goAllBtnT: { color: '#7aa2ff', fontSize: 14, fontWeight: '600' },

    card: { marginBottom: GAP, borderRadius: 8, overflow: 'hidden', backgroundColor: '#12121a' },
    picWrap: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#16161d', position: 'relative' },
    pic: { width: '100%', height: '100%', resizeMode: 'cover' },
    vn: { color: '#e6e8ef', fontSize: 12, marginTop: 6, marginLeft: 4, marginRight: 4, marginBottom: 4 },
    scoreBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    scoreText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    remarkBadge: { position: 'absolute', bottom: 6, left: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    remarkText: { color: '#fff', fontSize: 10 },
});
