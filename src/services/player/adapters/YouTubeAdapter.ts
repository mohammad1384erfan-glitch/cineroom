import { VideoPlayerAdapter, PlayerCapabilities } from './VideoPlayerAdapter';
import { useRoomStore } from '../../../store/useRoomStore';

const loadYoutubeApi = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).YT && (window as any).YT.Player) {
      return resolve();
    }

    const checkInterval = setInterval(() => {
      if ((window as any).YT && (window as any).YT.Player) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Timeout safety fallback after 5 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 5000);

    const scripts = Array.from(document.querySelectorAll('script'));
    const isAlreadyInjected = scripts.some(s => s.src.includes('youtube.com/iframe_api'));

    if (!isAlreadyInjected) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const previousCallback = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (previousCallback) previousCallback();
      clearInterval(checkInterval);
      resolve();
    };
  });
};

export class YouTubeAdapter implements VideoPlayerAdapter {
  private player: any = null;
  private fallbackIframe: HTMLIFrameElement | null = null;
  private isReady = false;
  private pollInterval: any = null;
  public onStateChange?: (state: { playing?: boolean; currentTime?: number; duration?: number }) => void;
  public onEnded?: () => void;

  public capabilities: PlayerCapabilities = {
    play: true,
    pause: true,
    seek: true,
    subtitles: false,
    realtimeSync: true
  };

  public async load(container: HTMLDivElement): Promise<void> {
    await loadYoutubeApi();

    const store = useRoomStore.getState();
    const videoId = store.playbackState.videoId;

    if (!(window as any).YT || !(window as any).YT.Player) {
      // Fallback to simple iframe if YouTube API script failed to load (e.g. adblock / network block)
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
      iframe.className = 'w-full h-full border-0 bg-black';
      iframe.allowFullscreen = true;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      container.appendChild(iframe);
      this.fallbackIframe = iframe;
      return;
    }

    const playerDiv = document.createElement('div');
    playerDiv.id = 'yt-player-target';
    playerDiv.className = 'w-full h-full';
    container.appendChild(playerDiv);

    return new Promise((resolve) => {
      try {
        this.player = new (window as any).YT.Player('yt-player-target', {
          videoId: videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1,
            disablekb: 0,
            fs: 1,
            modestbranding: 1,
            rel: 0
          },
          events: {
            onReady: () => {
              this.isReady = true;
              try {
                this.onStateChange?.({ duration: this.player.getDuration() });
              } catch (_) {}

              this.pollInterval = setInterval(() => {
                if (this.isReady && this.player && typeof this.player.getCurrentTime === 'function') {
                  try {
                    this.onStateChange?.({ currentTime: this.player.getCurrentTime() });
                  } catch (_) {}
                }
              }, 500);

              resolve();
            },
            onStateChange: (event: any) => {
              if (!this.isReady) return;
              const state = event.data;
              const YT_STATE = (window as any).YT?.PlayerState || {};

              if (state === YT_STATE.PLAYING) {
                this.onStateChange?.({ playing: true });
              } else if (state === YT_STATE.PAUSED) {
                this.onStateChange?.({ playing: false });
              } else if (state === YT_STATE.ENDED) {
                this.onStateChange?.({ playing: false });
                this.onEnded?.();
              }
            }
          }
        });
      } catch (_) {
        resolve();
      }
    });
  }

  public play(): void {
    if (this.isReady && this.player && typeof this.player.playVideo === 'function') {
      try { this.player.playVideo(); } catch (_) {}
    }
  }

  public pause(): void {
    if (this.isReady && this.player && typeof this.player.pauseVideo === 'function') {
      try { this.player.pauseVideo(); } catch (_) {}
    }
  }

  public seek(time: number): void {
    if (this.isReady && this.player && typeof this.player.seekTo === 'function') {
      try { this.player.seekTo(time, true); } catch (_) {}
    }
  }

  public getCurrentTime(): number {
    return (this.isReady && this.player && typeof this.player.getCurrentTime === 'function') ? this.player.getCurrentTime() : 0;
  }

  public getDuration(): number {
    return (this.isReady && this.player && typeof this.player.getDuration === 'function') ? this.player.getDuration() : 0;
  }

  public destroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.player) {
      try {
        this.player.destroy();
      } catch (_) {}
      this.player = null;
    }
    if (this.fallbackIframe) {
      this.fallbackIframe.remove();
      this.fallbackIframe = null;
    }
    this.isReady = false;
    const target = document.getElementById('yt-player-target');
    target?.remove();
  }
}
