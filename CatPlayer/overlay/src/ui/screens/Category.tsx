import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useNav } from '../App';
import { CatApi, Site } from '../../api/CatApi';

type Cls = { type_id: any; type_name: string };
const COLS = 3;
const GAP = 8;

export default function Category({ site }: { site: Site }) {
    const nav = useNav();
    const [classes, setClasses] = useState<Cls[]>([]);
    const [cid, setCid] = useState<any>(null);
    const [list, setList] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [msg, setMsg] = useState<string | null>('加载中…');

    useEffect(() => {
        (async () => {
            try {
                await CatApi.ensureInit(site.api);
                const home = await CatApi.home(site.api);
                const cs: Cls[] = home?.class || [];
                setClasses(cs);
                if (cs.length) { setCid(cs[0].type_id); }
                else { setMsg('该站点无分类'); }
            } catch (e: any) { setMsg('加载失败: ' + (e?.message || e)); }
        })();
    }, [site.api]);

    const load = useCallback(async (id: any, pg: number) => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await CatApi.category(site.api, id, pg);
            const items: any[] = res?.list || [];
            setList(prev => (pg === 1 ? items : [...prev, ...items]));
            setDone(items.length === 0);
            setMsg(pg === 1 && items.length === 0 ? '无内容' : null);
        } catch (e: any) {
            setMsg('加载失败: ' + (e?.message || e));
        } finally { setLoading(false); }
    }, [site.api, loading]);

    useEffect(() => {
        if (cid === null) return;
        setList([]); setPage(1); setDone(false); setMsg('加载中…');
        load(cid, 1);
    }, [cid]);

    const more = () => {
        if (loading || done || !cid) return;
        const np = page + 1; setPage(np); load(cid, np);
    };

    const W = (Dimensions.get('window').width - GAP * (COLS + 1)) / COLS;

    return (
        <View style={styles.c}>
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
            <FlatList
                data={list}
                key={COLS}
                numColumns={COLS}
                keyExtractor={(it, i) => String(it.vod_id) + '_' + i}
                contentContainerStyle={{ padding: GAP }}
                columnWrapperStyle={{ gap: GAP }}
                onEndReachedThreshold={0.6}
                onEndReached={more}
                ListEmptyComponent={msg ? <Text style={styles.msg}>{msg}</Text> : null}
                ListFooterComponent={loading ? <ActivityIndicator color="#7aa2ff" style={{ margin: 16 }} /> : null}
                renderItem={({ item }) => (
                    <TouchableOpacity style={[styles.card, { width: W }]} onPress={() => nav.push('Detail', { site, vodId: item.vod_id })}>
                        <Image source={{ uri: item.vod_pic }} style={[styles.pic, { width: W, height: W * 1.4 }]} />
                        <Text style={styles.vn} numberOfLines={1}>{item.vod_name}</Text>
                        {!!item.vod_remarks && <Text style={styles.rm} numberOfLines={1}>{item.vod_remarks}</Text>}
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    c: { flex: 1 },
    tabsWrap: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', justifyContent: 'center' },
    tab: { paddingHorizontal: 12, paddingVertical: 7, marginHorizontal: 3, borderRadius: 14, backgroundColor: '#16161d' },
    tabOn: { backgroundColor: '#2a2f45' },
    tabT: { color: '#9aa0ad', fontSize: 13 },
    tabTOn: { color: '#fff' },
    card: { marginBottom: GAP },
    pic: { borderRadius: 8, backgroundColor: '#16161d' },
    vn: { color: '#e6e8ef', fontSize: 12, marginTop: 4 },
    rm: { color: '#ff9f43', fontSize: 10, marginTop: 1 },
    msg: { color: '#777', textAlign: 'center', marginTop: 40 },
});
