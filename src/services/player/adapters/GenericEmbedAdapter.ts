import { VideoPlayerAdapter, PlayerCapabilities } from './VideoPlayerAdapter';
import { useRoomStore } from '../../../store/useRoomStore';

export class GenericEmbedAdapter implements VideoPlayerAdapter {
  private iframeEl: HTMLIFrameElement | null = null;
  public onStateChange?: (state: { playing?: boolean; currentTime?: number; duration?: number }) => void;

  public capabilities: PlayerCapabilities = {
    play: false,
    pause: false,
    seek: false,
    subtitles: false,
    realtimeSync: false
  };

  public async load(container: HTMLDivElement): Promise<void> {
    const store = useRoomStore.getState();
    const sourceUrl = store.playbackState.sourceUrl;

    const iframe = document.createElement('iframe');
    iframe.src = sourceUrl;
    iframe.className = 'w-full h-full border-0 bg-black';
    iframe.allowFullscreen = true;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    
    container.appendChild(iframe);
    this.iframeEl = iframe;
  }

  public play(): void {}
  public pause(): void {}
  public seek(_time: number): void {}
  public getCurrentTime(): number { return 0; }
  public getDuration(): number { return 0; }
  
  public destroy(): void {
    if (this.iframeEl) {
      this.iframeEl.remove();
      this.iframeEl = null;
    }
  }
}
