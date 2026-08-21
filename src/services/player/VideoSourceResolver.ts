import { VideoSourceType } from '../realtime/types';

export interface ResolvedSource {
  type: VideoSourceType;
  resolvedUrl: string;
  videoId: string;
  fileName: string;
}

export class VideoSourceResolver {
  public static getAparatVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('aparat.com')) {
        const match = parsed.pathname.match(/\/(?:v|video\/video\/embed\/videohash)\/([a-zA-Z0-9]+)/);
        if (match) return match[1];
      }
    } catch (_) {}
    return null;
  }

  public static getYouTubeVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
        // watch?v=ID
        if (parsed.searchParams.has('v')) {
          return parsed.searchParams.get('v');
        }
        // youtu.be/ID
        if (parsed.hostname.includes('youtu.be')) {
          return parsed.pathname.substring(1).split('?')[0];
        }
        // embed/ID, live/ID, or v/ID
        const embedMatch = parsed.pathname.match(/\/(?:embed|live|v|shorts)\/([a-zA-Z0-9_-]+)/);
        if (embedMatch) return embedMatch[1];
      }
    } catch (_) {}
    return null;
  }

  public static getVimeoVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('vimeo.com') || parsed.hostname.includes('player.vimeo.com')) {
        const match = parsed.pathname.match(/\/(?:video\/)?([0-9]+)/);
        if (match) return match[1];
      }
    } catch (_) {}
    return null;
  }

  public static getDailymotionVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('dailymotion.com') || parsed.hostname.includes('dai.ly')) {
        if (parsed.hostname.includes('dai.ly')) {
          return parsed.pathname.substring(1).split('?')[0];
        }
        const match = parsed.pathname.match(/\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/);
        if (match) return match[1];
      }
    } catch (_) {}
    return null;
  }

  public static getTwitchVideoOrClip(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('twitch.tv')) {
        return parsed.pathname.replace(/^\//, '');
      }
    } catch (_) {}
    return null;
  }

  public static async resolveSource(url: string): Promise<ResolvedSource> {
    let trimmed = url.trim();
    if (!trimmed) {
      throw new Error('Please enter a video URL.');
    }

    // Auto-decode any HTML entity slashes/ampersands if pasted from encoded sources
    trimmed = trimmed
      .replace(/&#x2F;/gi, '/')
      .replace(/&#47;/g, '/')
      .replace(/&amp;/gi, '&')
      .replace(/&#38;/g, '&');

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch (_) {
      throw new Error('Invalid URL format. Please enter a valid HTTP/HTTPS link.');
    }

    const cleanPath = parsedUrl.pathname.toLowerCase();
    const cleanUrl = trimmed.split('?')[0].split('#')[0];
    const fallbackFileName = cleanUrl.split('/').pop() || 'Video Stream';

    // 1. Direct platform matchers
    const ytId = this.getYouTubeVideoId(trimmed);
    if (ytId) {
      return {
        type: 'youtube',
        resolvedUrl: trimmed,
        videoId: ytId,
        fileName: `YouTube Video (${ytId})`
      };
    }

    const aparatId = this.getAparatVideoId(trimmed);
    if (aparatId) {
      return {
        type: 'aparat',
        resolvedUrl: trimmed,
        videoId: aparatId,
        fileName: `Aparat Video (${aparatId})`
      };
    }

    const vimeoId = this.getVimeoVideoId(trimmed);
    if (vimeoId) {
      return {
        type: 'vimeo',
        resolvedUrl: trimmed,
        videoId: vimeoId,
        fileName: `Vimeo Video (${vimeoId})`
      };
    }

    const dmId = this.getDailymotionVideoId(trimmed);
    if (dmId) {
      return {
        type: 'dailymotion',
        resolvedUrl: trimmed,
        videoId: dmId,
        fileName: `Dailymotion Video (${dmId})`
      };
    }

    // 2. Direct HLS (.m3u8) matcher
    if (cleanPath.endsWith('.m3u8') || trimmed.includes('.m3u8')) {
      return {
        type: 'hls',
        resolvedUrl: trimmed,
        videoId: trimmed,
        fileName: fallbackFileName || 'HLS Live/VOD Stream'
      };
    }

    // 3. Direct media file matcher (.mp4, .webm, .mkv, .mka, .mov, .avi, .ts, .m4v, .ogg, .ogv, .mpd, .flv, .mp3, .m4a, .aac, .wav)
    const directVideoRegex = /\.(mp4|webm|mkv|mka|mov|avi|ts|m4v|ogg|ogv|mpd|flv|mp3|m4a|aac|wav|opus)($|\?|#)/i;
    if (directVideoRegex.test(trimmed) || directVideoRegex.test(cleanPath)) {
      return {
        type: 'url',
        resolvedUrl: trimmed,
        videoId: trimmed,
        fileName: decodeURIComponent(fallbackFileName)
      };
    }

    // 4. Check for known embed URLs or video streaming patterns
    if (cleanPath.includes('/embed/') || cleanPath.includes('/player/') || cleanPath.includes('/watch/')) {
      return {
        type: 'embed',
        resolvedUrl: trimmed,
        videoId: trimmed,
        fileName: 'Embedded Video Player'
      };
    }

    // 5. Webpage scraping fallback using CORS proxies (non-blocking if it fails)
    try {
      const proxies = [
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`
      ];

      let htmlContent = '';
      for (const getProxyUrl of proxies) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(getProxyUrl(trimmed), { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            htmlContent = await res.text();
            break;
          }
        } catch (_) {}
      }

      if (htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // Look for <source> or <video> tags
        const sources = Array.from(doc.querySelectorAll('source, video'));
        for (const el of sources) {
          const src = el.getAttribute('src');
          if (src) {
            const absoluteSrc = new URL(src, trimmed).href;
            if (absoluteSrc.includes('.m3u8')) {
              return {
                type: 'hls',
                resolvedUrl: absoluteSrc,
                videoId: absoluteSrc,
                fileName: decodeURIComponent(absoluteSrc.split('/').pop()?.split('?')[0] || 'HLS Manifest')
              };
            }
            if (/\.(mp4|webm|mkv|mov|avi|ts|ogg|ogv)($|\?)/i.test(absoluteSrc)) {
              return {
                type: 'url',
                resolvedUrl: absoluteSrc,
                videoId: absoluteSrc,
                fileName: decodeURIComponent(absoluteSrc.split('/').pop()?.split('?')[0] || 'Direct Video Stream')
              };
            }
          }
        }

        // Look for nested iframes
        const iframes = Array.from(doc.querySelectorAll('iframe'));
        for (const iframe of iframes) {
          const src = iframe.getAttribute('src');
          if (src) {
            const absoluteSrc = new URL(src, trimmed).href;
            const subYt = this.getYouTubeVideoId(absoluteSrc);
            if (subYt) return { type: 'youtube', resolvedUrl: absoluteSrc, videoId: subYt, fileName: `YouTube (Embed)` };

            const subAp = this.getAparatVideoId(absoluteSrc);
            if (subAp) return { type: 'aparat', resolvedUrl: absoluteSrc, videoId: subAp, fileName: `Aparat (Embed)` };

            const subVm = this.getVimeoVideoId(absoluteSrc);
            if (subVm) return { type: 'vimeo', resolvedUrl: absoluteSrc, videoId: subVm, fileName: `Vimeo (Embed)` };

            const subDm = this.getDailymotionVideoId(absoluteSrc);
            if (subDm) return { type: 'dailymotion', resolvedUrl: absoluteSrc, videoId: subDm, fileName: `Dailymotion (Embed)` };
          }
        }

        // Regex scan raw script text for M3U8 or MP4 URLs
        const scripts = Array.from(doc.querySelectorAll('script'));
        for (const script of scripts) {
          const code = script.textContent || '';
          const hlsMatch = code.match(/(https?:\/\/[^\s"'`<>]+?\.m3u8[^\s"'`<>]*)/i);
          if (hlsMatch) {
            return {
              type: 'hls',
              resolvedUrl: hlsMatch[1],
              videoId: hlsMatch[1],
              fileName: 'Resolved HLS Stream'
            };
          }
          const mp4Match = code.match(/(https?:\/\/[^\s"'`<>]+?\.(?:mp4|webm|mkv|mov)[^\s"'`<>]*)/i);
          if (mp4Match) {
            return {
              type: 'url',
              resolvedUrl: mp4Match[1],
              videoId: mp4Match[1],
              fileName: 'Resolved Video Stream'
            };
          }
        }
      }
    } catch (_) {}

    // 6. Universal Fallback: Treat as direct video stream URL
    return {
      type: 'url',
      resolvedUrl: trimmed,
      videoId: trimmed,
      fileName: decodeURIComponent(fallbackFileName)
    };
  }
}
