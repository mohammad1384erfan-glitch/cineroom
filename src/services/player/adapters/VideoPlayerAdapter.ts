
export interface PlayerCapabilities {
  play: boolean;
  pause: boolean;
  seek: boolean;
  subtitles: boolean;
  realtimeSync: boolean;
}

export interface VideoPlayerAdapter {
  load(element: HTMLDivElement): Promise<void>;
  play(): void;
  pause(): void;
  seek(time: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
  capabilities: PlayerCapabilities;
  onStateChange?: (state: { playing?: boolean; currentTime?: number; duration?: number }) => void;
  onEnded?: () => void;
  onError?: (error: { code?: number; message?: string }) => void;
  updateSource?(url: string): void;
}
