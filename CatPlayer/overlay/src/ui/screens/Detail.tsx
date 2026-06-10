import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Modal, Animated, Dimensions, Platform } from 'react-native';
import { useNav } from '../App';
import { CatApi, splitPlay, parsePlayUrl, Site, PlayLine, Episode } from '../../api/CatApi';
import { StorageService } from '../../storage/StorageService';

const SCREEN_HEIGHT = Dimensions.get('window').height;

/** 从线路名称中提取 emoji 图标，若无则返回默认图标 */
function extractEmoji(name: string): string {
    const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;
    const match = name.match(emojiRegex);
    return match ? match[0] : '🎬';
}

/** 获取线路显示名称（去除首尾空格） */
function getLineDisplayName(line: PlayLine, index: number): string {
    return (line.from || ('线路' + (index + 1))).trim();
}

export default function Detail({ site, vodId }: { site: Site; vodId: any }) {
    const nav = useNav();
    const [vod, setVod] = useState<any>(null);
    const [lines, setLines] = useState<PlayLine[]>([]);
    const [li, setLi] = useState(0);
    const [msg, setMsg] = useState<string | null>('加载中…');
    const [resolving, setResolving] = useState(false);
    const [isFav, setIsFav] = useState(false);

    /** 底部弹窗状态 */
    const [showLineSheet, setShowLineSheet] = useState(false);
    const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    /** 打开线路选择底部弹窗 */
    const openLineSheet = useCallback(() => {
        setShowLineSheet(true);
        Animated.timing(sheetAnim, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
        }).start();
    }, [sheetAnim]);

    /** 关闭线路选择底部弹窗 */
    const closeLineSheet = useCallback(() => {
        Animated.timing(sheetAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowLineSheet(false));
    }, [sheetAnim]);

    /** 选择线路并关闭弹窗 */
    const selectLine = useCallback((index: number) => {
        setLi(index);
        closeLineSheet();
    }, [closeLineSheet]);

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

    /** 检查是否已收藏 */
    useEffect(() => {
        (async () => {
            const fav = await StorageService.isFavorite(String(vodId), site.key);
            setIsFav(fav);
        })();
    }, [vodId, site.key]);

    /** 切换收藏状态 */
    const toggleFav = async () => {
        if (!vod) return;
        if (isFav) {
            await StorageService.removeFavorite(String(vodId), site.key);
            setIsFav(false);
        } else {
            await StorageService.addFavorite({
                id: String(vodId),
                name: vod.vod_name || '',
                pic: vod.vod_pic || '',
                remarks: vod.vod_remarks || '',
                siteKey: site.key,
                siteName: site.name,
                siteApi: site.api,
                addedAt: Date.now(),
            });
            setIsFav(true);
        }
    };

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
            const epTitle = (vod?.vod_name || '') + ' ' + ep.name;
            nav.push('Player', { qualities, headers: res?.header || {}, title: epTitle, vodId: String(vodId), siteKey: site.key });
            StorageService.addHistory({
                id: String(vodId),
                name: vod?.vod_name || '',
                pic: vod?.vod_pic || '',
                remarks: vod?.vod_remarks || '',
                siteKey: site.key,
                siteName: site.name,
                siteApi: site.api,
                lastEpisode: ep.name,
                lastPosition: 0,
                lastDuration: 0,
                updatedAt: Date.now(),
            });
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
            <View style={styles.actions}>
                <TouchableOpacity style={[styles.favBtn, isFav && styles.favOn]} onPress={toggleFav}>
                    <Text style={[styles.favT, isFav && styles.favOnT]}>{isFav ? '★ 已收藏' : '☆ 收藏'}</Text>
                </TouchableOpacity>
            </View>
            {!!vod.vod_content && <Text style={styles.content}>{String(vod.vod_content).replace(/<[^>]+>/g, '').trim()}</Text>}

            {lines.length > 1 && (
                <TouchableOpacity style={styles.lineBar} onPress={openLineSheet} activeOpacity={0.7}>
                    <View style={styles.lineBarLeft}>
                        <Text style={styles.lineBarEmoji}>{extractEmoji(getLineDisplayName(line, li))}</Text>
                        <Text style={styles.lineBarText} numberOfLines={1}>{getLineDisplayName(line, li)}</Text>
                    </View>
                    <Text style={styles.lineBarArrow}>▼</Text>
                </TouchableOpacity>
            )}

            {lines.length === 1 && (
                <View style={styles.lineBar}>
                    <View style={styles.lineBarLeft}>
                        <Text style={styles.lineBarEmoji}>{extractEmoji(getLineDisplayName(line, 0))}</Text>
                        <Text style={styles.lineBarText} numberOfLines={1}>{getLineDisplayName(line, 0)}</Text>
                    </View>
                </View>
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

            {/* ═══════ 底部弹窗：选择播放线路 ═══════ */}
            <Modal visible={showLineSheet} transparent animationType="none" onRequestClose={closeLineSheet} statusBarTranslucent>
                <View style={sheetStyles.overlay}>
                    <TouchableOpacity style={sheetStyles.backdrop} activeOpacity={1} onPress={closeLineSheet} />
                    <Animated.View
                        style={[
                            sheetStyles.sheet,
                            { transform: [{ translateY: sheetAnim }] },
                        ]}
                    >
                        {/* 拖拽手柄 */}
                        <View style={sheetStyles.handleBar}>
                            <View style={sheetStyles.handle} />
                        </View>

                        {/* 标题 */}
                        <Text style={sheetStyles.title}>选择播放线路</Text>

                        {/* 线路列表 */}
                        <ScrollView
                            style={sheetStyles.list}
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                        >
                            {lines.map((l, i) => {
                                const displayName = getLineDisplayName(l, i);
                                const emoji = extractEmoji(displayName);
                                const isSelected = i === li;
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[sheetStyles.row, isSelected && sheetStyles.rowActive]}
                                        onPress={() => selectLine(i)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={sheetStyles.rowEmoji}>{emoji}</Text>
                                        <Text style={[sheetStyles.rowName, isSelected && sheetStyles.rowNameActive]} numberOfLines={1}>
                                            {displayName}
                                        </Text>
                                        {isSelected && <Text style={sheetStyles.checkIcon}>✓</Text>}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* 底部安全区域 */}
                        <View style={sheetStyles.safeBottom} />
                    </Animated.View>
                </View>
            </Modal>
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
    actions: { flexDirection: 'row', paddingHorizontal: 14, marginBottom: 8 },
    favBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1a1a22' },
    favOn: { backgroundColor: '#3a2f15' },
    favT: { color: '#9aa0ad', fontSize: 14 },
    favOnT: { color: '#ffc107' },
    content: { color: '#b9bdc8', fontSize: 13, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 6 },

    /** 线路选择按钮栏 */
    lineBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 14,
        marginTop: 10,
        marginBottom: 6,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#1a1a22',
    },
    lineBarLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    lineBarEmoji: {
        fontSize: 18,
        marginRight: 10,
    },
    lineBarText: {
        color: '#dfe2ea',
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
    },
    lineBarArrow: {
        color: '#9aa0ad',
        fontSize: 11,
        marginLeft: 8,
    },

    eps: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 8 },
    ep: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#1a1a22', minWidth: 70, alignItems: 'center' },
    epT: { color: '#dfe2ea', fontSize: 13 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0008' },
    olT: { color: '#fff', marginTop: 10 },
});

/** 底部弹窗（线路选择器）样式 */
const sheetStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },

    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },

    sheet: {
        backgroundColor: '#f8f8f8',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: SCREEN_HEIGHT * 0.6,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
            },
            android: {
                elevation: 12,
            },
        }),
    },

    handleBar: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 8,
    },

    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#ccc',
    },

    title: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1a1a1a',
        textAlign: 'center',
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e0e0e0',
    },

    list: {
        paddingHorizontal: 8,
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        minHeight: 56,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },

    rowActive: {
        backgroundColor: '#e8f4fd',
    },

    rowEmoji: {
        fontSize: 22,
        marginRight: 14,
        width: 28,
        textAlign: 'center',
    },

    rowName: {
        flex: 1,
        fontSize: 15,
        color: '#333',
        fontWeight: '500',
    },

    rowNameActive: {
        color: '#1976d2',
        fontWeight: '700' as any,
    },

    checkIcon: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1976d2',
        marginLeft: 8,
    },

    safeBottom: {
        height: 20,
    },
});
