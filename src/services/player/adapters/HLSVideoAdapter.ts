import Hls from 'hls.js';
import { VideoPlayerAdapter, PlayerCapabilities } from './VideoPlayerAdapter';
import { useRoomStore } from '../../../store/useRoomStore';

export class HLSVideoAdapter implements VideoPlayerAdapter {
  private videoEl: HTMLVideoElement | null = null;
  private hlsInstance: Hls | null = null;
  public onStateChange?: (state: { playing?: boolean; currentTime?: number; duration?: number }) => void;
  public onEnded?: () => void;

  public capabilities: PlayerCapabilities = {
    play: true,
    pause: true,
    seek: true,
    subtitles: true,
    realtimeSync: true
  };

  private listeners: { [key: string]: EventListener } = {};

  public async load(container: HTMLDivElement): Promise<void> {
    const store = useRoomStore.getState();
    const sourceUrl = store.playbackState.sourceUrl;

    const video = document.createElement('video');
    video.className = 'w-full h-full object-contain';
    video.controls = false;
    video.preload = 'auto';
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    if (store.p2pSubtitleUrl) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.src = store.p2pSubtitleUrl;
      track.srclang = 'en';
      track.label = store.p2pSubtitleName || 'Subtitles';
      track.default = true;
      video.appendChild(track);
    }

    container.appendChild(video);
    this.videoEl = video;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferSize: 30 * 1024 * 1024
      });
      hls.loadSource(sourceUrl);
      hls.attachMedia(video);
      this.hlsInstance = hls;
    } else if (video.canPlayType('application/x-mpegURL') || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = sourceUrl;
    }

    this.setupListeners();
  }

  private setupListeners() {
    if (!this.videoEl) return;

    this.listeners.play = () => {
      this.onStateChange?.({ playing: true });
    };

    this.listeners.pause = () => {
      this.onStateChange?.({ playing: false });
    };

    this.listeners.seeked = () => {
      if (this.videoEl) {
        this.onStateChange?.({ currentTime: this.videoEl.currentTime });
      }
    };

    this.listeners.timeupdate = () => {
      if (this.videoEl) {
        this.onStateChange?.({ currentTime: this.videoEl.currentTime });
      }
    };

    this.listeners.durationchange = () => {
      if (this.videoEl) {
        this.onStateChange?.({ duration: this.videoEl.duration });
      }
    };

    this.listeners.ended = () => {
      this.onEnded?.();
    };

    // Diagnostic event listeners
    this.listeners.error = () => {
      const error = this.videoEl?.error;
      console.error("[VIDEO][ERROR]", {
        code: error?.code,
        message: error?.message,
        currentSrc: this.videoEl?.currentSrc,
        readyState: this.videoEl?.readyState,
        networkState: this.videoEl?.networkState
      });
    };

    this.listeners.loadedmetadata = () => {
      console.log("[VIDEO][EVENT] loadedmetadata", {
        currentSrc: this.videoEl?.currentSrc,
        readyState: this.videoEl?.readyState,
        networkState: this.videoEl?.networkState
      });
    };

    this.listeners.loadeddata = () => {
      console.log("[VIDEO][EVENT] loadeddata");
    };

    this.listeners.canplay = () => {
      console.log("[VIDEO][EVENT] canplay");
    };

    this.listeners.playing = () => {
      console.log("[VIDEO][EVENT] playing");
    };

    this.listeners.waiting = () => {
      console.log("[VIDEO][EVENT] waiting");
    };

    this.listeners.stalled = () => {
      console.log("[VIDEO][EVENT] stalled");
    };

    this.videoEl.addEventListener('play', this.listeners.play);
    this.videoEl.addEventListener('pause', this.listeners.pause);
    this.videoEl.addEventListener('seeked', this.listeners.seeked);
    this.videoEl.addEventListener('timeupdate', this.listeners.timeupdate);
    this.videoEl.addEventListener('durationchange', this.listeners.durationchange);
    this.videoEl.addEventListener('ended', this.listeners.ended);
    this.videoEl.addEventListener('error', this.listeners.error);
    this.videoEl.addEventListener('loadedmetadata', this.listeners.loadedmetadata);
    this.videoEl.addEventListener('loadeddata', this.listeners.loadeddata);
    this.videoEl.addEventListener('canplay', this.listeners.canplay);
    this.videoEl.addEventListener('playing', this.listeners.playing);
    this.videoEl.addEventListener('waiting', this.listeners.waiting);
    this.videoEl.addEventListener('stalled', this.listeners.stalled);
  }

  public play(): void {
    this.videoEl?.play().catch(() => {});
  }

  public pause(): void {
    this.videoEl?.pause();
  }

  public seek(time: number): void {
    if (this.videoEl) {
      this.videoEl.currentTime = time;
    }
  }

  public getCurrentTime(): number {
    return this.videoEl ? this.videoEl.currentTime : 0;
  }

  public getDuration(): number {
    return this.videoEl ? this.videoEl.duration : 0;
  }

  public destroy(): void {
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }

    if (this.videoEl) {
      this.videoEl.removeEventListener('play', this.listeners.play);
      this.videoEl.removeEventListener('pause', this.listeners.pause);
      this.videoEl.removeEventListener('seeked', this.listeners.seeked);
      this.videoEl.removeEventListener('timeupdate', this.listeners.timeupdate);
      this.videoEl.removeEventListener('durationchange', this.listeners.durationchange);
      this.videoEl.removeEventListener('ended', this.listeners.ended);
      this.videoEl.removeEventListener('error', this.listeners.error);
      this.videoEl.removeEventListener('loadedmetadata', this.listeners.loadedmetadata);
      this.videoEl.removeEventListener('loadeddata', this.listeners.loadeddata);
      this.videoEl.removeEventListener('canplay', this.listeners.canplay);
      this.videoEl.removeEventListener('playing', this.listeners.playing);
      this.videoEl.removeEventListener('waiting', this.listeners.waiting);
      this.videoEl.removeEventListener('stalled', this.listeners.stalled);

      this.videoEl.src = '';
      this.videoEl.load();
      this.videoEl.remove();
      this.videoEl = null;
    }
  }
}
