import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

// 极简测试版：纯 RN 0.72，无 nodejs-mobile / react-native-video
// 用于验证 RN 在设备上能正常启动
export default function App() {
    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.c}>
                <Text style={styles.t}>CatPlayer</Text>
                <Text style={styles.s}>RN 0.72 测试启动 ✅</Text>
                <Text style={styles.d}>如果看到这行说明 RN 本身没问题</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0b0b0f' },
    c: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    t: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 12 },
    s: { color: '#7aa2ff', fontSize: 18, marginBottom: 8 },
    d: { color: '#888', fontSize: 14, textAlign: 'center' },
});
