import React from 'react';
import { FlatList, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { useNav } from '../App';
import type { CatConfig, Site } from '../../api/CatApi';

export default function Sites({ config }: { config: CatConfig }) {
    const nav = useNav();
    const sites: Site[] = config?.video?.sites || [];

    return (
        <FlatList
            data={sites}
            keyExtractor={s => s.api}
            ListEmptyComponent={<Text style={styles.empty}>无站点</Text>}
            renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => nav.push('Category', { site: item })}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.api}>{item.api}</Text>
                </TouchableOpacity>
            )}
        />
    );
}

const styles = StyleSheet.create({
    row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1d1d25', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { color: '#eceef4', fontSize: 16, flex: 1 },
    api: { color: '#5b6072', fontSize: 11 },
    empty: { color: '#777', textAlign: 'center', marginTop: 40 },
});
