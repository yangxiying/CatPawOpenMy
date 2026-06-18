import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, FlatList, TouchableOpacity, Image,
    ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { useNav } from '../App';
import { CatApi, Site } from '../../api/CatApi';
import NodeService from '../../node/NodeService';

const COLS = 3;
const GAP = 5;
const W = (Dimensions.get('window').width - GAP * (COLS + 1)) / COLS;

type SearchItem = {
    vod_id: string; vod_name: string; vod_pic: string; vod_remarks?: string;
};

export default function Search({ site }: { site: Site }) {
    const nav = useNav();
    const inputRef = useRef<TextInput>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const doSearch = useCallback(async (wd: string) => {
        const trimmed = wd.trim();
        if (!trimmed || !site) return;
        setLoading(true);
        setMsg(null);
        setSearched(true);
        try {
            await CatApi.ensureInit(site.api);
            const data = await CatApi.search(site.api, trimmed, 1);
            const list = data?.list || [];
            setResults(Array.isArray(list) ? list.slice(0, 50).map((it: any) => ({
                vod_id: it.vod_id, vod_name: it.vod_name, vod_pic: it.vod_pic, vod_remarks: it.vod_remarks || '',
            })) : []);
            if (!list.length) setMsg('未找到相关内容');
        } catch (e: any) {
            setMsg('搜索失败: ' + (e?.message || e));
        } finally {
            setLoading(false);
        }
    }, [site]);

    const goDetail = (item: SearchItem) => {
        if (site) nav.push('Detail', { site, vodId: item.vod_id });
    };

    return (
        <View style={styles.c}>
            {/* 搜索输入框 */}
            <View style={styles.searchBar}>
                <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="搜索影片名称..."
                    placeholderTextColor="#666"
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={() => doSearch(query)}
                    returnKeyType="search"
                    autoFocus
                />
                <TouchableOpacity style={styles.searchBtn} onPress={() => doSearch(query)} activeOpacity={0.7}>
                    <Text style={styles.searchBtnT}>搜索</Text>
                </TouchableOpacity>
            </View>

            {/* 搜索结果 */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator color="#7aa2ff" size="large" /></View>
            ) : searched && results.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.msg}>{msg || '无结果'}</Text>
                </View>
            ) : results.length > 0 ? (
                <FlatList
                    data={results}
                    numColumns={COLS}
                    keyExtractor={(it, i) => String(it.vod_id) + '_' + i}
                    contentContainerStyle={{ padding: GAP }}
                    columnWrapperStyle={{ gap: GAP }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={[styles.card, { width: W }]} onPress={() => goDetail(item)} activeOpacity={0.8}>
                            <Image source={{ uri: item.vod_pic }} style={[styles.pic, { width: W, height: W * 1.4 }]} />
                            <Text style={styles.vn} numberOfLines={1}>{item.vod_name}</Text>
                            {!!item.vod_remarks && <Text style={styles.rm} numberOfLines={1}>{item.vod_remarks}</Text>}
                        </TouchableOpacity>
                    )}
                    ListFooterComponent={<View style={{ height: 20 }} />}
                />
            ) : (
                <View style={styles.center}>
                    <Text style={styles.msg}>输入关键词搜索影片</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    c: { flex: 1, backgroundColor: '#0b0b0f' },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25',
    },
    input: {
        flex: 1, height: 36, borderRadius: 18, backgroundColor: '#1a1a24', paddingHorizontal: 14,
        color: '#e6e8ef', fontSize: 14,
    },
    searchBtn: {
        marginLeft: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: '#7aa2ff',
    },
    searchBtnT: { color: '#fff', fontSize: 14, fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    msg: { color: '#777', fontSize: 13, textAlign: 'center' },
    card: { marginBottom: GAP, borderRadius: 5, overflow: 'hidden', backgroundColor: '#12121a' },
    pic: { borderRadius: 5, backgroundColor: '#16161d', resizeMode: 'cover' },
    vn: { color: '#e6e8ef', fontSize: 10, marginTop: 3, marginLeft: 2, marginRight: 2, marginBottom: 2 },
    rm: { color: '#ff9f43', fontSize: 9, marginTop: 1, marginLeft: 2, marginRight: 2, marginBottom: 4 },
});
