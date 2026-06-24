import { PlayerEngine } from './engine';

export const ENGINE_KEYS = ['builtin', 'mpv'] as const;
export type EngineKey = typeof ENGINE_KEYS[number];

export const ENGINE_LABELS: Record<EngineKey, string> = {
  builtin: '内置播放器',
  mpv: 'MPV (FFmpeg)',
};

const ENGINES: Record<string, { key: EngineKey; label: string; factory: () => PlayerEngine }> = {
  mpv:     { key: 'mpv',     label: 'MPV',     factory: () => new (require('./engines/MPVEngine').MPVEngine)() },
  builtin: { key: 'builtin', label: '内置',    factory: () => new (require('./engines/BuiltinEngine').BuiltinEngine)() },
};

export function createEngine(key: string): PlayerEngine {
  const e = ENGINES[key] || ENGINES.builtin;
  try { return e.factory(); } catch {
    return ENGINES.builtin.factory();
  }
}
