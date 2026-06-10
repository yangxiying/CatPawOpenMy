import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, Alert, StyleSheet, Dimensions } from 'react-native';
import { useNav } from '../App';
import { Site } from '../../api/CatApi';
import { StorageService, FavoriteItem } from '../../storage/StorageService';

const COLS = 3;
const GAP = 8;

/**
 * 收藏页面：展示用户已收藏的影片列表。
 * 支持三列网格浏览、点击跳转详情、长按移除收藏。
 */
export default function Favorites() {
    const nav = useNav();
    const [list, setList] = useState<FavoriteItem[]>([]);
    const [reload, setReload] = useState(0);

    /** 从持久化存储加载收藏列表，reload 变化时重新加载 */
    useEffect(() => {
        (async () => {
            const items = await StorageService.listFavorites();
            setList(items);
        })();
    }, [reload]);

    /** 根据 FavoriteItem 中保存的站点信息重建 Site 对象 */
    const buildSite = (item: FavoriteItem): Site => ({
        key: item.siteKey,
        type: 0,
        name: item.siteName,
        api: item.siteApi,
    });

    /** 点击收藏项，跳转到详情页 */
    const onPress = (item: FavoriteItem) => {
        nav.push('Detail', { site: buildSite(item), vodId: item.id });
    };

    /** 长按收藏项，弹出确认对话框后移除 */
    const onLongPress = (item: FavoriteItem) => {
        Alert.alert('移除收藏', `确定移除「${item.name}」吗？`, [
            { text: '取消', style: 'cancel' },
            {
                text: '移除',
                style: 'destructive',
                onPress: async () => {
                    await StorageService.removeFavorite(item.id, item.siteKey);
                    setReload((r: number) => r + 1);
                },
            },
        ]);
    };

    /** 渲染单个收藏卡片：封面图、名称、备注 */
    const renderItem = ({ item }: { item: FavoriteItem }) => {
        const W = (Dimensions.get('window').width - GAP * (COLS + 1)) / COLS;
        return (
            <TouchableOpacity
                style={[styles.card, { width: W }]}
                onPress={() => onPress(item)}
                onLongPress={() => onLongPress(item)}
                activeOpacity={0.7}
            >
                <Image
                    source={{ uri: item.pic }}
                    style={[styles.pic, { width: W, height: W * 1.4 }]}
                    defaultSource={undefined}
                />
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                {!!item.remarks && <Text style={styles.remarks} numberOfLines={1}>{item.remarks}</Text>}
            </TouchableOpacity>
        );
    };

    /** 空状态组件：居中提示暂无收藏 */
    const Empty = () => (
        <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>暂无收藏</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={list}
                key={COLS}
                numColumns={COLS}
                keyExtractor={(item: FavoriteItem, i: number) => item.id + '_' + item.siteKey + '_' + i}
                contentContainerStyle={{ padding: GAP, flexGrow: 1 }}
                columnWrapperStyle={{ gap: GAP }}
                ListEmptyComponent={Empty}
                renderItem={renderItem}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0b0b0f' },
    card: { marginBottom: GAP },
    pic: { borderRadius: 8, backgroundColor: '#16161d' },
    name: { color: '#cfd2dc', fontSize: 12, marginTop: 4 },
    remarks: { color: '#8a8f9c', fontSize: 10, marginTop: 1 },
    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
    emptyText: { color: '#666', fontSize: 15 },
});
