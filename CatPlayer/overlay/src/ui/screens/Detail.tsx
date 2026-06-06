import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useNav } from '../App';
import { CatApi, splitPlay, parsePlayUrl, Site, PlayLine, Episode } from '../../api/CatApi';

export default function Detail({ site, vodId }: { site: Site; vodId: any }) {
    const nav = useNav();
    const [vod, setVod] = useState<any>(null);
    const [lines, setLines] = useState<PlayLine[]>([]);
    const [li, setLi] = useState(0);
    const [msg, setMsg] = useState<string | null>('加载中…');
    const [resolving, setResolving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await CatApi.detail(site.api, vodId);
                const v = res?.list?.[0];
                if (!v) { setMsg('无详情'); return; }
                setVod(v); setLines(splitPlay(v)); setMsg(null);
            } catch (e: any) { setMsg('加载失败: ' + (e?.message || e)); }
        })();
    }, [site.api, vodId]);

    const playEp = async (line: PlayLine, ep: Episode) => {
        if (resolving) return;
        setResolving(true);
        try {
            const res = await CatApi.play(site.api, line.from, ep.id);
            if (res?.parse && res.parse !== 0) {
                Alert.alert('暂不支持', '该集需网页嗅探/外部解析（parse=' + res.parse + '），MVP 暂不支持。');
                return;
            }
            const qualities = parsePlayUrl(res?.url);
            if (!qualities.length) { Alert.alert('解析失败', '未取得播放地址'); return; }
            nav.push('Player', { qualities, headers: res?.header || {}, title: (vod?.vod_name || '') + ' ' + ep.name });
        } catch (e: any) {
            Alert.alert('错误', String(e?.message || e));
        } finally { setResolving(false); }
    };

    if (!vod) {
        return <View style={styles.center}>{msg ? <Text style={styles.msg}>{msg}</Text> : <ActivityIndicator color="#7aa2ff" />}</View>;
    }

    const line = lines[li];
    return (
        <ScrollView style={styles.c}>
            <View style={styles.head}>
                <Image source={{ uri: vod.vod_pic }} style={styles.pic} />
                <View style={styles.meta}>
                    <Text style={styles.name}>{vod.vod_name}</Text>
                    {!!vod.vod_remarks && <Text style={styles.sub}>{vod.vod_remarks}</Text>}
                    {!!(vod.vod_year || vod.vod_area) && <Text style={styles.sub}>{vod.vod_year} {vod.vod_area}</Text>}
                    {!!vod.type_name && <Text style={styles.sub}>{vod.type_name}</Text>}
                    {!!vod.vod_actor && <Text style={styles.sub} numberOfLines={2}>主演: {vod.vod_actor}</Text>}
                </View>
            </View>
            {!!vod.vod_content && <Text style={styles.content}>{String(vod.vod_content).replace(/<[^>]+>/g, '').trim()}</Text>}

            {lines.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.lines} contentContainerStyle={{ paddingHorizontal: 4 }}>
                    {lines.map((l, i) => (
                        <TouchableOpacity key={i} onPress={() => setLi(i)} style={[styles.lineTab, i === li && styles.lineOn]}>
                            <Text style={[styles.lineT, i === li && styles.lineTOn]}>{l.from || ('线路' + (i + 1))}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            <View style={styles.eps}>
                {line?.episodes.map((ep, i) => (
                    <TouchableOpacity key={i} style={styles.ep} onPress={() => playEp(line, ep)}>
                        <Text style={styles.epT} numberOfLines={1}>{ep.name}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <View style={{ height: 40 }} />
            {resolving && (
                <View style={styles.overlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.olT}>解析中…</Text>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    c: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    msg: { color: '#888' },
    head: { flexDirection: 'row', padding: 14 },
    pic: { width: 110, height: 154, borderRadius: 8, backgroundColor: '#16161d' },
    meta: { flex: 1, marginLeft: 14 },
    name: { color: '#fff', fontSize: 18, fontWeight: '600' },
    sub: { color: '#9aa0ad', fontSize: 13, marginTop: 5 },
    content: { color: '#b9bdc8', fontSize: 13, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 6 },
    lines: { paddingLeft: 10, marginTop: 6, maxHeight: 44 },
    lineTab: { paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, borderRadius: 14, backgroundColor: '#16161d' },
    lineOn: { backgroundColor: '#2a2f45' },
    lineT: { color: '#9aa0ad', fontSize: 13 },
    lineTOn: { color: '#fff' },
    eps: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 8 },
    ep: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#1a1a22', minWidth: 70, alignItems: 'center' },
    epT: { color: '#dfe2ea', fontSize: 13 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0008' },
    olT: { color: '#fff', marginTop: 10 },
});
