import { NativeModules, NativeEventEmitter } from 'react-native';
import { PlayerEngine } from '../engine';

const { MPVPlayer } = NativeModules;

export class MPVEngine implements PlayerEngine {
  private emitter: NativeEventEmitter | null = null;
  onProgress: ((pos: number, dur: number) => void) | null = null;
  onError: ((err: string) => void) | null = null;
  onLoad: ((duration: number) => void) | null = null;
  onEnd: (() => void) | null = null;

  constructor() {
    if (MPVPlayer) {
      this.emitter = new NativeEventEmitter(MPVPlayer);
      this.emitter.addListener('onProgress', (e: any) => this.onProgress?.(e.position, e.duration));
      this.emitter.addListener('onError', (e: any) => this.onError?.(e.message));
      this.emitter.addListener('onLoad', (e: any) => this.onLoad?.(e.duration));
      this.emitter.addListener('onEnd', () => this.onEnd?.());
    }
  }

  play(url: string, headers?: Record<string, string>) { MPVPlayer?.play(url, headers || {}); }
  pause() { MPVPlayer?.pause(); }
  resume() { MPVPlayer?.resume(); }
  seek(position: number) { MPVPlayer?.seek(position); }
  setRate(rate: number) { MPVPlayer?.setRate(rate); }
  setQuality(index: number) { MPVPlayer?.setQuality(index); }
  destroy() {
    this.emitter?.removeAllListeners('onProgress');
    this.emitter?.removeAllListeners('onError');
    this.emitter?.removeAllListeners('onLoad');
    this.emitter?.removeAllListeners('onEnd');
  }
}
