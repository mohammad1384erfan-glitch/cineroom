import { VideoPlayerAdapter, PlayerCapabilities } from './VideoPlayerAdapter';
import { useRoomStore } from '../../../store/useRoomStore';

export class AparatAdapter implements VideoPlayerAdapter {
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
    const videoId = store.playbackState.videoId;

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.aparat.com/video/video/embed/videohash/${videoId}/vt/frame`;
    iframe.className = 'w-full h-full border-0 bg-black';
    iframe.allowFullscreen = true;
    iframe.allow = 'autoplay; encrypted-media';
    
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
