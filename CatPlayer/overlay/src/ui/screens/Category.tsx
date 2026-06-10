import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, ScrollView, StyleSheet, Dimensions, TextInput } from 'react-native';
import { useNav } from '../App';
import { CatApi, Site } from '../../api/CatApi';

type Cls = { type_id: any; type_name: string };
const COLS = 3;
const GAP = 8;

/** 生成年份选项列表（从当前年份往前推） */
function buildYearOptions(): string[] {
    const now = new Date().getFullYear();
    const years: string[] = ['全部'];
    for (let y = now; y >= now - 10; y--) years.push(String(y));
    return years;
}

/** 默认排序选项 */
const SORT_OPTIONS = ['全部', '最新', '最热', '最赞'];

/**
 * 分类浏览页面：展示站点分类内容，支持工具栏切换、多维度筛选、搜索功能。
 * 包含分类标签栏、顶部工具按钮行（网格/收藏/搜索/历史/筛选）、
 * 类型/年份/排序三行筛选芯片、以及三列视频卡片网格。
 */
export default function Category({ site, initialClass }: { site: Site; initialClass?: Cls }) {
    const nav = useNav();
    const [classes, setClasses] = useState<Cls[]>([]);
    const [cid, setCid] = useState<any>(initialClass?.type_id ?? null);
    const [list, setList] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [msg, setMsg] = useState<string | null>('加载中…');

    /** 筛选状态 */
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searching, setSearching] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [showFilters, setShowFilters] = useState(true);

    /** 动态筛选选项 */
    const [typeOptions, setTypeOptions] = useState<string[]>(['全部']);
    const [selectedType, setSelectedType] = useState('全部');
    const yearOptions = useMemo(() => buildYearOptions(), []);
    const [selectedYear, setSelectedYear] = useState('全部');
    const [selectedSort, setSelectedSort] = useState('全部');

    /** 初始化：拉取首页数据获取分类列表与筛选选项 */
    useEffect(() => {
        (async () => {
            try {
                await CatApi.ensureInit(site.api);
                const home = await CatApi.home(site.api);
                const cs: Cls[] = home?.class || [];
                setClasses(cs);
                if (initialClass && cs.some((c: Cls) => c.type_id === initialClass.type_id)) {
                    setCid(initialClass.type_id);
                } else if (cs.length) { setCid(cs[0].type_id); }
                else { setMsg('该站点无分类'); }

                /** 从首页响应中提取类型筛选选项 */
                const filters = home?.filters || {};
                if (filters.type && Array.isArray(filters.type)) {
                    setTypeOptions(['全部', ...filters.type.map((t: any) => typeof t === 'string' ? t : t.name || t.value || String(t))]);
                }
            } catch (e: any) { setMsg('加载失败: ' + (e?.message || e)); }
        })();
    }, [site.api]);

    /** 根据当前分类 ID 与筛选条件加载数据 */
    const load = useCallback(async (id: any, pg: number, isSearch?: boolean, keyword?: string) => {
        if (loading) return;
        setLoading(true);
        try {
            let items: any[] = [];
            if (isSearch && keyword) {
                const res = await CatApi.search(site.api, keyword, pg);
                items = res?.list || res?.data || [];
            } else {
                const filters: Record<string, string> = {};
                if (selectedType !== '全部') filters.type = selectedType;
                if (selectedYear !== '全部') filters.year = selectedYear;
                if (selectedSort !== '全部') filters.sort = selectedSort;
                const res = await CatApi.category(site.api, id, pg, Object.keys(filters).length > 0 ? filters : undefined);
                items = res?.list || [];
            }
            setList(prev => (pg === 1 ? items : [...prev, ...items]));
            setDone(items.length === 0);
            setMsg(pg === 1 && items.length === 0 ? '无内容' : null);
        } catch (e: any) {
            setMsg('加载失败: ' + (e?.message || e));
        } finally { setLoading(false); }
    }, [site.api, loading, selectedType, selectedYear, selectedSort]);

    /** 分类或筛选条件变化时重新加载第一页 */
    useEffect(() => {
        if (cid === null) return;
        if (searching && searchText) return;
        setList([]); setPage(1); setDone(false); setMsg('加载中…');
        load(cid, 1);
    }, [cid, selectedType, selectedYear, selectedSort]);

    /** 加载更多数据 */
    const more = () => {
        if (loading || done || !cid) return;
        const np = page + 1; setPage(np);
        if (searching && searchText) {
            load(cid, np, true, searchText);
        } else {
            load(cid, np);
        }
    };

    /** 执行搜索操作 */
    const doSearch = useCallback(() => {
        if (!searchText.trim()) return;
        setList([]); setPage(1); setDone(false); setMsg('搜索中…');
        load(cid, 1, true, searchText.trim());
    }, [searchText, cid, load]);

    /** 切换搜索模式 */
    const toggleSearch = useCallback(() => {
        setSearching(prev => {
            if (!prev) return true;
            setSearchText('');
            setList([]); setPage(1); setDone(false); setMsg('加载中…');
            if (cid !== null) load(cid, 1);
            return false;
        });
    }, [cid, load]);

    /** 切换筛选面板显示 */
    const toggleFilters = useCallback(() => setShowFilters(prev => !prev), []);

    /** 当某个筛选值改变时重置分页并触发 reload（由 useEffect 监听） */
    const onFilterChange = (type: 't' | 'y' | 's', val: string) => {
        if (type === 't') setSelectedType(val);
        else if (type === 'y') setSelectedYear(val);
        else if (type === 's') setSelectedSort(val);
    };

    const W = (Dimensions.get('window').width - GAP * (COLS + 1)) / COLS;

    return (
        <View style={styles.c}>
            {/* 分类标签栏 */}
            {classes.length > 0 && (
                <View style={styles.tabsWrap}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
                        {classes.map(cl => (
                            <TouchableOpacity key={String(cl.type_id)} onPress={() => setCid(cl.type_id)} style={[styles.tab, cid === cl.type_id && styles.tabOn]}>
                                <Text style={[styles.tabT, cid === cl.type_id && styles.tabTOn]}>{cl.type_name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* 工具栏按钮行 */}
            <View style={styles.toolbar}>
                <TouchableOpacity style={styles.toolBtn} onPress={() => setViewMode(m => m === 'grid' ? 'list' : 'grid')}>
                    <Text style={styles.toolIcon}>{viewMode === 'grid' ? '⊞' : '☰'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={() => nav.push('Favorites')}>
                    <Text style={styles.toolIcon}>★</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={toggleSearch}>
                    <Text style={[styles.toolIcon, searching && styles.toolIconActive]}>🔍</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={() => nav.push('History')}>
                    <Text style={styles.toolIcon}>🕐</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toolBtn, showFilters && styles.toolBtnActive]} onPress={toggleFilters}>
                    <Text style={[styles.toolIcon, showFilters && styles.toolIconActive]}>☷</Text>
                </TouchableOpacity>
            </View>

            {/* 搜索输入框 */}
            {searching && (
                <View style={styles.searchRow}>
                    <TextInput
                        style={styles.searchInput}
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholder="输入关键词搜索..."
                        placeholderTextColor="#555"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="search"
                        onSubmitEditing={doSearch}
                        selectTextOnFocus
                    />
                    <TouchableOpacity style={styles.searchGoBtn} onPress={doSearch}>
                        <Text style={styles.searchGoTxt}>搜索</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* 筛选行：类型 / 年份 / 排序 */}
            {showFilters && !searching && (
                <View style={styles.filterArea}>
                    <FilterRow label="类型" options={typeOptions} value={selectedType} onChange={(v) => onFilterChange('t', v)} />
                    <FilterRow label="年份" options={yearOptions} value={selectedYear} onChange={(v) => onFilterChange('y', v)} />
                    <FilterRow label="排序" options={SORT_OPTIONS} value={selectedSort} onChange={(v) => onFilterChange('s', v)} />
                </View>
            )}

            {/* 视频列表/网格 */}
            <FlatList
                data={list}
                key={viewMode === 'grid' ? COLS : 'list'}
                numColumns={viewMode === 'grid' ? COLS : 1}
                keyExtractor={(it, i) => String(it.vod_id) + '_' + i}
                contentContainerStyle={{ padding: GAP }}
                columnWrapperStyle={viewMode === 'grid' ? { gap: GAP } : undefined}
                onEndReachedThreshold={0.6}
                onEndReached={more}
                ListEmptyComponent={msg ? <Text style={styles.msg}>{msg}</Text> : null}
                ListFooterComponent={loading ? <ActivityIndicator color="#7aa2ff" style={{ margin: 16 }} /> : null}
                renderItem={({ item }) =>
                    viewMode === 'grid' ? (
                        <GridCard item={item} width={W} site={site} nav={nav} />
                    ) : (
                        <ListItem item={item} site={site} nav={nav} />
                    )
                }
            />
        </View>
    );
}

/** 单行筛选组件：左侧标签 + 右侧横向滚动芯片组 */
function FilterRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <View style={fStyles.row}>
            <Text style={fStyles.label}>{label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fStyles.chipScroll}>
                {options.map(opt => (
                    <TouchableOpacity key={opt} onPress={() => onChange(opt)} style={[fStyles.chip, value === opt && fStyles.chipOn]}>
                        <Text style={[fStyles.chipTxt, value === opt && fStyles.chipTxtOn]}>{opt}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

/** 网格模式视频卡片 */
function GridCard({ item, width: W, site, nav }: { item: any; width: number; site: Site; nav: any }) {
    return (
        <TouchableOpacity style={[styles.card, { width: W }]} onPress={() => nav.push('Detail', { site, vodId: item.vod_id })} activeOpacity={0.7}>
            <Image source={{ uri: item.vod_pic }} style={[styles.pic, { width: W, height: W * 1.4 }]} />
            <Text style={styles.vn} numberOfLines={1}>{item.vod_name}</Text>
            {!!item.vod_remarks && <Text style={styles.rm} numberOfLines={1}>{item.vod_remarks}</Text>}
        </TouchableOpacity>
    );
}

/** 列表模式视频条目 */
function ListItem({ item, site, nav }: { item: any; site: Site; nav: any }) {
    return (
        <TouchableOpacity style={styles.listItem} onPress={() => nav.push('Detail', { site, vodId: item.vod_id })} activeOpacity={0.7}>
            <Image source={{ uri: item.vod_pic }} style={styles.listPic} />
            <View style={styles.listInfo}>
                <Text style={styles.listName} numberOfLines={2}>{item.vod_name}</Text>
                {!!item.vod_remarks && <Text style={styles.listRemarks} numberOfLines={1}>{item.vod_remarks}</Text>}
                {!!item.vod_actor && <Text style={styles.listSub} numberOfLines={1}>主演: {item.vod_actor}</Text>}
            </View>
        </TouchableOpacity>
    );
}

const fStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, minHeight: 36 },
    label: { color: '#9aa0ad', fontSize: 12, width: 36, flexShrink: 0 },
    chipScroll: { flexDirection: 'row', gap: 6, marginLeft: 4 },
    chip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: '#2a2f45', backgroundColor: 'transparent' },
    chipOn: { backgroundColor: '#7aa2ff', borderColor: '#7aa2ff' },
    chipTxt: { color: '#9aa0ad', fontSize: 11 },
    chipTxtOn: { color: '#fff', fontWeight: '600' },
});

const styles = StyleSheet.create({
    c: { flex: 1, backgroundColor: '#0b0b0f' },

    tabsWrap: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', justifyContent: 'center' },
    tab: { paddingHorizontal: 12, paddingVertical: 7, marginHorizontal: 3, borderRadius: 14, backgroundColor: '#16161d' },
    tabOn: { backgroundColor: '#2a2f45' },
    tabT: { color: '#9aa0ad', fontSize: 13 },
    tabTOn: { color: '#fff' },

    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25' },
    toolBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#16161d', alignItems: 'center', justifyContent: 'center' },
    toolBtnActive: { backgroundColor: '#1a2845' },
    toolIcon: { fontSize: 16, color: '#9aa0ad' },
    toolIconActive: { color: '#7aa2ff' },

    searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25' },
    searchInput: { flex: 1, height: 34, borderRadius: 17, backgroundColor: '#16161d', color: '#e6e8ef', fontSize: 13, paddingHorizontal: 14 },
    searchGoBtn: { paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: '#7aa2ff', alignItems: 'center', justifyContent: 'center' },
    searchGoTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },

    filterArea: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25' },

    card: { marginBottom: GAP, borderRadius: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
    pic: { borderRadius: 8, backgroundColor: '#16161d' },
    vn: { color: '#e6e8ef', fontSize: 12, marginTop: 4 },
    rm: { color: '#ff9f43', fontSize: 10, marginTop: 1 },

    listItem: { flexDirection: 'row', padding: 10, marginBottom: 6, borderRadius: 8, backgroundColor: '#12121a', borderWidth: 1, borderColor: '#1a1a24' },
    listPic: { width: 100, height: 140, borderRadius: 8, backgroundColor: '#16161d' },
    listInfo: { flex: 1, marginLeft: 10, justifyContent: 'center' },
    listName: { color: '#e6e8ef', fontSize: 14, fontWeight: '500', lineHeight: 20 },
    listRemarks: { color: '#ff9f43', fontSize: 11, marginTop: 4 },
    listSub: { color: '#9aa0ad', fontSize: 11, marginTop: 3 },

    msg: { color: '#777', textAlign: 'center', marginTop: 40 },
});
