import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Film, Copy, Check, LogOut, Play, Pause, 
  Terminal, Users, FolderOpen, Send, 
  Crown, Wifi, Mic, MicOff, Plus, Trash2, ArrowUp, ArrowDown, Minimize2, Maximize2,
  Lock, Unlock, MessageSquare, PlaySquare, Shield, RefreshCw, Smile
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useRoomStore } from '@/store/useRoomStore';
import { logger, QueueItem, Participant, UserPermissions, ChatMessage, webrtcService } from '@/services';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '🔥'];
const COUPLE_EMOJIS = ['❤️', '🫂', '😘', '😂'];

function getThemeClasses(theme: string) {
  switch (theme) {
    case 'cinema':
      return {
        bg: 'bg-zinc-950 text-zinc-100 min-h-screen transition-colors duration-500',
        card: 'bg-zinc-900/60 border-red-500/20 text-zinc-100 shadow-lg transition-colors duration-500',
        accent: 'text-red-500 hover:text-red-400',
        button: 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/40',
        border: 'border-red-950/40',
        glow: 'shadow-red-500/10 shadow-md',
        sidebar: 'bg-zinc-950/80 border-r border-red-950/30'
      };
    case 'night':
      return {
        bg: 'bg-slate-950 text-slate-100 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/30 via-slate-950 to-slate-950 min-h-screen transition-colors duration-500',
        card: 'bg-slate-900/40 border-cyan-500/10 text-slate-100 shadow-cyan-950/30 shadow-md transition-colors duration-500',
        accent: 'text-cyan-400 hover:text-cyan-300',
        button: 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500/30 shadow-glow-sm',
        border: 'border-cyan-950/40',
        glow: 'shadow-cyan-400/10 shadow-lg',
        sidebar: 'bg-slate-950/90 border-r border-cyan-950/30'
      };
    case 'couple':
      return {
        bg: 'bg-zinc-950 text-rose-50 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-rose-900/20 via-zinc-950 to-zinc-950 min-h-screen transition-colors duration-500',
        card: 'bg-rose-950/10 border-rose-500/20 text-rose-100 shadow-rose-950/30 shadow-md transition-colors duration-500',
        accent: 'text-rose-400 hover:text-rose-300',
        button: 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/30 shadow-glow-rose',
        border: 'border-rose-950/40',
        glow: 'shadow-rose-400/15 shadow-xl',
        sidebar: 'bg-zinc-950/90 border-r border-rose-950/30'
      };
    case 'gaming':
      return {
        bg: 'bg-zinc-950 text-zinc-100 min-h-screen transition-colors duration-500',
        card: 'bg-purple-950/5 border-purple-500/20 text-zinc-100 shadow-glow-purple transition-colors duration-500',
        accent: 'text-fuchsia-400 hover:text-fuchsia-300',
        button: 'bg-purple-600 hover:bg-purple-500 text-white border border-fuchsia-500/30 shadow-glow-purple',
        border: 'border-purple-950/30',
        glow: 'shadow-fuchsia-500/15 shadow-xl',
        sidebar: 'bg-black/85 border-r border-purple-950/30'
      };
    case 'horror':
      return {
        bg: 'bg-black text-red-50 min-h-screen transition-colors duration-500',
        card: 'bg-zinc-950/80 border-red-950 text-red-100 shadow-red-950/30 shadow-md transition-colors duration-500',
        accent: 'text-red-600 hover:text-red-500 font-serif font-bold uppercase tracking-wider',
        button: 'bg-red-950 hover:bg-red-900 text-red-200 border border-red-800/40',
        border: 'border-red-950/60',
        glow: 'shadow-red-900/20 shadow-lg',
        sidebar: 'bg-black border-r border-red-950/40'
      };
    case 'casual':
    default:
      return {
        bg: 'bg-brand-bg-page text-brand-text-main min-h-screen transition-colors duration-500',
        card: 'bg-brand-bg-card border-glass text-brand-text-main shadow-sm transition-colors duration-500',
        accent: 'text-brand-primary hover:text-brand-primary/80',
        button: 'bg-brand-primary hover:bg-brand-primary-hover text-white',
        border: 'border-glass',
        glow: 'shadow-none',
        sidebar: 'bg-brand-bg-sidebar border-r border-glass'
      };
  }
}
const STICKERS = [
  { id: 'popcorn', emoji: '🍿', label: 'Popcorn' },
  { id: 'soda', emoji: '🥤', label: 'Soda' },
  { id: 'clapper', emoji: '🎬', label: 'Clapper' },
  { id: 'ticket', emoji: '🎟️', label: 'Ticket' },
  { id: 'party', emoji: '🎉', label: 'Celebration' },
  { id: 'heart_eyes', emoji: '😍', label: 'Love' },
  { id: 'laughing', emoji: '😂', label: 'LOL' },
  { id: 'screaming', emoji: '😱', label: 'Shocked' },
  { id: 'fire', emoji: '🔥', label: 'Hyped' },
  { id: 'thumbs_up', emoji: '👍', label: 'Like' },
];

const validateVideoUrl = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      new URL(url);
    } catch (_) {
      return reject(new Error('Invalid URL format. Please enter a valid web URL.'));
    }

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = url;
    
    const timer = setTimeout(() => {
      tempVideo.src = '';
      tempVideo.load();
      reject(new Error('Connection timed out. The video server did not respond.'));
    }, 6000);

    tempVideo.onloadedmetadata = () => {
      clearTimeout(timer);
      tempVideo.src = '';
      tempVideo.load();
      resolve();
    };

    tempVideo.onerror = () => {
      clearTimeout(timer);
      tempVideo.src = '';
      tempVideo.load();
      const err = tempVideo.error;
      if (err) {
        if (err.code === 1) reject(new Error('Video loading aborted.'));
        else if (err.code === 2) reject(new Error('Network error: Unable to download video.'));
        else if (err.code === 3) reject(new Error('Decode error: The video codec or container is not supported by your browser.'));
        else if (err.code === 4) reject(new Error('Format error: The video is not playable. This is usually due to CORS restrictions or an invalid MIME type.'));
        else reject(new Error('Failed to load video source. Please verify the URL and CORS permissions.'));
      } else {
        reject(new Error('Failed to load video. This URL may require authentication or have CORS block.'));
      }
    };
  });
};

