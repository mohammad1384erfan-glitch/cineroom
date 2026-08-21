import { VideoPlayerAdapter, PlayerCapabilities } from './VideoPlayerAdapter';
import { useRoomStore } from '../../../store/useRoomStore';

const loadDailymotionApi = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).DM) {
      return resolve();
    }

    const scripts = Array.from(document.querySelectorAll('script'));
    const isAlreadyInjected = scripts.some(s => s.src.includes('api.dmcdn.net/all.js'));

    if (!isAlreadyInjected) {
      const tag = document.createElement('script');
      tag.src = 'https://api.dmcdn.net/all.js';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      tag.onload = () => resolve();
    } else {
      resolve();
    }
  });
};

export class DailymotionAdapter implements VideoPlayerAdapter {
  private player: any = null;
  private isReady = false;
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
    await loadDailymotionApi();

    const store = useRoomStore.getState();
    const videoId = store.playbackState.videoId;

    const playerDiv = document.createElement('div');
    playerDiv.id = 'dm-player-target';
    playerDiv.className = 'w-full h-full';
    container.appendChild(playerDiv);

    this.player = (window as any).DM.player(playerDiv, {
      video: videoId,
      width: '100%',
      height: '100%',
      params: {
        autoplay: 0,
        controls: 1
      }
    });

    this.player.addEventListener('apiready', () => {
      this.isReady = true;
      if (this.player) {
        this.duration = this.player.duration || 0;
        this.onStateChange?.({ duration: this.duration });
      }
    });

    this.player.addEventListener('play', () => {
      this.onStateChange?.({ playing: true });
    });

    this.player.addEventListener('pause', () => {
      this.onStateChange?.({ playing: false });
    });

    this.player.addEventListener('timeupdate', () => {
      if (this.player) {
        this.onStateChange?.({ currentTime: this.player.currentTime });
        if (this.player.duration && this.player.duration !== this.duration) {
          this.duration = this.player.duration;
          this.onStateChange?.({ duration: this.duration });
        }
      }
    });

    this.player.addEventListener('video_end', () => {
      this.onEnded?.();
    });
  }

  public play(): void {
    if (this.isReady && this.player) {
      this.player.play();
    }
  }

  public pause(): void {
    if (this.isReady && this.player) {
      this.player.pause();
    }
  }

  public seek(time: number): void {
    if (this.isReady && this.player) {
      this.player.seek(time);
    }
  }

  public getCurrentTime(): number {
    return (this.isReady && this.player) ? this.player.currentTime : 0;
  }

  public getDuration(): number {
    return this.duration;
  }

  public destroy(): void {
    this.isReady = false;
    this.player = null;
    const target = document.getElementById('dm-player-target');
    target?.remove();
  }
}
