import { NativeModules, NativeEventEmitter } from 'react-native';

const { DLNACasting } = NativeModules;

export interface DLNADevice {
  id: string;
  name: string;
  icon?: string;
}

export type CastStatus = 'connecting' | 'playing' | 'stopped' | 'error';

export interface CastStatusEvent {
  deviceId: string;
  status: CastStatus;
  error?: string;
}

class DLNACastingService {
  private emitter: NativeEventEmitter | null = null;
  private _devices: DLNADevice[] = [];
  private _listeners: Set<() => void> = new Set();

  get devices(): DLNADevice[] { return this._devices; }

  constructor() {
    if (DLNACasting) {
      this.emitter = new NativeEventEmitter(DLNACasting);
      this.emitter.addListener('onDeviceFound', (d: DLNADevice) => {
        if (!this._devices.find(x => x.id === d.id)) {
          this._devices.push(d);
          this.notify();
        }
      });
      this.emitter.addListener('onDeviceLost', (d: { id: string }) => {
        this._devices = this._devices.filter(x => x.id !== d.id);
        this.notify();
      });
    }
  }

  startDiscovery() { DLNACasting?.startDiscovery(); }
  stopDiscovery() { DLNACasting?.stopDiscovery(); }
  cast(url: string, deviceId: string) { DLNACasting?.cast(url, deviceId); }
  stop(deviceId: string) { DLNACasting?.stop(deviceId); }

  onCastStatus(cb: (e: CastStatusEvent) => void) {
    return this.emitter?.addListener('onCastStatus', cb);
  }

  onChange(cb: () => void) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  private notify() { this._listeners.forEach(cb => cb()); }
}

export const dlnaService = new DLNACastingService();

/** React 组件：投屏设备列表弹窗 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList } from 'react-native';

export function DLNAPicker({ visible, onClose, castUrl }: { visible: boolean; onClose: () => void; castUrl?: string }) {
  const [devices, setDevices] = useState<DLNADevice[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setScanning(true);
    dlnaService.startDiscovery();
    const off = dlnaService.onChange(() => setDevices([...dlnaService.devices]));
    setTimeout(() => { setScanning(false); }, 5000);
    return () => { off(); dlnaService.stopDiscovery(); };
  }, [visible]);

  const handleCast = useCallback((device: DLNADevice) => {
    if (castUrl) dlnaService.cast(castUrl, device.id);
    onClose();
  }, [castUrl, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ width: '85%', backgroundColor: '#1c1c1e', borderRadius: 14, padding: 20 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 16 }}>投屏</Text>
          {scanning && <Text style={{ color: '#888', marginBottom: 12 }}>正在扫描设备...</Text>}
          {devices.length === 0 && !scanning && <Text style={{ color: '#888', marginBottom: 12 }}>未发现设备</Text>}
          <FlatList
            data={devices}
            keyExtractor={d => d.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleCast(item)} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#333' }}>
                <Text style={{ color: '#fff', fontSize: 16 }}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity onPress={onClose} style={{ marginTop: 16, padding: 12, backgroundColor: '#333', borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#fff' }}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
