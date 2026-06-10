import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, Animated, PanResponder, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useNav } from '../App';
import { StorageService, HistoryItem } from '../../storage/StorageService';

/** 将时间戳转换为相对时间文本（如 "3分钟前"、"2小时前"、"昨天"） */
function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return '刚刚';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}小时前`;
    const day = Math.floor(hr / 24);
    if (day === 1) return '昨天';
    if (day < 30) return `${day}天前`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month}个月前`;
    return `${Math.floor(month / 12)}年前`;
}

/** 可滑动行组件：左滑露出删除按钮，或长按触发删除确认 */
function SwipeableRow({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
    const transX = useRef(new Animated.Value(0)).current;
    const DEL_WIDTH = 72;

    const pan = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
            onPanResponderMove: (_, gs) => {
                if (gs.dx < 0) {
                    transX.setValue(Math.max(gs.dx, -DEL_WIDTH));
                } else {
                    const val = transX as any;
                    const cur = val._value ?? 0;
                    if (cur < 0) {
                        transX.setValue(Math.min(0, cur + gs.dx));
                    }
                }
            },
            onPanResponderRelease: (_, gs) => {
                const shouldOpen = gs.dx < -30 || (transX as any)._value < -DEL_WIDTH / 2;
                Animated.spring(transX, { toValue: shouldOpen ? -DEL_WIDTH : 0, useNativeDriver: true }).start();
            },
        }),
    ).current;

    /** 关闭已打开的滑动行 */
    const close = useCallback(() => {
        Animated.spring(transX, { toValue: 0, useNativeDriver: true }).start();
    }, [transX]);

    /** 点击删除按钮后弹出确认框 */
    const confirmRemove = () => {
        close();
        Alert.alert('删除记录', '确定删除该条观看记录？', [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: onRemove },
        ]);
    };

    return (
        <View style={s.swipeWrap}>
            <TouchableOpacity
                activeOpacity={0.6}
                onLongPress={() => {
                    close();
                    Alert.alert('删除记录', '确定删除该条观看记录？', [
                        { text: '取消', style: 'cancel' },
                        { text: '删除', style: 'destructive', onPress: onRemove },
                    ]);
                }}
                style={s.deleteBtn}
                onPress={confirmRemove}
            >
                <Text style={s.deleteTxt}>删除</Text>
            </TouchableOpacity>
            <Animated.View style={{ transform: [{ translateX: transX }] }}>
                {children}
            </Animated.View>
        </View>
    );
}

/** 观看历史页面：展示历史记录列表，支持滑动/长按删除、清空全部 */
export default function History() {
    const nav = useNav();
    const [list, setList] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    /** 加载历史记录并按 updatedAt 降序排列 */
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const items = await StorageService.listHistory();
            items.sort((a, b) => b.updatedAt - a.updatedAt);
            setList(items);
        } catch {
            setList([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /** 删除单条历史记录 */
    const removeItem = useCallback(async (id: string, siteKey: string) => {
        await StorageService.removeHistory(id, siteKey);
        setList(prev => prev.filter(h => !(h.id === id && h.siteKey === siteKey)));
    }, []);

    /** 清空全部历史记录（带二次确认） */
    const clearAll = useCallback(() => {
        if (list.length === 0) return;
        Alert.alert('清空历史', '确定清空所有观看记录？此操作不可恢复。', [
            { text: '取消', style: 'cancel' },
            {
                text: '清空',
                style: 'destructive',
                onPress: async () => {
                    for (const h of list) {
                        await StorageService.removeHistory(h.id, h.siteKey);
                    }
                    setList([]);
                },
            },
        ]);
    }, [list]);

    /** 点击历史条目，导航到详情页 */
    const goToDetail = useCallback((item: HistoryItem) => {
        nav.push('Detail', {
            site: { key: item.siteKey, type: 0, name: item.siteName, api: item.siteApi },
            vodId: item.id,
        });
    }, [nav]);

    /** 渲染单条历史记录行 */
    const renderItem = ({ item }: { item: HistoryItem }) => {
        const progress = item.lastDuration > 0 ? Math.min(item.lastPosition / item.lastDuration, 1) : 0;

        return (
            <SwipeableRow onRemove={() => removeItem(item.id, item.siteKey)}>
                <TouchableOpacity style={s.row} onPress={() => goToDetail(item)} activeOpacity={0.7}>
                    <Image
                        source={item.pic ? { uri: item.pic } : undefined}
                        style={s.thumb}
                        defaultSource={undefined}
                    />
                    {!item.pic && <View style={s.thumbFallback} />}
                    <View style={s.info}>
                        <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                        <Text style={s.sub} numberOfLines={1}>{item.siteName}</Text>
                        {!!item.lastEpisode && <Text style={s.ep} numberOfLines={1}>{item.lastEpisode}</Text>}
                        {item.lastDuration > 0 && (
                            <View style={s.barWrap}>
                                <View style={s.barBg}>
                                    <View style={[s.barFill, { width: `${Math.round(progress * 100)}%` }]} />
                                </View>
                                <Text style={s.barLabel}>{Math.round(progress * 100)}%</Text>
                            </View>
                        )}
                    </View>
                    <Text style={s.time}>{timeAgo(item.updatedAt)}</Text>
                </TouchableOpacity>
            </SwipeableRow>
        );
    };

    if (loading) {
        return <View style={s.center}><ActivityIndicator color="#7aa2ff" /></View>;
    }

    return (
        <View style={s.root}>
            <FlatList
                data={list}
                keyExtractor={h => `${h.id}_${h.siteKey}`}
                renderItem={renderItem}
                ListEmptyComponent={<Text style={s.empty}>暂无观看记录</Text>}
                contentContainerStyle={list.length === 0 ? s.emptyWrap : undefined}
            />
            {list.length > 0 && (
                <TouchableOpacity style={s.clearBtn} onPress={clearAll}>
                    <Text style={s.clearTxt}>清空</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0b0b0f' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0f' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { color: '#8a8f9c', fontSize: 15 },
    swipeWrap: { overflow: 'hidden' },
    deleteBtn: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 72, backgroundColor: '#d63031', alignItems: 'center', justifyContent: 'center' },
    deleteTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#0b0b0f', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25' },
    thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#1a1a22' },
    thumbFallback: { position: 'absolute', left: 14, width: 56, height: 56, borderRadius: 8, backgroundColor: '#1a1a22' },
    info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    name: { color: '#cfd2dc', fontSize: 15, fontWeight: '600' },
    sub: { color: '#8a8f9c', fontSize: 12, marginTop: 3 },
    ep: { color: '#7aa2ff', fontSize: 12, marginTop: 2 },
    barWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    barBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#1d1d25', marginRight: 6 },
    barFill: { height: 3, borderRadius: 2, backgroundColor: '#7aa2ff' },
    barLabel: { color: '#8a8f9c', fontSize: 10, minWidth: 30 },
    time: { color: '#8a8f9c', fontSize: 11, marginLeft: 8 },
    clearBtn: { position: 'absolute', top: 8, right: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: '#1d1d25' },
    clearTxt: { color: '#d63031', fontSize: 13, fontWeight: '500' },
});
