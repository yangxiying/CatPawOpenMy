import React, { useEffect, useState, useRef } from 'react';
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

type RecItem = { vod_id: string; vod_name: string; vod_pic: string; vod_remarks?: string };

/**
 * 首页：下拉站点选择 + 分类快速入口 + 推荐/分类内容网格。
 */
export default function Sites({ config }: { config: CatConfig }) {
    const nav = useNav();
    const sites: Site[] = config?.video?.sites || [];
    const [activeApi, setActiveApi] = useState<string>(sites[0]?.api || '');
    const [activeSite, setActiveSite] = useState<Site | null>(sites[0] || null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [classes, setClasses] = useState<{ type_id: any; type_name: string }[]>([]);
    const [recs, setRecs] = useState<RecItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const loadingRef = useRef(false); // 防重复加载

    // 诊断日志
    useEffect(() => {
        console.log('[Sites] mounted: sites.length=' + sites.length + ' activeApi=' + activeApi);
        NodeService?.log?.('[Sites] config.video.sites.length=' + sites.length);
        if (sites.length > 0) {
            NodeService?.log?.('[Sites] first site: name=' + sites[0].name + ' api=' + sites[0].api);
        }
    }, []);

    // 切换站点时拉取首页内容
    useEffect(() => {
        if (!activeApi) return;
        if (loadingRef.current) return;
        let cancel = false;
        loadingRef.current = true;
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
                const cls = home?.class || [];
                setClasses(cls);

                // 优先取 home 推荐的 list/likes/recommend
                let items: any[] = home?.list || home?.likes || home?.recommend || [];
                if (!Array.isArray(items) || items.length === 0) {
                    // home 没有推荐但有分类 → 自动加载第一个分类的内容
                    items = [];
                    if (cls.length > 0) {
                        NodeService?.log?.('[Sites] home no list, fetching first category: ' + cls[0].type_name);
                        try {
                            const catData = await CatApi.category(activeApi, cls[0].type_id, 1, {});
                            items = catData?.list || [];
                            NodeService?.log?.('[Sites] first category got ' + items.length + ' items');
                        } catch (catErr: any) {
                            NodeService?.log?.('[Sites] first category fetch failed: ' + String(catErr));
                        }
                    }
                }

                setRecs(Array.isArray(items) ? items.slice(0, 30) : []);
                if (!Array.isArray(items) || items.length === 0) {
                    setMsg(cls.length > 0 ? '选择分类浏览内容' : '暂无推荐');
                }
            } catch (e: any) {
                if (cancel) return;
                setMsg('加载失败: ' + (e?.message || e));
            } finally {
                if (!cancel) {
                    setLoading(false);
                    loadingRef.current = false;
                }
            }
        })();

        return () => { cancel = true; };
    }, [activeApi]);

    const switchSite = (s: Site) => {
        setShowDropdown(false);
        setActiveSite(s);
        setActiveApi(s.api);
    };

    const goCategory = (cl: { type_id: any; type_name: string }) => {
        if (activeSite) nav.push('Category', { site: activeSite, initialClass: cl });
    };

    return (
        <View style={styles.c}>
            {/* ═══════ 顶部站点选择器（下拉式） ═══════ */}
            <View style={styles.siteBar}>
                <TouchableOpacity
                    style={styles.siteDropdownBtn}
                    onPress={() => setShowDropdown(true)}
                    activeOpacity={0.7}
                >
                    <Text style={styles.siteDropdownText} numberOfLines={1}>
                        {activeSite?.name || '选择站点'}
                    </Text>
                    <Text style={styles.siteDropdownArrow}>{' ▾'}</Text>
                </TouchableOpacity>
            </View>

            {/* ═══════ 下拉弹窗 ═══════ */}
            <Modal
                visible={showDropdown}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDropdown(false)}
            >
                <TouchableOpacity
                    style={styles.dropdownOverlay}
                    activeOpacity={1}
                    onPress={() => setShowDropdown(false)}
                >
                    <View style={styles.dropdownPanel}>
                        <Text style={styles.dropdownTitle}>切换站点</Text>
                        <FlatList
                            data={sites}
                            keyExtractor={(item) => item.api}
                            style={styles.dropdownList}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const isActive = item.api === activeApi;
                                return (
                                    <TouchableOpacity
                                        style={[styles.dropdownItem, isActive && styles.dropdownItemOn]}
                                        onPress={() => switchSite(item)}
                                        activeOpacity={0.7}
                                    >
                                        <Text
                                            style={[styles.dropdownItemT, isActive && styles.dropdownItemTOn]}
                                            numberOfLines={1}
                                        >
                                            {item.name}
                                        </Text>
                                        {isActive && <Text style={styles.dropdownCheck}>{' ✓'}</Text>}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>

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

            {/* ═══════ 内容标题 ═══════ */}
            <View style={styles.secHead}>
                <Text style={styles.secTitle}>
                    {recs.length > 0 ? '热门推荐' : '分类内容'}
                </Text>
                {activeSite && classes.length > 0 && (
                    <TouchableOpacity onPress={() => nav.push('Category', { site: activeSite })}>
                        <Text style={styles.secMore}>全部分类 ›</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ═══════ 内容网格 / 状态 ═══════ */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator color="#7aa2ff" /></View>
            ) : recs.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.msg}>{msg || '暂无内容'}</Text>
                    {activeSite && classes.length > 0 && (
                        <TouchableOpacity style={styles.goAllBtn} onPress={() => nav.push('Category', { site: activeSite })}>
                            <Text style={styles.goAllBtnT}>全部分类 ›</Text>
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

    /* ── 站点下拉选择器 ── */
    siteBar: {
        height: 48,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#1d1d25',
        justifyContent: 'center',
        backgroundColor: '#0f0f14',
        paddingHorizontal: 14,
    },
    siteDropdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: '#1a1a24',
    },
    siteDropdownText: {
        color: '#e6e8ef',
        fontSize: 14,
        fontWeight: '600',
        maxWidth: Dimensions.get('window').width - 100,
    },
    siteDropdownArrow: {
        color: '#9aa0ad',
        fontSize: 12,
        marginLeft: 4,
    },

    /* ── 下拉弹窗 ── */
    dropdownOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    dropdownPanel: {
        width: '100%',
        maxHeight: '70%',
        backgroundColor: '#1a1a24',
        borderRadius: 14,
        overflow: 'hidden',
    },
    dropdownTitle: {
        color: '#9aa0ad',
        fontSize: 13,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 8,
    },
    dropdownList: {
        maxHeight: 400,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#2a2a35',
    },
    dropdownItemOn: {
        backgroundColor: '#2a2f45',
    },
    dropdownItemT: {
        color: '#cfd2dc',
        fontSize: 14,
        flex: 1,
    },
    dropdownItemTOn: {
        color: '#7aa2ff',
        fontWeight: '600',
    },
    dropdownCheck: {
        color: '#7aa2ff',
        fontSize: 14,
        fontWeight: '700',
    },

    /* ── 分类快速入口 ── */
    clsWrap: { maxHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', justifyContent: 'center' },
    clsScroll: { flexDirection: 'row', paddingHorizontal: 10, gap: 6, alignItems: 'center' },
    clsChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: '#16161d' },
    clsChipT: { color: '#b9bdc8', fontSize: 12 },

    /* ── 内容标题 ── */
    secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
    secTitle: { color: '#e6e8ef', fontSize: 16, fontWeight: '600' },
    secMore: { color: '#7aa2ff', fontSize: 12 },

    /* ── 空状态 ── */
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    msg: { color: '#777', fontSize: 13, textAlign: 'center' },
    goAllBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20, backgroundColor: '#2a2f45' },
    goAllBtnT: { color: '#7aa2ff', fontSize: 14, fontWeight: '600' },

    /* ── 内容卡片 ── */
    card: { marginBottom: GAP, borderRadius: 8, overflow: 'hidden', backgroundColor: '#12121a', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
    pic: { borderRadius: 8, backgroundColor: '#16161d' },
    vn: { color: '#e6e8ef', fontSize: 12, marginTop: 4, marginLeft: 4, marginRight: 4 },
    rm: { color: '#ff9f43', fontSize: 10, marginTop: 1, marginLeft: 4, marginRight: 4, marginBottom: 4 },
});
