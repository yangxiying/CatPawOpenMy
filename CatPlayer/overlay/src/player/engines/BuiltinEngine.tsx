import React from 'react';
import { PlayerEngine } from '../engine';

let Video: any = null;
try { Video = require('react-native-video').default; } catch {}

export class BuiltinEngine implements PlayerEngine {
  private ref: any = null;
  private currentUri: string = '';
  private currentHeaders: Record<string, string> = {};

  onProgress: ((pos: number, dur: number) => void) | null = null;
  onError: ((err: string) => void) | null = null;
  onLoad: ((duration: number) => void) | null = null;
  onEnd: (() => void) | null = null;

  play(url: string, headers?: Record<string, string>) {
    this.currentUri = url;
    this.currentHeaders = headers || {};
  }

  pause() {
    this.ref?.pause();
  }

  resume() {
    this.ref?.resume();
  }

  seek(position: number) {
    this.ref?.seek(position);
  }

  setRate(rate: number) {
    this.ref?.setRate(rate);
  }

  setQuality(_index: number) {
    // react-native-video handles quality internally
  }

  presentFullscreen() {
    this.ref?.presentFullscreenPlayer();
  }

  destroy() {
    this.ref = null;
  }

  renderVideo(props: {
    uri: string;
    headers?: Record<string, string>;
    rate: number;
    onLoadStart: () => void;
    onLoad: (e: any) => void;
    onProgress: (e: any) => void;
    onError: (e: any) => void;
    resumePos?: number;
  }): React.ReactNode {
    if (!Video) return null;
    return (
      <Video
        ref={(r: any) => { this.ref = r; }}
        source={{ uri: props.uri, headers: props.headers || {} }}
        style={{ flex: 1 }}
        controls
        resizeMode="contain"
        fullscreenOrientation="landscape"
        fullscreenAutorotate
        playInBackground
        playWhenInactive
        ignoreSilentSwitch="ignore"
        rate={props.rate}
        onLoadStart={props.onLoadStart}
        onLoad={(e: any) => {
          const dur = e?.duration || e?.naturalSize?.duration || 0;
          this.onLoad?.(dur);
          props.onLoad(e);
        }}
        onProgress={props.onProgress}
        onError={props.onError}
      />
    );
  }
}
