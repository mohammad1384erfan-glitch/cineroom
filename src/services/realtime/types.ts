export type VideoSourceType = 'url' | 'local' | 'aparat';

export interface UserPermissions {
  canPlayPause: boolean;
  canSeek: boolean;
  canChangeVideo: boolean;
  canQueue: boolean;
  canChat: boolean;
  canReact: boolean;
}

export interface Participant {
  id: string;
  name: string;
  avatar: string; // Emoji key or icon name
  isHost: boolean;
  joinedAt: number;
  ping: number;
  isMuted: boolean;
  isConnected: boolean;
  permissions: UserPermissions;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  isSpeaking: boolean;
}

export interface PlaybackState {
  sourceType: VideoSourceType;
  sourceUrl: string; // Used for Direct URL
  fileName: string;  // Used for Local File description
  fileSize: number;  // Used for Local File sizing
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number; // local timestamp of the last state change
  
  // Canonical State Tracking
  videoId: string;
  playing: boolean;
  lastUpdateTimestamp: number;
  stateVersion: number;
  eventId: string;
}

export interface QueueItem {
  id: string;
  title: string;
  url: string;
  sourceType: VideoSourceType;
  addedBy: string; // Participant name
  avatar: string;  // Participant avatar
  duration?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: number;
  videoTimestamp?: number;
  isSystem?: boolean;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  capacity: number; // 2 to 6
  hasPassword?: boolean;
  hostId: string;
  isLocked: boolean;
  isQueueLocked: boolean;
  theme: string;
}

export interface ReactionEvent {
  id: string;
  emoji: string;
  senderId: string;
  xOffset: number; // Horizontal offset for floating animation
  createdAt: number;
}

export interface RealtimeRoomState {
  room: Room | null;
  participants: Participant[];
  playbackState: PlaybackState;
  chatMessages: ChatMessage[];
  queue: QueueItem[];
}

export type RealtimeCallback<T> = (data: T) => void;

export interface RealtimeEventListeners {
  onRoomUpdate?: RealtimeCallback<Room>;
  onParticipantsChange?: RealtimeCallback<Participant[]>;
  onPlaybackChange?: RealtimeCallback<PlaybackState>;
  onChatMessage?: RealtimeCallback<ChatMessage>;
  onQueueChange?: RealtimeCallback<QueueItem[]>;
  onSignalingMessage?: RealtimeCallback<{ senderId: string; type: string; payload: any }>;
  onReactionReceived?: RealtimeCallback<ReactionEvent>;
}

export interface ClientSession {
  roomId: string;
  participantId: string;
  nickname: string;
  avatar: string;
}
