import { PlayerEngine } from '../engine';

export class BuiltinEngine implements PlayerEngine {
  onProgress: ((pos: number, dur: number) => void) | null = null;
  onError: ((err: string) => void) | null = null;
  onLoad: ((duration: number) => void) | null = null;
  onEnd: (() => void) | null = null;

  play(url: string, headers?: Record<string, string>) {
    // BuiltinEngine 是纯 React 组件驱动（VideoPlayer.tsx 直接使用 react-native-video props）
    // play() 在此为 no-op — 实际播放由 VideoPlayer.tsx 的 props 驱动
  }
  pause() {}
  resume() {}
  seek(_position: number) {}
  setRate(_rate: number) {}
  setQuality(_index: number) {}
  destroy() {}
}
