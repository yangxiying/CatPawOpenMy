import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ScrollView, StyleSheet, Dimensions } from 'react-native';

const W = (Dimensions.get('window').width - 15) / 3;

const SITES = [
  { key: 'douban', name: '🐵豆瓣|首页🐵', type: 3 },
  { key: 'config', name: '⚙️配置|中心⚙️', type: 3 },
];

const CATEGORIES = [
  { type_id: 'recommend', type_name: '推荐' },
  { type_id: 'hot', type_name: '热门' },
  { type_id: 'time', type_name: '最新' },
  { type_id: 'rank', type_name: '评分' },
];

const VIDEOS = [
  { vod_id: '1', vod_name: '我的妈耶', vod_pic: 'https://picsum.photos/seed/movie1/300/400', vod_score: '6.3', vod_remarks: '更新至12集' },
  { vod_id: '2', vod_name: '双喜', vod_pic: 'https://picsum.photos/seed/movie2/300/400', vod_score: '7.4', vod_remarks: '完结' },
  { vod_id: '3', vod_name: '蓝鹭', vod_pic: 'https://picsum.photos/seed/movie3/300/400', vod_score: '6.5', vod_remarks: '更新至6集' },
  { vod_id: '4', vod_name: '爱情有烟火', vod_pic: 'https://picsum.photos/seed/movie4/300/400', vod_score: '8.8', vod_remarks: '全40集' },
  { vod_id: '5', vod_name: '铁拳教育', vod_pic: 'https://picsum.photos/seed/movie5/300/400', vod_score: '8.0', vod_remarks: '更新至3集' },
  { vod_id: '6', vod_name: '南部档案', vod_pic: 'https://picsum.photos/seed/movie6/300/400', vod_score: '9.2', vod_remarks: '更新至8集' },
];

const EPISODES = ['第1集', '第2集', '第3集'];
const PLAY_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export default function Demo() {
  const [step, setStep] = useState<'sites' | 'categories' | 'videos' | 'detail' | 'play'>('sites');
  const [selectedVideo, setSelectedVideo] = useState<any>(null);

  if (step === 'play') {
    return (
      <View style={s.container}>
        <Text style={s.playing}>▶ 正在播放...</Text>
        <Text style={s.url}>{PLAY_URL}</Text>
        <TouchableOpacity style={s.btn} onPress={() => setStep('detail')}><Text style={s.btnText}>返回详情</Text></TouchableOpacity>
      </View>
    );
  }

  if (step === 'detail') {
    return (
      <View style={s.container}>
        <Text style={s.title}>{selectedVideo?.vod_name}</Text>
        <Text style={s.score}>评分：{selectedVideo?.vod_score}</Text>
        <Text style={s.desc}>这是一个演示视频，用于展示播放功能。</Text>
        <Text style={s.stitle}>播放线路</Text>
        <TouchableOpacity style={s.lineBtn}><Text style={s.lineText}>默认线路</Text></TouchableOpacity>
        <Text style={s.stitle}>选集</Text>
        <View style={s.epRow}>
          {EPISODES.map((ep, i) => (
            <TouchableOpacity key={i} style={s.epBtn} onPress={() => setStep('play')}>
              <Text>{ep}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.btn} onPress={() => setStep('videos')}><Text style={s.btnText}>返回列表</Text></TouchableOpacity>
      </View>
    );
  }

  if (step === 'videos') {
    return (
      <View style={s.container}>
        <Text style={s.title}>豆瓣|首页 — 视频列表</Text>
        <FlatList
          numColumns={3}
          data={VIDEOS}
          keyExtractor={v => v.vod_id}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => { setSelectedVideo(item); setStep('detail'); }}>
              <Image source={{ uri: item.vod_pic }} style={s.img} />
              <Text style={s.name} numberOfLines={1}>{item.vod_name}</Text>
              <View style={s.row}><Text style={s.score}>{item.vod_score}</Text><Text style={s.rmk}>{item.vod_remarks}</Text></View>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={s.btn} onPress={() => setStep('categories')}><Text style={s.btnText}>返回分类</Text></TouchableOpacity>
      </View>
    );
  }

  if (step === 'categories') {
    return (
      <View style={s.container}>
        <Text style={s.header}>分类 Tab</Text>
        <ScrollView horizontal style={s.tabRow}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c.type_id} style={s.tab} onPress={() => setStep('videos')}>
              <Text style={s.tabText}>{c.type_name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={s.hint}>点击任一分类查看视频列表</Text>
        <TouchableOpacity style={s.btn} onPress={() => setStep('sites')}><Text style={s.btnText}>返回站点</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.header}>视频源解析结果</Text>
      <Text style={s.info}>共 {SITES.length} 个站点</Text>
      <FlatList
        data={SITES}
        keyExtractor={s2 => s2.key}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.siteCard} onPress={() => setStep('categories')}>
            <Text style={s.siteName}>{item.name}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', padding: 12, paddingTop: 50 },
  header: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  info: { color: '#8a8f9c', fontSize: 14, marginBottom: 12 },
  siteCard: { backgroundColor: '#2a2f45', padding: 16, borderRadius: 8, marginBottom: 8 },
  siteName: { color: '#fff', fontSize: 16 },
  tabRow: { marginBottom: 16 },
  tab: { backgroundColor: '#4a9eff', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginRight: 10 },
  tabText: { color: '#fff', fontSize: 14 },
  hint: { color: '#8a8f9c', fontSize: 14, marginBottom: 16 },
  card: { width: W, margin: 2.5, marginBottom: 10 },
  img: { width: W, height: W * 1.4, borderRadius: 6, backgroundColor: '#333' },
  name: { color: '#fff', fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  score: { color: '#ff9f43', fontSize: 12 },
  rmk: { color: '#8a8f9c', fontSize: 12 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  desc: { color: '#cfd2dc', fontSize: 14, marginBottom: 16 },
  stitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 12, marginBottom: 8 },
  lineBtn: { backgroundColor: '#2a2f45', padding: 12, borderRadius: 6, marginBottom: 8 },
  lineText: { color: '#4a9eff', fontSize: 14 },
  epRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  epBtn: { backgroundColor: '#2a2f45', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
  btn: { backgroundColor: '#4a9eff', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  playing: { color: '#4a9eff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 100, marginBottom: 20 },
  url: { color: '#8a8f9c', fontSize: 12, textAlign: 'center', marginBottom: 40 },
});