export const Room: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const store = useRoomStore();
  const activeTheme = getThemeClasses(store.room?.theme || 'casual');

  const getMostActiveUser = () => {
    const activity = store.sessionStats.activityCount;
    let maxId = '';
    let maxCount = 0;
    Object.entries(activity).forEach(([id, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxId = id;
      }
    });
    const found = store.participants.find(p => p.id === maxId);
    return found ? found.name : 'No active peers';
  };
  const mostActiveUser = getMostActiveUser();

  // Component UI States
  const [copied, setCopied] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'members' | 'queue'>('chat');
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUserPermissions, setSelectedUserPermissions] = useState<Participant | null>(null);
  const [showHostControlsModal, setShowHostControlsModal] = useState(false);
  
  // Playback Sync States
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [driftDuration, setDriftDuration] = useState(0);
  const [isMovieFinished, setIsMovieFinished] = useState(false);

  useEffect(() => {
    setIsMovieFinished(false);
  }, [store.playbackState.sourceUrl]);

  // Mobile Sheet States
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isMobileMembersOpen, setIsMobileMembersOpen] = useState(false);
  const [isMobileQueueOpen, setIsMobileQueueOpen] = useState(false);

  // Sticker Picker and URL Loading States
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [isMobileStickerPickerOpen, setIsMobileStickerPickerOpen] = useState(false);
  const [isUrlLoading, setIsUrlLoading] = useState(false);

  const stickerPickerRef = useRef<HTMLDivElement>(null);
  const mobileStickerPickerRef = useRef<HTMLDivElement>(null);

  // Sticker picker click-outside handlers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (isStickerPickerOpen && stickerPickerRef.current && !stickerPickerRef.current.contains(target)) {
        setIsStickerPickerOpen(false);
      }
      if (isMobileStickerPickerOpen && mobileStickerPickerRef.current && !mobileStickerPickerRef.current.contains(target)) {
        setIsMobileStickerPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isStickerPickerOpen, isMobileStickerPickerOpen]);

  const handleSendSticker = (emoji: string) => {
    store.sendChatMessage(`[STICKER]:${emoji}`).then(() => {
      setIsStickerPickerOpen(false);
    }).catch(err => {
      alert(err.message);
    });
  };

  const handleSendMobileSticker = (emoji: string) => {
    store.sendChatMessage(`[STICKER]:${emoji}`).then(() => {
      setIsMobileStickerPickerOpen(false);
    }).catch(err => {
      alert(err.message);
    });
  };

  // References
  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  
  // Lock flag prevents infinite loop on programmatic plays/pauses/seeks
  const isRespondingToSync = useRef(false);

  // Verification checks & Room state guards
  useEffect(() => {
    if (!store.isConnecting && (!store.room || store.room.id !== id)) {
      logger.error('Session validation failed. Ejecting user to join portal.');
      navigate(`/join/${id || ''}`);
    }
  }, [store.room, store.isConnecting, id, navigate]);

  // Keyboard Shortcuts (A11y & Convenience)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts if user is typing in inputs
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        const self = store.participants.find(p => p.id === store.participantId);
        const isHost = store.room?.hostId === store.participantId;
        if (isHost || self?.permissions.canPlayPause) {
          const currentPlaying = store.playbackState.isPlaying;
          store.updatePlayback({
            isPlaying: !currentPlaying,
            currentTime: videoElementRef.current?.currentTime || store.playbackState.currentTime
          });
          logger.info(`Shortcut: Toggled playback state via [Space]`);
        }
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        store.toggleMute();
        logger.info(`Shortcut: Toggled microphone mute via [M]`);
      }

      if (e.code === 'KeyC') {
        e.preventDefault();
        setIsCinemaMode(prev => !prev);
        logger.info(`Shortcut: Toggled Cinema Mode via [C]`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [store.room, store.participantId, store.participants, store.playbackState]);

  // Handle programmatic playhead sync updates arriving from store events
  useEffect(() => {
    const video = videoElementRef.current;
    if (!video) return;

    // Programmatic play/pause sync
    isRespondingToSync.current = true;
    if (store.playbackState.playing) {
      if (video.paused) {
        video.play().catch((err) => {
          logger.error('Playback: Programmatic play blocked by autoplay guard.', err);
        });
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }

    // Programmatic seek snaps (medium drift corrections or source change restarts)
    const drift = Math.abs(video.currentTime - store.playbackState.currentTime);
    if (drift > 2.2) {
      isRespondingToSync.current = true;
      video.currentTime = store.playbackState.currentTime;
      setLocalCurrentTime(store.playbackState.currentTime);
      logger.realtime(`Playback: programmatic snap applied. Drift of ${drift.toFixed(1)}s corrected.`);
    }
  }, [store.playbackState.playing, store.playbackState.currentTime, store.playbackState.videoId]);

  // Periodic Playback Drift Detection & Correction Loop (every 1.5 seconds)
  useEffect(() => {
    const video = videoElementRef.current;
    if (!video || !store.playbackState.fileName) return;

    const checkDrift = () => {
      // Calculate target room playhead position based on canonical offset
      let targetTime = store.playbackState.currentTime;
      if (store.playbackState.playing) {
        const elapsed = (Date.now() - store.playbackState.lastUpdateTimestamp) / 1000;
        targetTime += elapsed;
      }

      // Hard cap target to video duration
      if (video.duration) {
        targetTime = Math.min(targetTime, video.duration);
      }

      const drift = video.currentTime - targetTime;
      const absDrift = Math.abs(drift);

      if (absDrift < 0.35) {
        // Safe lock zone: restore standard playback speed
        if (video.playbackRate !== 1.0) {
          video.playbackRate = 1.0;
        }
        setDriftDuration(0);
      } else if (absDrift >= 0.35 && absDrift < 2.5) {
        // Small drift: smoothly adjust speed to catch up or wait
        if (drift < 0) {
          video.playbackRate = 1.06; // behind: speed up
        } else {
          video.playbackRate = 0.94; // ahead: slow down
        }
        setDriftDuration(0);
      } else if (absDrift >= 2.5 && absDrift < 6.0) {
        // Medium drift: perform programmatic hard snap
        isRespondingToSync.current = true;
        video.currentTime = targetTime;
        setLocalCurrentTime(targetTime);
        video.playbackRate = 1.0;
        setDriftDuration(0);
        logger.realtime(`Drift: Snapping playhead. Out-of-sync gap of ${Math.abs(drift).toFixed(1)}s snapped.`);
      } else {
        // Large drift (>= 6 seconds)
        if (drift < 0) {
          // User is behind (e.g. paused or buffering): trigger warning banner
          setDriftDuration(Math.round(Math.abs(drift)));
        } else {
          // Guest is ahead of target: snap back immediately
          isRespondingToSync.current = true;
          video.currentTime = targetTime;
          setLocalCurrentTime(targetTime);
          video.playbackRate = 1.0;
          setDriftDuration(0);
        }
      }
    };

    const interval = setInterval(checkDrift, 1500);
    return () => {
      clearInterval(interval);
      if (video) video.playbackRate = 1.0;
    };
  }, [store.playbackState]);

  // Host-Only Periodic Playhead Sync Broadcasts (every 5 seconds)
  useEffect(() => {
    const video = videoElementRef.current;
    if (!video || store.room?.hostId !== store.participantId) return;

    const interval = setInterval(() => {
      if (video && !video.paused) {
        store.updatePlayback({
          currentTime: video.currentTime
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [store.room, store.participantId]);

  // Scroll watchers
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.diagnosticsLogs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.chatMessages]);

  if (!store.room) return null;

  const isHost = store.room.hostId === store.participantId;
  const selfParticipant = store.participants.find(p => p.id === store.participantId);
  const inviteUrl = `${window.location.origin}/join/${store.room.code}`;

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    logger.info('Copy: Private invite code link copied.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (window.confirm('Leave watch party? All temporary room data will be deleted if you are the last member.')) {
      await store.leaveRoom();
      navigate('/');
    }
  };
  const handleEndRoom = async () => {
    if (window.confirm("End this Watch Party?\nWarning: All temporary room data will be deleted.")) {
      try {
        await store.endRoom();
        navigate('/');
      } catch (err: any) {
        alert(err.message);
      }
    }
  };  const handleLoadUrlVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directUrl.trim()) return;

    const title = videoTitle.trim() || directUrl.split('/').pop() || 'Direct Video Stream';
    setIsUrlLoading(true);

    try {
      await validateVideoUrl(directUrl.trim());
      await store.updatePlayback({
        sourceType: 'url',
        sourceUrl: directUrl.trim(),
        fileName: title,
        fileSize: 0,
        isPlaying: false,
        playing: false,
        currentTime: 0,
        videoId: directUrl.trim()
      });
      setDirectUrl('');
      setVideoTitle('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUrlLoading(false);
    }
  };

  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;

    if (ext === 'mkv' || mimeType.includes('matroska')) {
      alert(`Warning: .MKV is a container format that is generally not natively supported by web browsers. Only MKV files containing browser-supported codecs (like H.264 video and AAC/MP3 audio) can be played, but many will fail to render video or audio. For optimal compatibility, please use web-native MP4 (H.264/AAC).`);
    } else if (mimeType && !document.createElement('video').canPlayType(mimeType)) {
      alert(`Warning: The format of "${file.name}" (${mimeType}) may not be natively supported by your browser. If playback fails, please use a standard MP4 file.`);
    }

    store.startStreamingFile(file);
    logger.info(`Media: Local progressive P2P stream started: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
  };

  const handleTogglePlay = () => {
    const video = videoElementRef.current;
    if (!video) return;

    if (!isHost && !selfParticipant?.permissions.canPlayPause) {
      alert('You do not have permission to play/pause.');
      return;
    }

    const nextPlaying = !store.playbackState.playing;
    store.updatePlayback({
      playing: nextPlaying,
      isPlaying: nextPlaying,
      currentTime: video.currentTime
    });
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setLocalCurrentTime(time);
    const video = videoElementRef.current;
    if (video) {
      isRespondingToSync.current = true;
      video.currentTime = time;
    }
  };

  const handleSeekEnd = () => {
    const video = videoElementRef.current;
    if (!video) return;

    if (!isHost && !selfParticipant?.permissions.canSeek) {
      isRespondingToSync.current = true;
      video.currentTime = store.playbackState.currentTime;
      setLocalCurrentTime(store.playbackState.currentTime);
      alert('You do not have permission to seek.');
      return;
    }

    store.updatePlayback({
      currentTime: video.currentTime
    });
  };

  const handleTimeUpdate = () => {
    const video = videoElementRef.current;
    if (video) {
      setLocalCurrentTime(video.currentTime);
    }
  };

  const handleDurationChange = () => {
    const video = videoElementRef.current;
    if (video) {
      setVideoDuration(video.duration);
    }
  };

  const handleLocalPlay = () => {
    if (isRespondingToSync.current) {
      isRespondingToSync.current = false;
      return;
    }

    const video = videoElementRef.current;
    if (!video) return;

    // Safety Pause Rule Block
    const hasReconnecting = store.participants.some(p => p.connectionStatus === 'reconnecting');
    if (hasReconnecting) {
      isRespondingToSync.current = true;
      video.pause();
      logger.error('Playback blocked: A participant is reconnecting.');
      return;
    }

    if (!isHost && !selfParticipant?.permissions.canPlayPause) {
      isRespondingToSync.current = true;
      video.pause();
      logger.error('Playback: Play event blocked due to missing permissions.');
      return;
    }

    store.updatePlayback({
      playing: true,
      isPlaying: true,
      currentTime: video.currentTime
    });
  };

  const handleLocalPause = () => {
    if (isRespondingToSync.current) {
      isRespondingToSync.current = false;
      return;
    }

    const video = videoElementRef.current;
    if (!video) return;

    // Safety Pause Rule Block
    const hasReconnecting = store.participants.some(p => p.connectionStatus === 'reconnecting');
    if (hasReconnecting) {
      isRespondingToSync.current = true;
      video.pause();
      return;
    }

    if (!isHost && !selfParticipant?.permissions.canPlayPause) {
      isRespondingToSync.current = true;
      video.play().catch(() => {});
      logger.error('Playback: Pause event blocked due to missing permissions.');
      return;
    }

    store.updatePlayback({
      playing: false,
      isPlaying: false,
      currentTime: video.currentTime
    });
  };

  const handleLocalSeeked = () => {
    if (isRespondingToSync.current) {
      isRespondingToSync.current = false;
      return;
    }

    const video = videoElementRef.current;
    if (!video) return;

    // Safety Pause Rule Block
    const hasReconnecting = store.participants.some(p => p.connectionStatus === 'reconnecting');
    if (hasReconnecting) {
      isRespondingToSync.current = true;
      video.currentTime = store.playbackState.currentTime;
      setLocalCurrentTime(store.playbackState.currentTime);
      return;
    }

    if (!isHost && !selfParticipant?.permissions.canSeek) {
      isRespondingToSync.current = true;
      video.currentTime = store.playbackState.currentTime;
      setLocalCurrentTime(store.playbackState.currentTime);
      logger.error('Playback: Seek event blocked due to missing permissions.');
      return;
    }

    store.updatePlayback({
      currentTime: video.currentTime
    });
  };

  const handleForceSync = () => {
    const video = videoElementRef.current;
    if (video) {
      store.updatePlayback({
        currentTime: video.currentTime
      });
      logger.info('Host triggered playback sync command on all nodes.');
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    const video = videoElementRef.current;
    if (video) {
      video.volume = vol;
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    store.sendChatMessage(chatInput).then(() => {
      setChatInput('');
    }).catch(err => {
      alert(err.message);
    });
  };

  // Queue helper moves item to active player and removes it from queue list
  const handlePlayQueueItem = async (item: QueueItem) => {
    try {
      await store.updatePlayback({
        sourceType: item.sourceType,
        sourceUrl: item.url,
        fileName: item.title,
        fileSize: 0,
        isPlaying: true,
        playing: true,
        currentTime: 0,
        videoId: item.url
      });
      await store.removeFromQueue(item.id);
      logger.info(`Queue: Loaded "${item.title}" into active player.`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMoveQueueItem = (idx: number, direction: 'up' | 'down') => {
    const newQueue = [...store.queue];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newQueue.length) return;

    // Swap
    const temp = newQueue[idx];
    newQueue[idx] = newQueue[targetIdx];
    newQueue[targetIdx] = temp;

    store.reorderQueue(newQueue);
  };

  // Opens permissions panel
  const handleOpenPermissions = (user: Participant) => {
    setSelectedUserPermissions(user);
    setShowPermissionsModal(true);
  };

  const handleTogglePermissionField = (field: keyof UserPermissions) => {
    if (!selectedUserPermissions) return;
    
    const updatedPermissions = {
      ...selectedUserPermissions.permissions,
      [field]: !selectedUserPermissions.permissions[field]
    };

    store.updateParticipantPermissions(selectedUserPermissions.id, updatedPermissions).then(() => {
      setSelectedUserPermissions(prev => prev ? { ...prev, permissions: updatedPermissions } : null);
    });
  };

  // Preset sample movies to quickly test the player
  const loadSampleVideo = async (url: string, title: string) => {
    setIsUrlLoading(true);
    try {
      await validateVideoUrl(url);
      await store.updatePlayback({
        sourceType: 'url',
        sourceUrl: url,
        fileName: title,
        fileSize: 0,
        isPlaying: false,
        playing: false,
        currentTime: 0,
        videoId: url
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUrlLoading(false);
    }
  };

  return (
    <div className={`${activeTheme.bg} flex flex-col pb-4 select-none`}>
      
      {/* HEADER NAVBAR */}
      {!isCinemaMode && (
        <header className={`px-6 py-4 ${activeTheme.card} backdrop-blur-md border-b ${activeTheme.border} flex flex-wrap items-center justify-between gap-4 z-20`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center shadow-glow">
              <Film size={16} className="text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-wide leading-none text-glow text-white">
                {store.room.name}
              </h1>
              <span className="text-[10px] text-brand-text-muted mt-1 inline-block">
                CineRoom Code: <strong className="text-brand-primary select-text">{store.room.code}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Invite URL */}
            <div className="hidden sm:flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg border border-glass">
              <span className="text-xs text-brand-text-muted font-mono font-semibold select-text">
                {inviteUrl}
              </span>
              <button 
                onClick={handleCopyInvite}
                className="text-brand-text-muted hover:text-white transition-colors duration-200"
                title="Copy Invite Link"
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Locks & Theme Selector */}
            {isHost && (
              <div className="flex items-center gap-2 select-none">
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={() => setShowHostControlsModal(true)}
                  className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider gap-1.5 flex items-center bg-brand-primary hover:bg-brand-primary/80"
                  title="Open Host Moderation Controls"
                >
                  <Crown size={12} />
                  Host Controls
                </Button>

                <select
                  value={store.room?.theme || 'casual'}
                  onChange={(e) => store.updateRoomSettings({ theme: e.target.value })}
                  className="text-[10px] bg-black/55 text-zinc-300 hover:text-white font-extrabold uppercase tracking-wide border border-glass rounded px-2.5 py-1 focus:outline-none cursor-pointer"
                >
                  <option value="casual" className="bg-zinc-950">Casual</option>
                  <option value="cinema" className="bg-zinc-950">Cinema</option>
                  <option value="night" className="bg-zinc-950">Night</option>
                  <option value="couple" className="bg-zinc-950">Couple</option>
                  <option value="gaming" className="bg-zinc-950">Gaming</option>
                  <option value="horror" className="bg-zinc-950">Horror</option>
                </select>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => store.updateRoomSettings({ isLocked: !store.room?.isLocked })}
                  className="p-1.5 rounded-full"
                  title={store.room.isLocked ? 'Unlock Room' : 'Lock Room'}
                >
                  {store.room.isLocked ? <Lock size={14} className="text-brand-primary" /> : <Unlock size={14} />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => store.updateRoomSettings({ isQueueLocked: !store.room?.isQueueLocked })}
                  className="p-1.5 rounded-full"
                  title={store.room.isQueueLocked ? 'Unlock Watch Queue' : 'Lock Watch Queue'}
                >
                  {store.room.isQueueLocked ? <Lock size={14} className="text-brand-accent" /> : <Unlock size={14} />}
                </Button>
              </div>
            )}

            {/* Sync tag */}
            <Badge variant="success" glow className="flex gap-1 items-center font-bold text-[9px]">
              <Wifi size={11} />
              Synced
            </Badge>

            {/* Capacity */}
            <Badge variant="secondary" className="flex gap-1 items-center font-bold text-[9px]">
              <Users size={11} />
              {store.participants.length} / {store.room.capacity}
            </Badge>

            {/* Teardown / Exit options */}
            {isHost ? (
              <div className="flex gap-2 select-none">
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={() => {
                    if (window.confirm('Finish the watch party? This will stop playback and display statistics summary for all participants.')) {
                      store.finishWatchParty();
                    }
                  }} 
                  className="flex gap-1.5 items-center font-bold text-xs uppercase shadow-glow"
                >
                  Finish Party
                </Button>
                <Button variant="danger" size="sm" onClick={handleLeave} className="flex gap-1.5 items-center font-bold text-xs uppercase">
                  <LogOut size={13} />
                  Leave
                </Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={handleLeave} className="flex gap-1.5 items-center font-bold text-xs uppercase">
                <LogOut size={13} />
                Leave
              </Button>
            )}
          </div>
        </header>
      )}

      {/* CORE WORKSPACE GRID */}
      <div className={`flex-1 grid grid-cols-1 ${isCinemaMode ? 'lg:grid-cols-1' : 'lg:grid-cols-4'} gap-6 p-4 md:p-6 transition-all duration-500`}>
        
        {/* VIDEO COLUMN */}
        <main className={`${isCinemaMode ? 'lg:col-span-1' : 'lg:col-span-3'} flex flex-col gap-5 justify-center`}>
          
          {/* THEATRE SCREEN */}
          <Card 
            className={`
              relative aspect-video rounded-2xl overflow-hidden flex flex-col items-center justify-center ${activeTheme.card} ${activeTheme.glow}
              ${isCinemaMode ? 'shadow-glow-strong' : ''}
            `}
          >
            {/* FLOATING REACTION EMOJIS LAYER */}
            <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
              {store.floatingReactions.map((react) => {
                const isCouple = store.participants.length === 2;
                let animClass = 'animate-emoji-float';
                if (isCouple) {
                  if (react.emoji === '❤️') animClass = 'animate-emoji-heartbeat';
                  else if (react.emoji === '🫂') animClass = 'animate-emoji-hug';
                  else if (react.emoji === '😘') animClass = 'animate-emoji-kiss';
                  else if (react.emoji === '😂') animClass = 'animate-emoji-shake';
                }
                return (
                  <div
                    key={react.id}
                    style={{ left: `${react.xOffset}%` }}
                    className={`absolute bottom-4 text-4xl select-none text-glow ${animClass}`}
                  >
                    {react.emoji}
                  </div>
                );
              })}
            </div>

            {/* LARGE DRIFT SYNC ME BANNER */}
            {driftDuration > 5 && (
              <div className="absolute top-16 left-[50%] -translate-x-[50%] z-30 bg-black/90 border border-brand-primary px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-glow-strong animate-fade-in">
                <span className="text-xs text-white font-semibold">
                  You are {driftDuration} seconds behind the room.
                </span>
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={() => {
                    const video = videoElementRef.current;
                    if (video) {
                      let targetTime = store.playbackState.currentTime;
                      if (store.playbackState.playing) {
                        const elapsed = (Date.now() - store.playbackState.lastUpdateTimestamp) / 1000;
                        targetTime += elapsed;
                        if (video.duration) targetTime = Math.min(targetTime, video.duration);
                      }
                      isRespondingToSync.current = true;
                      video.currentTime = targetTime;
                      setLocalCurrentTime(targetTime);
                      setDriftDuration(0);
                      logger.info('Synced playhead to room target.');
                    }
                  }}
                  className="text-[10px] py-1"
                >
                  Sync with Room
                </Button>
              </div>
            )}

            {/* ROOM SAFETY PAUSE RULE WARNING */}
            {store.participants.some(p => p.connectionStatus === 'reconnecting') && (
              <div className="absolute inset-0 z-40 bg-zinc-950/90 flex flex-col items-center justify-center gap-3.5 select-none animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
                  <RefreshCw size={22} className="animate-spin" />
                </div>
                <span className="text-xs text-yellow-400 font-extrabold uppercase tracking-widest">
                  Room Safety Pause
                </span>
                <p className="text-[10px] text-zinc-400 max-w-[240px] text-center leading-relaxed font-semibold">
                  Playback has been paused. A participant is experiencing network connectivity drops and is reconnecting.
                </p>
              </div>
            )}

            {store.playbackState.fileName ? (
              // Video element exists
              <div className="w-full h-full relative group bg-black">
                {store.playbackState.sourceType === 'url' || store.playbackState.sourceType === 'local' ? (
                  <>
                    <video 
                      ref={videoElementRef}
                      key={store.playbackState.sourceType === 'local' ? store.p2pObjectUrl || '' : store.playbackState.sourceUrl}
                      className="w-full h-full object-contain"
                      controls={false}
                      onPlay={handleLocalPlay}
                      onPause={handleLocalPause}
                      onSeeked={handleLocalSeeked}
                      onTimeUpdate={handleTimeUpdate}
                      onDurationChange={handleDurationChange}
                      onEnded={() => setIsMovieFinished(true)}
                    >
                      <source 
                        src={store.playbackState.sourceType === 'local' ? store.p2pObjectUrl || '' : store.playbackState.sourceUrl} 
                        type="video/mp4" 
                      />
                    </video>

                    {isMovieFinished && (
                      <div className="absolute inset-0 z-40 bg-zinc-950/95 flex flex-col items-center justify-center gap-4 select-none animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary animate-pulse">
                          <Film size={26} />
                        </div>
                        <div className="text-center">
                          <span className="text-xs text-brand-primary font-extrabold uppercase tracking-widest">
                            🎬 Movie Finished
                          </span>
                          {store.queue.length > 0 ? (
                            <div className="mt-3 flex flex-col items-center gap-2.5">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                                Next Up
                              </span>
                              <span className="text-sm font-bold text-white block max-w-xs truncate px-4">
                                {store.queue[0].title}
                              </span>
                              {isHost ? (
                                <Button 
                                  variant="primary" 
                                  size="sm" 
                                  onClick={() => {
                                    const nextItem = store.queue[0];
                                    handlePlayQueueItem(nextItem);
                                    setIsMovieFinished(false);
                                  }}
                                  className="mt-2 text-[10px] uppercase font-bold tracking-widest px-6"
                                >
                                  Start Next Video
                                </Button>
                              ) : (
                                <span className="text-[10px] text-zinc-500 italic block mt-1 animate-pulse">
                                  Waiting for Host to start next video...
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-zinc-500 mt-2">
                              The watch queue is empty. Load another video source to continue.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Buffering warning overlay */}
                    {store.playbackState.sourceType === 'local' && store.isP2PBuffering && !isMovieFinished && (
                      <div className="absolute inset-0 z-25 bg-black/60 flex flex-col items-center justify-center gap-2 select-none animate-fade-in pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-brand-primary">
                          <RefreshCw size={18} className="animate-spin text-brand-primary" />
                        </div>
                        <span className="text-[10px] text-zinc-300 font-extrabold uppercase tracking-wider bg-black/75 px-3 py-1 rounded border border-glass">
                          Buffering...
                        </span>
                      </div>
                    )}

                    {/* Streaming status badge */}
                    {store.playbackState.sourceType === 'local' && (
                      <div className="absolute top-4 left-4 z-20 select-none flex flex-col gap-1.5 pointer-events-none">
                        <div className="flex items-center gap-1.5 bg-black/75 px-2.5 py-1 rounded border border-glass">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                          <span className="text-[9px] text-zinc-300 uppercase font-extrabold tracking-wider">
                            {isHost ? 'Streaming local video' : 'Receiving video...'}
                          </span>
                        </div>
                        {!isHost && store.p2pProgress < 100 && (
                          <div className="bg-black/75 px-2.5 py-1 rounded border border-glass flex flex-col gap-1">
                            <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider block">
                              Buffer Progress: {store.p2pProgress}%
                            </span>
                            <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-brand-primary" style={{ width: `${store.p2pProgress}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  // Waiting for P2P buffer to build initial segments
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-6 text-center select-none gap-4">
                    <div className="w-14 h-14 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary animate-pulse">
                      <RefreshCw size={24} className="animate-spin text-brand-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-400 font-extrabold uppercase tracking-wider block">Buffering P2P Stream...</span>
                      <span className="text-[11px] text-brand-primary font-mono max-w-sm truncate mt-1">
                        {store.playbackState.fileName}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 mt-2">
                      <div className="w-48 h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-glass">
                        <div 
                          className="h-full bg-brand-primary transition-all duration-300"
                          style={{ width: `${store.p2pProgress}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-zinc-500 font-bold font-mono">
                        {store.p2pProgress}% ({(store.p2pReceivedBytes / (1024 * 1024)).toFixed(1)} MB / {(store.playbackState.fileSize / (1024 * 1024)).toFixed(1)} MB)
                      </span>
                    </div>
                  </div>
                )}

                {/* Cinema Mode Mini Hover-Overlay Controller */}
                {isCinemaMode && (
                  <div className="absolute bottom-4 left-[50%] -translate-x-[50%] z-30 bg-black/80 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-glass flex items-center gap-4.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-glow-strong">
                    <Button 
                      variant="ghost" 
                      onClick={handleTogglePlay}
                      disabled={!isHost && !selfParticipant?.permissions.canPlayPause}
                      className="p-1 rounded-full hover:bg-white/10"
                    >
                      {store.playbackState.playing ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white" />}
                    </Button>
                    <div className="w-40 flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 font-bold">Seek</span>
                      <input 
                        type="range" 
                        min={0}
                        max={videoDuration || 100}
                        step={0.1}
                        value={localCurrentTime}
                        onChange={handleSeekChange}
                        onMouseUp={handleSeekEnd}
                        onTouchEnd={handleSeekEnd}
                        disabled={!isHost && !selfParticipant?.permissions.canSeek}
                        className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                      />
                    </div>
                    
                    {/* Reactions tray inline */}
                    <div className="flex gap-2 border-l border-glass pl-4">
                      {REACTION_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => store.sendReaction(emoji)}
                          disabled={!isHost && !selfParticipant?.permissions.canReact}
                          className="hover:scale-125 transition-transform duration-200 select-none text-base"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      onClick={() => setIsCinemaMode(false)}
                      className="p-1.5 rounded-full hover:bg-white/10"
                      title="Exit Cinema Mode"
                    >
                      <Minimize2 size={16} className="text-brand-primary" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              // Empty video template
              <div className="text-center p-8 flex flex-col items-center gap-4.5 max-w-lg bg-zinc-950/20 w-full h-full justify-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-glass flex items-center justify-center text-zinc-500 shadow-inner">
                  <Film size={28} />
                </div>
                <div>
                  <h3 className="font-bold text-white tracking-wide text-sm uppercase">Empty Theatre Screen</h3>
                  <p className="text-xs text-brand-text-muted mt-2 max-w-xs leading-relaxed">
                    {isHost 
                      ? 'No movie source is active. Load a direct MP4 sample or select a local video below.' 
                      : 'Waiting for Host to load and broadcast a media source...'
                    }
                  </p>
                </div>
                {/* Host helper sample files quick trigger */}
                {isHost && (
                  <div className="flex flex-col gap-2 w-full max-w-xs mt-2 border-t border-glass pt-4">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Quick Sample Loaders</span>
                    <div className="flex gap-2 justify-center">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => loadSampleVideo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', 'Sintel (Sci-Fi Animation)')}
                        className="text-[10px] py-1 px-2.5"
                      >
                        Sintel Sci-Fi
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => loadSampleVideo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 'Tears of Steel (VFX Demo)')}
                        className="text-[10px] py-1 px-2.5"
                      >
                        Tears of Steel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* PLAYBACK & REACTION TRAY PANEL */}
          <Card className="p-4 bg-zinc-950/50 backdrop-blur-sm border border-glass">
            <div className="flex flex-col gap-4">
              
              {/* Seeker line */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 font-bold font-mono">{formatTime(localCurrentTime)}</span>
                <input 
                  type="range"
                  min={0}
                  max={videoDuration || 100}
                  step={0.1}
                  value={localCurrentTime}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekEnd}
                  onTouchEnd={handleSeekEnd}
                  disabled={!isHost && !selfParticipant?.permissions.canSeek}
                  className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-primary focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 font-bold font-mono">{formatTime(videoDuration)}</span>
              </div>

              {/* Main Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                
                {/* Media buttons */}
                <div className="flex items-center gap-3">
                  <Button 
                    variant={store.playbackState.playing ? 'outline' : 'primary'}
                    size="md" 
                    onClick={handleTogglePlay}
                    disabled={!isHost && !selfParticipant?.permissions.canPlayPause}
                    className="w-10 h-10 rounded-lg flex items-center justify-center p-0"
                    title={store.playbackState.playing ? 'Pause' : 'Play'}
                  >
                    {store.playbackState.playing ? <Pause size={16} /> : <Play size={16} />}
                  </Button>

                  {/* Volume Control */}
                  <div className="flex items-center gap-2 bg-black/35 px-3 py-2 rounded-lg border border-glass">
                    <span className="text-zinc-500 font-bold text-xs">VOL</span>
                    <input 
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      defaultValue={0.8}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                    />
                  </div>

                  {/* Mic toggle */}
                  <Button
                    variant={store.isLocalMuted ? 'outline' : 'accent'}
                    size="md"
                    onClick={() => store.toggleMute()}
                    className="w-10 h-10 rounded-lg flex items-center justify-center p-0"
                  >
                    {store.isLocalMuted ? <MicOff size={16} /> : <Mic size={16} />}
                  </Button>

                  {/* Cinema Toggle */}
                  <Button 
                    variant="outline" 
                    size="md" 
                    onClick={() => setIsCinemaMode(!isCinemaMode)}
                    className="w-10 h-10 rounded-lg flex items-center justify-center p-0"
                    title="Cinema Mode"
                  >
                    {isCinemaMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </Button>

                  {/* Sync Me trigger (peers align playheads to host) */}
                  {!isHost && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        const video = videoElementRef.current;
                        if (video) {
                          video.currentTime = store.playbackState.currentTime;
                          logger.info('Playback force synchronized manually by user.');
                        }
                      }}
                      className="text-[10px] tracking-wide"
                    >
                      <RefreshCw size={11} className="mr-1.5 animate-spin" />
                      Sync Me
                    </Button>
                  )}
                  {isHost && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleForceSync}
                      className="text-[10px] tracking-wide"
                    >
                      Force Sync
                    </Button>
                  )}
                </div>

                {/* Reaction Bar */}
                <div className="flex items-center gap-2.5 bg-black/40 px-3.5 py-1.5 rounded-xl border border-glass">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">React:</span>
                  <div className="flex gap-2">
                    {(store.participants.length === 2 ? COUPLE_EMOJIS : REACTION_EMOJIS).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => store.sendReaction(emoji)}
                        disabled={!isHost && !selfParticipant?.permissions.canReact}
                        className="hover:scale-125 active:scale-95 transition-all duration-200 text-lg select-none disabled:opacity-30 disabled:pointer-events-none"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Media loader forms */}
                {isHost && (
                  <div className="flex flex-wrap items-center gap-3">
                    <form onSubmit={handleLoadUrlVideo} className="flex items-center gap-2">
                      <input 
                        type="url"
                        placeholder={isUrlLoading ? "Verifying URL..." : "Load Direct HTTP URL (MP4)"}
                        value={directUrl}
                        onChange={(e) => setDirectUrl(e.target.value)}
                        disabled={isUrlLoading}
                        className="px-3 py-1.5 rounded-lg text-xs bg-brand-bg-input border border-glass focus:outline-none w-48 text-brand-text-main disabled:opacity-50"
                      />
                      <input 
                        type="text"
                        placeholder="Video Title (Optional)"
                        value={videoTitle}
                        onChange={(e) => setVideoTitle(e.target.value)}
                        disabled={isUrlLoading}
                        className="px-3 py-1.5 rounded-lg text-xs bg-brand-bg-input border border-glass focus:outline-none w-32 text-brand-text-main disabled:opacity-50"
                      />
                      <Button variant="secondary" size="sm" type="submit" isLoading={isUrlLoading}>
                        Load
                      </Button>
                    </form>

                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-glass bg-brand-bg-card hover:bg-brand-bg-input text-xs cursor-pointer text-brand-text-muted hover:text-white transition-colors duration-200">
                      <FolderOpen size={13} />
                      <span>Host Local File</span>
                      <input 
                        type="file" 
                        accept="video/*" 
                        onChange={handleLocalFileSelect}
                        className="hidden" 
                      />
                    </label>
                    <span className="text-[9px] text-zinc-500 max-w-[280px] leading-normal block italic select-none">
                      ⚠️ Local videos stream directly from the Host's device. Quality matches the Host's upload bandwidth and network stability.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* MOBILE TRAY ACCESS TRIGGERS */}
          <div className="flex lg:hidden gap-3 justify-center select-none">
            <Button variant="outline" size="sm" className="flex-1 text-[11px]" onClick={() => setIsMobileChatOpen(true)}>
              <MessageSquare size={13} className="mr-1.5 text-brand-primary" />
              Chat Feed
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-[11px]" onClick={() => setIsMobileMembersOpen(true)}>
              <Users size={13} className="mr-1.5 text-brand-accent" />
              Members ({store.participants.length})
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-[11px]" onClick={() => setIsMobileQueueOpen(true)}>
              <PlaySquare size={13} className="mr-1.5 text-emerald-400" />
              Queue ({store.queue.length})
            </Button>
          </div>
        </main>

        {/* DESKTOP RIGHT SIDEBAR COLUMN */}
        {!isCinemaMode && (
          <aside className="hidden lg:flex flex-col gap-6 lg:col-span-1">
            <Card className="flex-1 flex flex-col h-[550px] border border-glass shadow-glass bg-zinc-950/45">
              
              {/* Tab selector headers */}
              <div className="grid grid-cols-3 border-b border-glass bg-black/25">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`py-3 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-300 ${
                    activeTab === 'chat' 
                      ? 'border-b-2 border-brand-primary text-white bg-white/5' 
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setActiveTab('members')}
                  className={`py-3 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-300 ${
                    activeTab === 'members' 
                      ? 'border-b-2 border-brand-primary text-white bg-white/5' 
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  Peers ({store.participants.length})
                </button>
                <button
                  onClick={() => setActiveTab('queue')}
                  className={`py-3 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-300 ${
                    activeTab === 'queue' 
                      ? 'border-b-2 border-brand-primary text-white bg-white/5' 
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  Queue ({store.queue.length})
                </button>
              </div>

              {/* Tab content bodies */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
                {activeTab === 'chat' && renderChatComponent()}
                {activeTab === 'members' && renderMembersComponent()}
                {activeTab === 'queue' && renderQueueComponent()}
              </div>

              {/* Chat Input panel */}
              {activeTab === 'chat' && (
                <div className="p-3 border-t border-glass bg-black/15">
                  <form onSubmit={handleSendChat} className="flex gap-2 relative">
                    <input 
                      type="text" 
                      placeholder={selfParticipant?.permissions.canChat || isHost ? "Type a message..." : "Muted by Host"}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={!isHost && !selfParticipant?.permissions.canChat}
                      className="flex-1 px-3 py-2 rounded-lg text-xs bg-brand-bg-input border border-glass focus:outline-none text-white disabled:opacity-50"
                    />
                    {(isHost || selfParticipant?.permissions.canChat) && (
                      <button
                        type="button"
                        onClick={() => setIsStickerPickerOpen(!isStickerPickerOpen)}
                        className="px-1 text-zinc-400 hover:text-white transition-colors duration-200"
                        title="Choose Sticker"
                      >
                        <Smile size={16} />
                      </button>
                    )}
                    <Button 
                      variant="primary" 
                      size="sm" 
                      type="submit" 
                      disabled={(!isHost && !selfParticipant?.permissions.canChat) || !chatInput.trim()}
                      className="w-8 h-8 rounded-lg flex items-center justify-center p-0 shrink-0"
                    >
                      <Send size={12} />
                    </Button>

                    {isStickerPickerOpen && (
                      <div 
                        ref={stickerPickerRef}
                        className="absolute bottom-12 right-0 z-30 bg-zinc-950 border border-glass p-3 rounded-xl shadow-xl w-64 animate-fade-in"
                      >
                        <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2 select-none text-left">
                          Send Sticker
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {STICKERS.map((sticker) => (
                            <button
                              key={sticker.id}
                              type="button"
                              title={sticker.label}
                              onClick={() => handleSendSticker(sticker.emoji)}
                              className="text-3xl hover:scale-125 hover:bg-white/5 p-1 rounded transition-all duration-150 select-none cursor-pointer"
                            >
                              {sticker.emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </form>
                </div>
              )}
            </Card>
          </aside>
        )}
      </div>

      {/* SYSTEM LOGS CONSOLE */}
      {!isCinemaMode && (
        <div className="px-6 mt-4">
          <Card className="border border-glass bg-zinc-950/80">
            <div className="px-4.5 py-3 border-b border-glass flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Terminal size={13} className="text-zinc-600" />
                Realtime Diagnostics console
              </span>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleCopyInvite} className="text-[10px] py-1">
                  Copy Invite
                </Button>
                <div className="flex items-center gap-1.5 border border-glass bg-black/35 rounded-lg px-2 py-1 select-none">
                  <span className="text-[9px] font-bold text-zinc-600 uppercase">Interactive Theme:</span>
                  <select 
                    value={store.room.theme}
                    onChange={(e) => {
                      const selTheme = e.target.value;
                      store.updateRoomSettings({ theme: selTheme }).then(() => {
                        document.body.className = document.body.className
                          .replace(/theme-\w+/g, '')
                          .trim();
                        if (selTheme !== 'cinema') {
                          document.body.classList.add(`theme-${selTheme}`);
                        }
                      });
                    }}
                    className="bg-transparent text-[10px] font-bold text-white focus:outline-none cursor-pointer"
                  >
                    <option value="cinema" className="bg-zinc-900">Cinema (Red)</option>
                    <option value="night" className="bg-zinc-900">Night (Blue)</option>
                    <option value="gaming" className="bg-zinc-900">Gaming (Green)</option>
                    <option value="horror" className="bg-zinc-900">Horror (Crimson)</option>
                    <option value="couple" className="bg-zinc-900">Couple (Pink)</option>
                    <option value="casual" className="bg-zinc-900">Casual (Grey)</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-black/40 h-36 overflow-y-auto font-mono text-[9px] flex flex-col gap-1.5">
              {store.diagnosticsLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-zinc-600">[{log.timestamp}]</span>
                  <span className={`uppercase select-none shrink-0 ${
                    log.category === 'SYSTEM' ? 'text-zinc-500' :
                    log.category === 'REALTIME' ? 'text-blue-400 font-semibold' :
                    log.category === 'WEBRTC' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-bold bg-red-950/20 rounded'
                  }`}>
                    [{log.category}]
                  </span>
                  <span className="text-zinc-400 break-all select-text">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </Card>
        </div>
      )}

      {/* MOBILE BOTTOM SLIDING SHEETS */}
      <BottomSheet 
        isOpen={isMobileChatOpen} 
        onClose={() => setIsMobileChatOpen(false)} 
        title="Chat Box"
      >
        <div className="flex flex-col h-[60vh]">
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0 pb-4">
            {renderChatComponent()}
          </div>
          <div className="p-2 border-t border-glass bg-black/10 flex flex-col gap-2 relative">
            {isMobileStickerPickerOpen && (
              <div 
                ref={mobileStickerPickerRef}
                className="bg-zinc-950 border border-glass p-3 rounded-xl shadow-xl w-full mb-1 animate-fade-in"
              >
                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2 select-none text-left">
                  Send Sticker
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {STICKERS.map((sticker) => (
                    <button
                      key={sticker.id}
                      type="button"
                      title={sticker.label}
                      onClick={() => handleSendMobileSticker(sticker.emoji)}
                      className="text-3xl hover:scale-125 p-1 rounded transition-all duration-150 select-none cursor-pointer"
                    >
                      {sticker.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSendChat} className="flex gap-2 w-full">
              <input 
                type="text" 
                placeholder={selfParticipant?.permissions.canChat || isHost ? "Type a message..." : "Muted by Host"}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={!isHost && !selfParticipant?.permissions.canChat}
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-brand-bg-input border border-glass focus:outline-none text-white"
              />
              {(isHost || selfParticipant?.permissions.canChat) && (
                <button
                  type="button"
                  onClick={() => setIsMobileStickerPickerOpen(!isMobileStickerPickerOpen)}
                  className="px-1 text-zinc-400 hover:text-white transition-colors duration-200"
                  title="Choose Sticker"
                >
                  <Smile size={16} />
                </button>
              )}
              <Button variant="primary" size="sm" type="submit">
                Send
              </Button>
            </form>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet 
        isOpen={isMobileMembersOpen} 
        onClose={() => setIsMobileMembersOpen(false)} 
        title={`Peers List (${store.participants.length})`}
      >
        <div className="flex flex-col gap-3 pb-8">
          {renderMembersComponent()}
        </div>
      </BottomSheet>

      <BottomSheet 
        isOpen={isMobileQueueOpen} 
        onClose={() => setIsMobileQueueOpen(false)} 
        title={`Queue Manager (${store.queue.length})`}
      >
        <div className="flex flex-col gap-3 pb-8">
          {renderQueueComponent()}
        </div>
      </BottomSheet>

      {/* HOST PERMISSIONS PANEL MODAL */}
      <Modal
        isOpen={showPermissionsModal && !!selectedUserPermissions}
        onClose={() => {
          setShowPermissionsModal(false);
          setSelectedUserPermissions(null);
        }}
        title={`Permissions: ${selectedUserPermissions?.name || 'User'}`}
      >
        {selectedUserPermissions && (
          <div className="flex flex-col gap-5 select-none">
            <p className="text-xs text-brand-text-muted">
              Adjust what user actions are permitted during the watch party.
            </p>

            <div className="flex flex-col gap-3.5">
              {[
                { key: 'canPlayPause', label: 'Play / Pause Video' },
                { key: 'canSeek', label: 'Seek playhead position' },
                { key: 'canChangeVideo', label: 'Load / Change video source' },
                { key: 'canQueue', label: 'Add / Remove items from queue' },
                { key: 'canChat', label: 'Post messages to group chat' },
                { key: 'canReact', label: 'Send floating reaction emojis' }
              ].map(({ key, label }) => {
                const checked = selectedUserPermissions.permissions[key as keyof UserPermissions];
                return (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-black/25 border border-glass">
                    <span className="text-xs font-semibold text-white">{label}</span>
                    <button
                      type="button"
                      onClick={() => handleTogglePermissionField(key as keyof UserPermissions)}
                      className={`
                        w-11 h-6 rounded-full relative transition-colors duration-300 focus:outline-none
                        ${checked ? 'bg-brand-primary' : 'bg-zinc-800'}
                      `}
                    >
                      <span 
                        className={`
                          absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300
                          ${checked ? 'left-6' : 'left-1'}
                        `}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-end border-t border-glass pt-4 mt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setShowPermissionsModal(false);
                  setSelectedUserPermissions(null);
                }}
              >
                Close Panel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 👑 HOST CONTROLS MODAL */}
      <Modal
        isOpen={showHostControlsModal}
        onClose={() => setShowHostControlsModal(false)}
        title="👑 HOST CONTROLS"
      >
        <div className="flex flex-col gap-6 select-none max-h-[80vh] overflow-y-auto pr-1">
          {/* Quick actions deck */}
          <div className="p-4 bg-black/35 border border-glass rounded-xl flex flex-col gap-3.5">
            <span className="text-[10px] uppercase font-extrabold text-zinc-400 tracking-wider">
              Room Settings
            </span>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={store.room?.isLocked ? "primary" : "outline"}
                size="sm"
                onClick={() => store.updateRoomSettings({ isLocked: !store.room?.isLocked })}
                className="text-xs font-bold py-2 uppercase tracking-wide"
              >
                {store.room?.isLocked ? "🔓 Unlock Room" : "🔒 Lock Room"}
              </Button>
              <Button
                variant={store.room?.isQueueLocked ? "primary" : "outline"}
                size="sm"
                onClick={() => store.updateRoomSettings({ isQueueLocked: !store.room?.isQueueLocked })}
                className="text-xs font-bold py-2 uppercase tracking-wide"
              >
                {store.room?.isQueueLocked ? "🔓 Unlock Queue" : "🔒 Lock Queue"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleForceSync();
                  alert("Playback synchronized successfully.");
                }}
                className="text-xs font-bold py-2 uppercase tracking-wide gap-1.5 flex items-center justify-center"
              >
                <RefreshCw size={13} />
                Force Sync
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInvite}
                className="text-xs font-bold py-2 uppercase tracking-wide gap-1.5 flex items-center justify-center"
              >
                {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                Copy Invite
              </Button>
            </div>

            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setShowHostControlsModal(false);
                handleEndRoom();
              }}
              className="text-xs font-bold py-2 uppercase tracking-wide mt-1 w-full"
            >
              🗑 End Room Session
            </Button>
          </div>

          {/* Manage Users list */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] uppercase font-extrabold text-zinc-400 tracking-wider">
              Manage Users ({store.participants.length})
            </span>
            <div className="flex flex-col gap-3.5">
              {store.participants.map((p) => {
                const isSelf = p.id === store.participantId;
                return (
                  <div key={p.id} className="p-3 bg-black/25 border border-glass rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-zinc-900 border border-glass flex items-center justify-center text-base shrink-0 relative select-none">
                        {p.avatar}
                        <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-black ${
                          p.connectionStatus === 'connected' ? 'bg-green-500' :
                          p.connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-600'
                        }`} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white flex items-center gap-1">
                          {p.name}
                          {p.isHost && <Crown size={10} className="text-brand-primary animate-pulse" />}
                          {isSelf && <span className="text-[9px] text-zinc-500 font-normal">(You)</span>}
                        </span>
                        <span className="text-[9px] text-zinc-500 font-semibold uppercase">
                          {p.connectionStatus === 'connected' ? 'Online' : 'Reconnecting...'}
                        </span>
                      </div>
                    </div>

                    {!isSelf && (
                      <div className="flex items-center gap-1.5 select-none">
                        {/* Mute action */}
                        <Button
                          variant={p.isMuted ? "primary" : "outline"}
                          size="sm"
                          onClick={() => {
                            const nextPerms = {
                              ...p.permissions,
                              canChat: p.isMuted // toggle canChat
                            };
                            store.updateParticipantPermissions(p.id, nextPerms);
                          }}
                          className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wide"
                        >
                          {p.isMuted ? "🔇 Unmute" : "🔊 Mute"}
                        </Button>

                        {/* Permissions action */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUserPermissions(p);
                            setShowPermissionsModal(true);
                          }}
                          className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wide"
                        >
                          🎛 Perms
                        </Button>

                        {/* Transfer Host */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Transfer host permissions to ${p.name}? You will lose moderation rights.`)) {
                              store.transferHost(p.id);
                              setShowHostControlsModal(false);
                            }
                          }}
                          className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-brand-primary hover:bg-brand-primary/10"
                        >
                          👑 Ownership
                        </Button>

                        {/* Remove User */}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Remove ${p.name} from the watch room?`)) {
                              store.removeParticipant(p.id);
                            }
                          }}
                          className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wide"
                        >
                          🚫 Kick
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end border-t border-glass pt-4 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHostControlsModal(false)}
            >
              Close Controls
            </Button>
          </div>
        </div>
      </Modal>

      {store.isWatchPartyFinished && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 flex items-center justify-center p-4 select-none overflow-y-auto">
          <Card className="max-w-2xl w-full p-8 border border-brand-primary/30 bg-zinc-900/95 shadow-glow-strong rounded-2xl flex flex-col gap-6 text-center animate-fade-in my-8">
            <div>
              <div className="w-16 h-16 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary mx-auto mb-3 animate-pulse">
                <Film size={28} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide uppercase">
                🎬 Watch Party Finished
              </h2>
              <p className="text-xs text-zinc-400 mt-1 uppercase tracking-wider font-bold">
                Session Performance Dashboard
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
              <div className="p-3 bg-black/40 border border-glass rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Watch Time</span>
                <span className="text-lg font-black text-brand-primary mt-1 font-mono">
                  {new Date(store.sessionStats.totalWatchSeconds * 1000).toISOString().substr(11, 8)}
                </span>
              </div>
              <div className="p-3 bg-black/40 border border-glass rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Max Viewers</span>
                <span className="text-lg font-black text-white mt-1 font-mono">
                  {store.sessionStats.maxViewers}
                </span>
              </div>
              <div className="p-3 bg-black/40 border border-glass rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Messages Sent</span>
                <span className="text-lg font-black text-white mt-1 font-mono">
                  {store.sessionStats.totalMessages}
                </span>
              </div>
              <div className="p-3 bg-black/40 border border-glass rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Most Active</span>
                <span className="text-xs font-black text-brand-accent mt-2.5 truncate max-w-[120px] mx-auto block font-sans">
                  {mostActiveUser}
                </span>
              </div>
            </div>

            {/* Reactions breakdown */}
            <div className="p-4.5 bg-black/30 border border-glass rounded-xl text-left">
              <span className="text-[10px] uppercase font-extrabold text-zinc-400 tracking-wider block mb-3">
                Emoji Reactions Tally ({store.sessionStats.totalReactions})
              </span>
              {Object.keys(store.sessionStats.reactionBreakdown).length === 0 ? (
                <span className="text-[10px] text-zinc-500 italic block py-1">No reactions sent during this session.</span>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {Object.entries(store.sessionStats.reactionBreakdown).map(([emoji, count]) => (
                    <div key={emoji} className="flex items-center gap-1.5 bg-zinc-950 border border-glass/40 px-3 py-1.5 rounded-lg">
                      <span className="text-base select-none">{emoji}</span>
                      <span className="text-xs font-black text-white font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Achievements Section */}
            <div className="p-4.5 bg-black/30 border border-glass rounded-xl text-left">
              <span className="text-[10px] uppercase font-extrabold text-zinc-400 tracking-wider block mb-3">
                Lightweight Session Achievements
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Always unlocked: First Watch Party */}
                <div className="flex gap-2.5 bg-zinc-950 p-2.5 border border-emerald-500/20 rounded-lg items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    🎬
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">First Watch Party</span>
                    <span className="text-[9px] text-zinc-500 block leading-none mt-0.5">Completed a CineRoom stream session.</span>
                  </div>
                </div>

                {/* Marathon badge */}
                {store.sessionStats.totalWatchSeconds > 60 && (
                  <div className="flex gap-2.5 bg-zinc-950 p-2.5 border border-emerald-500/20 rounded-lg items-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      🍿
                    </div>
                    <div>
                      <span className="text-xs font-black text-white block">Movie Marathon</span>
                      <span className="text-[9px] text-zinc-500 block leading-none mt-0.5">Watched local or URL videos for over 1 minute.</span>
                    </div>
                  </div>
                )}

                {/* Laugh Master badge */}
                {(store.sessionStats.reactionBreakdown['😂'] || 0) > 3 && (
                  <div className="flex gap-2.5 bg-zinc-950 p-2.5 border border-emerald-500/20 rounded-lg items-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      😂
                    </div>
                    <div>
                      <span className="text-xs font-black text-white block">Laugh Master</span>
                      <span className="text-[9px] text-zinc-500 block leading-none mt-0.5">Dispatched 😂 reaction emojis over 3 times.</span>
                    </div>
                  </div>
                )}

                {/* Together badge */}
                {store.participants.length === 2 && (
                  <div className="flex gap-2.5 bg-zinc-950 p-2.5 border border-emerald-500/20 rounded-lg items-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      ❤️
                    </div>
                    <div>
                      <span className="text-xs font-black text-white block">Together</span>
                      <span className="text-[9px] text-zinc-500 block leading-none mt-0.5">Completed Couple watch party with exactly 2 peers.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Exit trigger */}
            <Button 
              variant="danger" 
              size="md" 
              onClick={() => {
                store.leaveRoom();
                navigate('/');
              }}
              className="mt-2 uppercase font-extrabold tracking-wider w-full"
            >
              Exit Watch Room
            </Button>
          </Card>
        </div>
      )}
    </div>
  );

  // --- SUB-RENDER BLOCKS FOR TABS ---

  function renderChatComponent() {
    if (store.chatMessages.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none my-auto">
          <MessageSquare size={22} className="text-zinc-700 mb-2" />
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">No messages yet</span>
          <p className="text-[10px] text-zinc-600 mt-1 max-w-[150px]">Say hello to get the party started!</p>
        </div>
      );
    }

    const handleTimestampClick = (time: number) => {
      if (!isHost && !selfParticipant?.permissions.canSeek) {
        alert('You do not have permission to seek.');
        return;
      }
      const video = videoElementRef.current;
      if (video) {
        isRespondingToSync.current = true;
        video.currentTime = time;
        setLocalCurrentTime(time);
      }
      store.updatePlayback({ currentTime: time });
    };

    const formatVideoTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      
      const mStr = m.toString().padStart(2, '0');
      const sStr = s.toString().padStart(2, '0');
      
      if (h > 0) {
        const hStr = h.toString().padStart(2, '0');
        return `${hStr}:${mStr}:${sStr}`;
      }
      return `${mStr}:${sStr}`;
    };

    return (
      <div className="flex-grow flex flex-col gap-3.5 pr-1">
        {store.chatMessages.map((msg) => {
          const isSelf = msg.senderId === store.participantId;
          return (
            <ChatItem 
              key={msg.id}
              msg={msg}
              isSelf={isSelf}
              onTimestampClick={handleTimestampClick}
              formatVideoTime={formatVideoTime}
            />
          );
        })}
        <div ref={chatEndRef} />
      </div>
    );
  }

  function renderMembersComponent() {
    return (
      <div className="flex-grow flex flex-col gap-3 pr-1">
        <div className="flex items-center gap-1.5 pb-2 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
          <span>👥 In Room — {store.participants.length}</span>
        </div>
        {store.participants.map((p) => {
          const isSelf = p.id === store.participantId;
          return (
            <MemberItem 
              key={p.id}
              p={p}
              isSelf={isSelf}
              isHost={isHost}
              onOpenPermissions={handleOpenPermissions}
              onRemoveParticipant={store.removeParticipant}
              onVolumeChange={(id, vol) => webrtcService.setPeerVolume(id, vol)}
            />
          );
        })}
      </div>
    );
  }

  function renderQueueComponent() {
    const isQueueLocked = store.room?.isQueueLocked || false;
    const canQueue = isHost || selfParticipant?.permissions.canQueue;

    return (
      <div className="flex-grow flex flex-col gap-4 pr-1 min-h-0">
        {/* Host Control Actions */}
        {isHost && (
          <div className="flex gap-2 justify-end mb-1 select-none shrink-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => store.updateRoomSettings({ isQueueLocked: !isQueueLocked })}
              className="text-[9px] py-1 px-2.5 flex items-center gap-1.5 h-7"
            >
              {isQueueLocked ? <Unlock size={11} /> : <Lock size={11} />}
              {isQueueLocked ? 'Unlock Playlist' : 'Lock Playlist'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                if (window.confirm('Clear all videos from the queue playlist?')) {
                  store.clearQueue();
                }
              }}
              className="text-[9px] py-1 px-2.5 text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40 h-7"
            >
              <Trash2 size={11} className="mr-1" />
              Clear Queue
            </Button>
          </div>
        )}

        {/* Loader input if host or permissions allow it and queue is unlocked */}
        {canQueue && (!isQueueLocked || isHost) && (
          <div className="p-3.5 rounded-xl border border-glass bg-black/20 flex flex-col gap-2.5 shrink-0">
            <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">Queue Video</span>
            <input 
              type="text" 
              placeholder="e.g. Movie Title"
              id="q-title"
              className="px-2.5 py-1.5 rounded bg-brand-bg-input border border-glass text-xs text-white"
            />
            <input 
              type="url" 
              placeholder="Direct HTTP Link (MP4)"
              id="q-url"
              className="px-2.5 py-1.5 rounded bg-brand-bg-input border border-glass text-xs text-white"
            />
            <Button 
              variant="primary" 
              size="sm" 
              onClick={() => {
                const titleEl = document.getElementById('q-title') as HTMLInputElement;
                const urlEl = document.getElementById('q-url') as HTMLInputElement;
                if (titleEl && urlEl && urlEl.value.trim() && titleEl.value.trim()) {
                  store.addToQueue(titleEl.value.trim(), urlEl.value.trim(), 'url');
                  titleEl.value = '';
                  urlEl.value = '';
                } else {
                  alert('Please fill out both Title and URL link.');
                }
              }}
              className="text-[10px] uppercase font-bold tracking-wider"
            >
              <Plus size={11} className="mr-1" />
              Add to Playlist
            </Button>
          </div>
        )}

        {/* Playlists Feed */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-3 min-h-0">
          
          {/* NOW PLAYING SECTION */}
          {store.playbackState.fileName && (
            <div className="shrink-0 mb-1">
              <span className="text-[9px] font-extrabold uppercase text-brand-primary tracking-widest block mb-2">
                🎬 NOW PLAYING
              </span>
              <div className="p-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 shadow-sm animate-fade-in">
                <span className="text-xs font-bold text-white block truncate">
                  {store.playbackState.fileName}
                </span>
                <span className="text-[9px] text-zinc-500 block truncate mt-1">
                  Source: {store.playbackState.sourceUrl}
                </span>
              </div>
            </div>
          )}

          {/* UP NEXT SECTION */}
          <div className="flex flex-col gap-3">
            <span className="text-[9px] font-extrabold uppercase text-zinc-500 tracking-widest block mb-1">
              ⏭ UP NEXT ({store.queue.length})
            </span>
            
            {store.queue.length === 0 ? (
              <div className="text-center py-6 text-[10px] text-zinc-500 font-semibold select-none border border-dashed border-glass rounded-xl bg-black/5">
                No videos queued.
              </div>
            ) : (
              store.queue.map((item, idx) => {
                return (
                  <div 
                    key={item.id}
                    className="p-2 rounded-xl border border-glass bg-black/10 flex flex-col gap-2 animate-fade-in"
                  >
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-900 border border-glass flex items-center justify-center text-sm shrink-0 select-none">
                        {item.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-white block truncate">{item.title}</span>
                        <span className="text-[9px] text-zinc-500 block truncate font-medium">Added by {item.addedBy}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-glass/40 pt-2 bg-black/5">
                      {/* Action buttons */}
                      <div className="flex gap-1 select-none">
                        {isHost && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handlePlayQueueItem(item)}
                            className="px-2.5 py-1 text-[9px] font-bold text-glow"
                          >
                            Choose Next
                          </Button>
                        )}
                        {(isHost || (!isQueueLocked && selfParticipant?.permissions.canQueue)) && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => store.removeFromQueue(item.id)}
                            className="p-1 text-zinc-500 hover:text-red-400"
                            title="Remove item"
                          >
                            <Trash2 size={11} />
                          </Button>
                        )}
                      </div>

                      {/* Reordering buttons (Host only) */}
                      {isHost && store.queue.length > 1 && (
                        <div className="flex gap-1.5 pr-1 select-none">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveQueueItem(idx, 'up')}
                            className="text-zinc-500 hover:text-white disabled:opacity-20"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === store.queue.length - 1}
                            onClick={() => handleMoveQueueItem(idx, 'down')}
                            className="text-zinc-500 hover:text-white disabled:opacity-20"
                          >
                            <ArrowDown size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }
};

// --- PERFORMANCE MEMOIZED CHILD COMPONENTS ---

const ChatItem = React.memo(({ 
  msg, 
  isSelf, 
  onTimestampClick, 
  formatVideoTime 
}: { 
  msg: ChatMessage; 
  isSelf: boolean; 
  onTimestampClick: (time: number) => void; 
  formatVideoTime: (secs: number) => string; 
}) => {
  if (msg.isSystem) {
    return (
      <div className="w-full text-center my-2 text-[10px] text-zinc-500 italic select-none">
        {msg.content}
      </div>
    );
  }

  const displayTimestamp = msg.videoTimestamp !== undefined ? formatVideoTime(msg.videoTimestamp) : null;

  return (
    <div 
      className={`flex gap-2 max-w-[85%] ${isSelf ? 'self-end flex-row-reverse' : 'self-start'}`}
    >
      <div className="w-7 h-7 rounded-full bg-zinc-900 border border-glass flex items-center justify-center text-sm shrink-0 select-none">
        {msg.senderAvatar}
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] text-zinc-500 font-bold mb-0.5 px-0.5 flex items-center gap-1.5 select-none">
          {displayTimestamp && (
            <button 
              type="button"
              onClick={() => onTimestampClick(msg.videoTimestamp!)}
              className="text-[9px] text-brand-primary font-mono font-bold hover:underline cursor-pointer bg-brand-primary/10 px-1 py-0.5 rounded"
            >
              {displayTimestamp}
            </button>
          )}
          {msg.senderName}
        </span>
        {msg.content.startsWith('[STICKER]:') ? (
          <div className="text-5xl py-1 px-1 select-none transform hover:scale-110 transition-transform duration-150">
            {msg.content.substring(10)}
          </div>
        ) : (
          <div className={`
            px-3 py-2 rounded-xl text-xs leading-relaxed break-all select-text
            ${isSelf 
              ? 'bg-brand-primary/15 border border-brand-primary/20 text-white rounded-tr-none shadow-sm' 
              : 'bg-zinc-900 border border-glass text-brand-text-main rounded-tl-none'
            }
          `}>
            {msg.content}
          </div>
        )}
      </div>
    </div>
  );
});
ChatItem.displayName = 'ChatItem';

const MemberItem = React.memo(({ 
  p, 
  isSelf, 
  isHost, 
  onOpenPermissions, 
  onRemoveParticipant,
  onVolumeChange
}: { 
  p: Participant; 
  isSelf: boolean; 
  isHost: boolean; 
  onOpenPermissions: (user: Participant) => void; 
  onRemoveParticipant: (id: string) => void; 
  onVolumeChange: (id: string, vol: number) => void;
}) => {
  const isUserHost = p.isHost;
  const statusColor = p.connectionStatus === 'reconnecting' 
    ? 'bg-yellow-500 animate-pulse' 
    : (p.connectionStatus === 'disconnected' ? 'bg-red-500' : 'bg-green-500');
  const statusText = p.connectionStatus === 'reconnecting' 
    ? 'Reconnecting' 
    : (p.connectionStatus === 'disconnected' ? 'Disconnected' : 'Connected');

  return (
    <div 
      className="flex flex-col gap-2 p-2.5 rounded-xl border border-glass bg-black/15"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative select-none">
            <div className={`
              w-8 h-8 rounded-full bg-zinc-900 border flex items-center justify-center text-sm transition-all duration-300
              ${p.isSpeaking 
                ? 'border-green-500 ring-2 ring-green-500/40 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse' 
                : 'border-glass'
              }
            `}>
              {p.avatar}
            </div>
            {isUserHost && (
              <div className="absolute -top-1 -right-1 bg-yellow-500 text-black rounded-full p-0.5" title="Host">
                <Crown size={8} />
              </div>
            )}
          </div>
          <div>
            <span className="text-xs font-bold text-white block">
              {p.name} {isSelf && <span className="text-[9px] text-zinc-500 font-normal">(You)</span>}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 select-none">
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                {statusText} {isUserHost && '— Host'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 select-none">
          {isHost && !isSelf && (
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => onOpenPermissions(p)} 
                className="p-1 text-zinc-500 hover:text-white"
                title="Edit Permissions"
              >
                <Shield size={12} />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  if (window.confirm(`Kick participant [${p.name}]?`)) {
                    onRemoveParticipant(p.id);
                  }
                }}
                className="p-1 text-zinc-500 hover:text-red-400"
                title="Kick User"
              >
                <LogOut size={12} />
              </Button>
            </div>
          )}
          {p.isMuted && <MicOff size={11} className="text-red-400" />}
          <span className="text-[9px] font-mono text-zinc-500 font-bold pr-1">{p.ping}ms</span>
        </div>
      </div>

      {/* Per-user volume slider for remote connected peers */}
      {!isSelf && p.connectionStatus === 'connected' && (
        <div className="flex items-center gap-2 bg-black/25 px-2.5 py-1.5 rounded border border-glass mt-1 select-none">
          <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest shrink-0">User Vol</span>
          <input 
            type="range"
            min={0}
            max={1}
            step={0.1}
            defaultValue={0.8}
            onChange={(e) => {
              const vol = parseFloat(e.target.value);
              onVolumeChange(p.id, vol);
            }}
            className="flex-grow h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-primary"
          />
        </div>
      )}
    </div>
  );
});
MemberItem.displayName = 'MemberItem';

export default Room;
