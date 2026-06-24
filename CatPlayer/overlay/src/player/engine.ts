export interface PlayerEngine {
  play(url: string, headers?: Record<string, string>): void;
  pause(): void;
  resume(): void;
  seek(position: number): void;
  setRate(rate: number): void;
  setQuality(index: number): void;
  // Events
  onProgress: ((pos: number, dur: number) => void) | null;
  onError: ((err: string) => void) | null;
  onLoad: ((duration: number) => void) | null;
  onEnd: (() => void) | null;
  /** 释放引擎资源 */
  destroy(): void;
}
