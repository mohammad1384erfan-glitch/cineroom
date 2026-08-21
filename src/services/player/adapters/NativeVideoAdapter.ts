import { VideoPlayerAdapter, PlayerCapabilities } from './VideoPlayerAdapter';
import { useRoomStore } from '../../../store/useRoomStore';
import { logLocalFileE2E } from '../../webrtc/MockWebRTCService';

export class NativeVideoAdapter implements VideoPlayerAdapter {
  private videoEl: HTMLVideoElement | null = null;
  public onStateChange?: (state: { playing?: boolean; currentTime?: number; duration?: number }) => void;
  public onEnded?: () => void;
  public onError?: (error: { code?: number; message?: string }) => void;

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
    const sourceUrl = store.playbackState.sourceType === 'local' ? store.p2pObjectUrl || '' : store.playbackState.sourceUrl;
    
    console.log("[VIDEO_TRACE][GUEST] VIDEO_SRC_SET", {
      sourceUrl,
      sourceType: store.playbackState.sourceType
    });

    const video = document.createElement('video');
    video.className = 'w-full h-full object-contain';
    video.controls = false;
    video.preload = 'auto';
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('referrerpolicy', 'no-referrer');

    const source = document.createElement('source');
    source.src = sourceUrl;
    if (sourceUrl.includes('.webm') || sourceUrl.includes('.mkv')) {
      source.type = 'video/webm';
    } else {
      source.type = 'video/mp4';
    }
    video.appendChild(source);
    video.src = sourceUrl;

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
      const isLocal = this.videoEl?.currentSrc.startsWith('blob:');
      
      if (isLocal) {
        logLocalFileE2E('[GUEST][VIDEO_ERROR]', {
          errorMsg: error ? `${error.code}: ${error.message}` : 'unknown error'
        });
        console.log("[VIDEO_DEBUG][LOCAL][GUEST_ERROR]", {
          code: error?.code,
          message: error?.message,
          networkState: this.videoEl?.networkState,
          readyState: this.videoEl?.readyState,
          src: this.videoEl?.currentSrc
        });
      } else {
        console.log("[VIDEO_DEBUG][URL][GUEST_ERROR]", {
          code: error?.code,
          message: error?.message,
          networkState: this.videoEl?.networkState,
          readyState: this.videoEl?.readyState,
          src: this.videoEl?.currentSrc
        });
      }

      console.error("[VIDEO][ERROR]", {
        code: error?.code,
        message: error?.message,
        currentSrc: this.videoEl?.currentSrc,
        readyState: this.videoEl?.readyState,
        networkState: this.videoEl?.networkState
      });

      this.onError?.({
        code: error?.code,
        message: error?.message || 'Failed to load video stream.'
      });
    };

    this.listeners.loadedmetadata = () => {
      const isLocal = this.videoEl?.currentSrc.startsWith('blob:');
      if (isLocal) {
        logLocalFileE2E('[GUEST][LOADEDMETADATA]');
        console.log("[VIDEO_DEBUG][LOCAL][GUEST_LOADEDMETADATA]");
      } else {
        console.log("[VIDEO_DEBUG][URL][GUEST_LOAD]");
        console.log("[VIDEO_DEBUG][URL][GUEST_LOADEDMETADATA]");
      }

      console.log("[VIDEO_DEBUG][GUEST][LOADEDMETADATA]", {
        currentSrc: this.videoEl?.currentSrc,
        readyState: this.videoEl?.readyState
      });
      console.log("[VIDEO_TRACE][GUEST] LOADEDMETADATA", {
        currentSrc: this.videoEl?.currentSrc,
        readyState: this.videoEl?.readyState,
        duration: this.videoEl?.duration
      });
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
      const isLocal = this.videoEl?.currentSrc.startsWith('blob:');
      if (isLocal) {
        logLocalFileE2E('[GUEST][CANPLAY]');
        console.log("[VIDEO_DEBUG][LOCAL][GUEST_CANPLAY]");
      } else {
        console.log("[VIDEO_DEBUG][URL][GUEST_CANPLAY]");
      }

      console.log("[VIDEO_DEBUG][GUEST][CANPLAY]", {
        currentSrc: this.videoEl?.currentSrc,
        readyState: this.videoEl?.readyState
      });
      console.log("[VIDEO_TRACE][GUEST] CANPLAY", {
        currentSrc: this.videoEl?.currentSrc,
        readyState: this.videoEl?.readyState
      });
      console.log("[VIDEO][EVENT] canplay");
    };

    this.listeners.playing = () => {
      const isLocal = this.videoEl?.currentSrc.startsWith('blob:');
      if (isLocal) {
        logLocalFileE2E('[GUEST][PLAYING]');
        console.log("[VIDEO_DEBUG][LOCAL][GUEST_PLAYING]");
      } else {
        console.log("[VIDEO_DEBUG][URL][GUEST_PLAYING]");
      }

      console.log("[VIDEO_DEBUG][GUEST][PLAYING]", {
        currentSrc: this.videoEl?.currentSrc,
        currentTime: this.videoEl?.currentTime
      });
      console.log("[VIDEO_TRACE][GUEST] PLAYING", {
        currentSrc: this.videoEl?.currentSrc,
        currentTime: this.videoEl?.currentTime
      });
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
    if (this.videoEl) {
      const playPromise = this.videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name === 'NotAllowedError' && this.videoEl) {
            // Autoplay policy on mobile: play muted first so video frames render immediately
            this.videoEl.muted = true;
            this.videoEl.play().catch(() => {});
          }
        });
      }
    }
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

  public updateSource(url: string): void {
    if (this.videoEl && this.videoEl.src !== url) {
      console.log("[VIDEO_TRACE][GUEST] VIDEO_SRC_SET", {
        sourceUrl: url,
        sourceType: 'local_update'
      });
      const currentTime = this.videoEl.currentTime;
      const isPlaying = !this.videoEl.paused;
      this.videoEl.src = url;
      this.videoEl.load();
      if (isPlaying) {
        this.videoEl.play().catch(() => {});
      }
      this.videoEl.currentTime = currentTime;
    }
  }
}
