import { VideoPlayerAdapter, PlayerCapabilities } from './VideoPlayerAdapter';
import { useRoomStore } from '../../../store/useRoomStore';

const loadVimeoApi = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).Vimeo) {
      return resolve();
    }

    const scripts = Array.from(document.querySelectorAll('script'));
    const isAlreadyInjected = scripts.some(s => s.src.includes('player.vimeo.com/api/player.js'));

    if (!isAlreadyInjected) {
      const tag = document.createElement('script');
      tag.src = 'https://player.vimeo.com/api/player.js';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      tag.onload = () => resolve();
    } else {
      resolve();
    }
  });
};

export class VimeoAdapter implements VideoPlayerAdapter {
  private player: any = null;
  private isReady = false;
  private currentTime = 0;
  private duration = 0;
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
    await loadVimeoApi();

    const store = useRoomStore.getState();
    const videoId = store.playbackState.videoId;

    const playerDiv = document.createElement('div');
    playerDiv.id = 'vimeo-player-target';
    playerDiv.className = 'w-full h-full';
    container.appendChild(playerDiv);

    this.player = new (window as any).Vimeo.Player('vimeo-player-target', {
      id: parseInt(videoId),
      width: '100%',
      height: '100%',
      autoplay: false,
      controls: true
    });

    await this.player.ready();
    this.isReady = true;

    this.player.getDuration().then((d: number) => {
      this.duration = d;
      this.onStateChange?.({ duration: d });
    });

    this.player.on('play', () => {
      this.onStateChange?.({ playing: true });
    });

    this.player.on('pause', () => {
      this.onStateChange?.({ playing: false });
    });

    this.player.on('timeupdate', (data: { seconds: number }) => {
      this.currentTime = data.seconds;
      this.onStateChange?.({ currentTime: data.seconds });
    });

    this.player.on('ended', () => {
      this.onEnded?.();
    });
  }

  public play(): void {
    if (this.isReady && this.player) {
      this.player.play().catch(() => {});
    }
  }

  public pause(): void {
    if (this.isReady && this.player) {
      this.player.pause().catch(() => {});
    }
  }

  public seek(time: number): void {
    if (this.isReady && this.player) {
      this.player.setCurrentTime(time).catch(() => {});
    }
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getDuration(): number {
    return this.duration;
  }

  public destroy(): void {
    if (this.player) {
      try {
        this.player.unload();
      } catch (_) {}
      this.player = null;
    }
    this.isReady = false;
    const target = document.getElementById('vimeo-player-target');
    target?.remove();
  }
}
