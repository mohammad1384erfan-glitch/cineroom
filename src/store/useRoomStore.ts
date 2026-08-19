import { create } from 'zustand';
import { 
  Room, 
  Participant, 
  PlaybackState, 
  ChatMessage, 
  QueueItem, 
  PeerConnectionInfo,
  LogEntry,
  ReactionEvent,
  UserPermissions,
  realtimeService,
  webrtcService,
  logger
} from '@/services';

export interface SessionStats {
  watchStartTime: number;
  totalWatchSeconds: number;
  maxViewers: number;
  totalReactions: number;
  reactionBreakdown: Record<string, number>;
  totalMessages: number;
  activityCount: Record<string, number>;
}

interface RoomState {
  room: Room | null;
  participants: Participant[];
  playbackState: PlaybackState;
  chatMessages: ChatMessage[];
  queue: QueueItem[];
  participantId: string | null;
  
  // UI and Connection States
  isConnecting: boolean;
  error: string | null;
  webrtcPeers: PeerConnectionInfo[];
  isLocalMuted: boolean;
  diagnosticsLogs: LogEntry[];
  floatingReactions: ReactionEvent[];

  // P2P Media streaming state
  p2pProgress: number;
  p2pReceivedBytes: number;
  p2pBufferedChunks: Map<number, ArrayBuffer>;
  p2pObjectUrl: string | null;
  isP2PBuffering: boolean;
  p2pActiveFileId: string | null;

  // Premium stats tracking
  sessionStats: SessionStats;
  isWatchPartyFinished: boolean;

  // Actions
  createRoom: (
    name: string, 
    capacity: number, 
    password?: string,
    nickname?: string,
    avatar?: string,
    theme?: string
  ) => Promise<void>;
  joinRoom: (
    code: string, 
    nickname: string, 
    avatar: string, 
    password?: string
  ) => Promise<void>;
  leaveRoom: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  updatePlayback: (state: Partial<PlaybackState>) => Promise<void>;
  sendChatMessage: (content: string) => Promise<void>;
  addToQueue: (title: string, url: string, sourceType: 'url' | 'local') => Promise<void>;
  removeFromQueue: (itemId: string) => Promise<void>;
  reorderQueue: (queue: QueueItem[]) => Promise<void>;
  clearQueue: () => Promise<void>;
  startStreamingFile: (file: File) => Promise<void>;
  updateRoomSettings: (settings: Partial<Room>) => Promise<void>;
  updateParticipantPermissions: (targetId: string, permissions: UserPermissions) => Promise<void>;
  removeParticipant: (targetId: string) => Promise<void>;
  sendReaction: (emoji: string) => Promise<void>;
  toggleMute: () => void;
  clearError: () => void;
  addDiagnosticLog: (log: LogEntry) => void;
  clearDiagnostics: () => void;
  finishWatchParty: () => Promise<void>;
  transferHost: (targetId: string) => Promise<void>;
  endRoom: () => Promise<void>;
}

const initialPlaybackState: PlaybackState = {
  sourceType: 'url',
  sourceUrl: '',
  fileName: '',
  fileSize: 0,
  isPlaying: false,
  currentTime: 0,
  updatedAt: 0,
  videoId: '',
  playing: false,
  lastUpdateTimestamp: 0,
  stateVersion: 0,
  eventId: ''
};

export const useRoomStore = create<RoomState>((set, get) => {
  // Listen to logger diagnostics
  logger.subscribe((entry) => {
    set((state) => ({
      diagnosticsLogs: [...state.diagnosticsLogs, entry].slice(-100),
    }));
  });

  // Watch time ticker interval
  setInterval(() => {
    const isPlaying = get().playbackState.playing || get().playbackState.isPlaying;
    const isFinished = get().isWatchPartyFinished;
    const inRoom = !!get().room;
    if (inRoom && isPlaying && !isFinished) {
      set((state) => ({
        sessionStats: {
          ...state.sessionStats,
          totalWatchSeconds: state.sessionStats.totalWatchSeconds + 1
        }
      }));
    }
  }, 1000);

  return {
    room: null,
    participants: [],
    playbackState: initialPlaybackState,
    chatMessages: [],
    queue: [],
    participantId: null,
    
    isConnecting: false,
    error: null,
    webrtcPeers: [],
    isLocalMuted: false,
    diagnosticsLogs: logger.getLogs(),
    floatingReactions: [],

    // P2P Media streaming state
    p2pProgress: 0,
    p2pReceivedBytes: 0,
    p2pBufferedChunks: new Map(),
    p2pObjectUrl: null,
    isP2PBuffering: false,
    p2pActiveFileId: null,

    // Premium stats tracking
    isWatchPartyFinished: false,
    sessionStats: {
      watchStartTime: Date.now(),
      totalWatchSeconds: 0,
      maxViewers: 1,
      totalReactions: 0,
      reactionBreakdown: {},
      totalMessages: 0,
      activityCount: {}
    },

    createRoom: async (name, capacity, password, nickname, avatar, theme) => {
      set({ isConnecting: true, error: null });
      try {
        logger.info(`Creating room: "${name}" with capacity: ${capacity}`);
        
        get().setupServiceListeners();

        const { room, participantId } = await realtimeService.createRoom(
          name, 
          capacity, 
          password,
          nickname,
          avatar,
          theme
        );
        
        // Initialize WebRTC
        await webrtcService.initialize(participantId, nickname || 'You');

        set({
          room,
          participantId,
          isConnecting: false,
          isLocalMuted: false
        });
      } catch (err: any) {
        logger.error('Failed to create room:', err.message);
        set({ isConnecting: false, error: err.message || 'Failed to create room.' });
        realtimeService.clearListeners();
        webrtcService.close();
        throw err;
      }
    },

    joinRoom: async (code, nickname, avatar, password) => {
      set({ isConnecting: true, error: null });
      try {
        logger.info(`Joining room with code: "${code}" as "${nickname}"`);

        get().setupServiceListeners();

        const { room, participantId } = await realtimeService.joinRoom(
          code, 
          nickname, 
          avatar, 
          password
        );

        // Initialize WebRTC
        await webrtcService.initialize(participantId, nickname);

        set({
          room,
          participantId,
          isConnecting: false,
          isLocalMuted: false
        });
      } catch (err: any) {
        logger.error('Failed to join room:', err.message);
        set({ isConnecting: false, error: err.message || 'Failed to join room.' });
        realtimeService.clearListeners();
        webrtcService.close();
        throw err;
      }
    },

    leaveRoom: async () => {
      logger.info('Leaving room, cleaning up connections...');
      try {
        await realtimeService.leaveRoom();
      } catch (err) {
        logger.error('Error during room leave:', err);
      } finally {
        realtimeService.clearListeners();
        webrtcService.close();
        
        set({
          room: null,
          participants: [],
          playbackState: initialPlaybackState,
          chatMessages: [],
          queue: [],
          participantId: null,
          isConnecting: false,
          error: null,
          webrtcPeers: [],
          isLocalMuted: false,
          floatingReactions: []
        });
      }
    },

    restoreSession: async () => {
      set({ isConnecting: true, error: null });
      try {
        get().setupServiceListeners();
        const session = await realtimeService.restoreSession();
        if (session) {
          await webrtcService.initialize(session.participantId, 'You');

          set({
            room: session.room,
            participantId: session.participantId,
            isConnecting: false,
            isLocalMuted: false
          });
          return true;
        }
      } catch (err: any) {
        logger.error('Failed to restore session:', err.message);
        set({ isConnecting: false });
        realtimeService.clearListeners();
        webrtcService.close();
      }
      set({ isConnecting: false });
      return false;
    },

    updatePlayback: async (state) => {
      try {
        await realtimeService.updatePlayback(state);
      } catch (err: any) {
        logger.error('Failed to update playback state:', err.message);
        set({ error: err.message });
      }
    },

    sendChatMessage: async (content) => {
      try {
        await realtimeService.sendChatMessage(content);
      } catch (err: any) {
        logger.error('Failed to send chat message:', err.message);
        set({ error: err.message });
      }
    },

    addToQueue: async (title, url, sourceType) => {
      try {
        await realtimeService.addToQueue({
          title,
          url,
          sourceType,
        });
      } catch (err: any) {
        logger.error('Failed to add video to queue:', err.message);
        set({ error: err.message });
      }
    },

    removeFromQueue: async (itemId) => {
      try {
        await realtimeService.removeFromQueue(itemId);
      } catch (err: any) {
        logger.error('Failed to remove item from queue:', err.message);
        set({ error: err.message });
      }
    },

    reorderQueue: async (queue) => {
      try {
        await realtimeService.reorderQueue(queue);
      } catch (err: any) {
        logger.error('Failed to reorder watch queue:', err.message);
        set({ error: err.message });
      }
    },

    clearQueue: async () => {
      try {
        await realtimeService.reorderQueue([]);
      } catch (err: any) {
        logger.error('Failed to clear watch queue:', err.message);
        set({ error: err.message });
      }
    },

    startStreamingFile: async (file) => {
      try {
        await webrtcService.startStreamingFile(file);
        
        // Generate fileId
        const fileId = 'f-' + Math.random().toString(36).substring(2, 8);
        
        // Broadcast local file details on playback state
        await realtimeService.updatePlayback({
          sourceType: 'local',
          sourceUrl: '', // local file utilizes slices, no server URL!
          fileName: file.name,
          fileSize: file.size,
          isPlaying: false,
          playing: false,
          currentTime: 0,
          videoId: fileId
        });

        // Initialize local Host P2P state
        set({
          p2pActiveFileId: fileId,
          p2pProgress: 100, // Host has all chunk assets locally
          p2pReceivedBytes: file.size,
          p2pObjectUrl: URL.createObjectURL(file),
          isP2PBuffering: false
        });
      } catch (err: any) {
        logger.error('Failed to start local file streaming:', err.message);
        set({ error: err.message });
      }
    },

    updateRoomSettings: async (settings) => {
      try {
        await realtimeService.updateRoomSettings(settings);
      } catch (err: any) {
        logger.error('Failed to update room settings:', err.message);
        set({ error: err.message });
      }
    },

    finishWatchParty: async () => {
      try {
        // Pause playback for everyone
        await get().updatePlayback({ playing: false, isPlaying: false });
        // Broadcast systemic watch party completion trigger
        await realtimeService.sendChatMessage('SYSTEM_WATCH_PARTY_FINISHED');
      } catch (err: any) {
        logger.error('Failed to finish watch party:', err.message);
        set({ error: err.message });
      }
    },

    transferHost: async (targetId) => {
      try {
        await realtimeService.transferHost(targetId);
      } catch (err: any) {
        logger.error('Failed to transfer host role:', err.message);
        set({ error: err.message });
      }
    },

    endRoom: async () => {
      try {
        await realtimeService.endRoom();
        set({
          room: null,
          participants: [],
          playbackState: initialPlaybackState,
          chatMessages: [],
          queue: [],
          participantId: null,
          isConnecting: false,
          error: null,
          webrtcPeers: [],
          isLocalMuted: false,
          floatingReactions: []
        });
      } catch (err: any) {
        logger.error('Failed to end room session:', err.message);
        set({ error: err.message });
      }
    },

    updateParticipantPermissions: async (targetId, permissions) => {
      try {
        await realtimeService.updateParticipantPermissions(targetId, permissions);
      } catch (err: any) {
        logger.error('Failed to update user permissions:', err.message);
        set({ error: err.message });
      }
    },

    removeParticipant: async (targetId) => {
      try {
        await realtimeService.removeParticipant(targetId);
      } catch (err: any) {
        logger.error('Failed to remove user:', err.message);
        set({ error: err.message });
      }
    },

    sendReaction: async (emoji) => {
      try {
        await realtimeService.sendReaction(emoji);
      } catch (err: any) {
        logger.error('Failed to dispatch reaction:', err.message);
        set({ error: err.message });
      }
    },

    toggleMute: () => {
      const isMuted = webrtcService.toggleMute();
      set({ isLocalMuted: isMuted });
    },

    clearError: () => set({ error: null }),
    
    addDiagnosticLog: (log) => {
      set((state) => ({
        diagnosticsLogs: [...state.diagnosticsLogs, log].slice(-100),
      }));
    },

    clearDiagnostics: () => {
      logger.clear();
      set({ diagnosticsLogs: [] });
    },

    // --- SERVICE LISTENER WRAPPERS ---
    setupServiceListeners: () => {
      realtimeService.setListeners({
        onRoomUpdate: (room) => {
          set({ room });
        },
        
        onParticipantsChange: (participants) => {
          const selfId = get().participantId;
          
          // Ejection Check: If our participant ID was initialized, but we are no longer in the member list
          if (selfId && participants.length > 0) {
            const stillInRoom = participants.some(p => p.id === selfId);
            if (!stillInRoom) {
              logger.error('Ejection Check: Ejected from the watch party by the Host.');
              
              // Disconnect
              realtimeService.clearListeners();
              webrtcService.close();

              set({
                room: null,
                participants: [],
                playbackState: initialPlaybackState,
                chatMessages: [],
                queue: [],
                participantId: null,
                isConnecting: false,
                error: 'You have been removed from the room by the Host.',
                webrtcPeers: [],
                isLocalMuted: false,
                floatingReactions: []
              });
              return;
            }
          }

          set((state) => ({
            participants,
            sessionStats: {
              ...state.sessionStats,
              maxViewers: Math.max(state.sessionStats.maxViewers, participants.length)
            }
          }));

          // Room Safety Pause Rule: Host pauses the room if any participant is reconnecting
          const hasReconnectingPeer = participants.some(p => p.connectionStatus === 'reconnecting');
          const isPlaying = get().playbackState.playing || get().playbackState.isPlaying;
          const isHost = get().room?.hostId === selfId;
          if (hasReconnectingPeer && isPlaying && isHost) {
            logger.error('Room Safety Rule: Pausing watchroom. Peer reconnecting.');
            get().updatePlayback({ playing: false, isPlaying: false });
          }

          // WebRTC mesh signaling sync
          participants.forEach((p) => {
            if (p.id !== selfId && p.isConnected) {
              const peerExists = get().webrtcPeers.some((peer) => peer.peerId === p.id);
              if (!peerExists) {
                webrtcService.connectToPeer(p.id, p.name);
              }
            }
          });

          get().webrtcPeers.forEach((peer) => {
            const stillConnected = participants.some((p) => p.id === peer.peerId && p.isConnected);
            if (!stillConnected) {
              webrtcService.disconnectFromPeer(peer.peerId);
            }
          });
        },

        onPlaybackChange: (playbackState) => {
          set({ playbackState });

          const isLocal = playbackState.sourceType === 'local';
          const selfId = get().participantId;
          const hostId = get().room?.hostId;
          const isSelfHost = hostId === selfId;
          const fileId = playbackState.videoId;

          if (isLocal && !isSelfHost && fileId) {
            const currentFileId = get().p2pActiveFileId;
            if (currentFileId !== fileId) {
              // New P2P streaming file: Reset buffer and request from chunk 0
              set({
                p2pActiveFileId: fileId,
                p2pProgress: 0,
                p2pReceivedBytes: 0,
                p2pBufferedChunks: new Map(),
                p2pObjectUrl: null,
                isP2PBuffering: true
              });
              webrtcService.requestFileChunk(fileId, 0);
            } else {
              // Resuming transfer: Locate the next missing index
              const buffers = get().p2pBufferedChunks;
              let nextIndex = 0;
              while (buffers.has(nextIndex)) {
                nextIndex++;
              }
              const total = Math.ceil(playbackState.fileSize / 65536);
              if (nextIndex < total) {
                webrtcService.requestFileChunk(fileId, nextIndex);
              }
            }
          }
        },

        onChatMessage: (chatMsg) => {
          if (chatMsg.content === 'SYSTEM_WATCH_PARTY_FINISHED') {
            set({ isWatchPartyFinished: true });
            return;
          }

          set((state) => {
            const activity = { ...state.sessionStats.activityCount };
            activity[chatMsg.senderId] = (activity[chatMsg.senderId] || 0) + 1;

            return {
              chatMessages: [...state.chatMessages, chatMsg].slice(-100),
              sessionStats: {
                ...state.sessionStats,
                totalMessages: state.sessionStats.totalMessages + 1,
                activityCount: activity
              }
            };
          });
        },

        onQueueChange: (queue) => {
          set({ queue });
        },

        onSignalingMessage: ({ senderId, type, payload }) => {
          if (type === 'speaking') {
            set((state) => ({
              participants: state.participants.map((p) =>
                p.id === senderId ? { ...p, isSpeaking: payload.isSpeaking } : p
              )
            }));
          } else {
            webrtcService.handleSignalingMessage(senderId, type, payload);
          }
        },

        onReactionReceived: (reactionEvent) => {
          set((state) => {
            const breakdown = { ...state.sessionStats.reactionBreakdown };
            breakdown[reactionEvent.emoji] = (breakdown[reactionEvent.emoji] || 0) + 1;

            const activity = { ...state.sessionStats.activityCount };
            activity[reactionEvent.senderId] = (activity[reactionEvent.senderId] || 0) + 1;

            return {
              floatingReactions: [...state.floatingReactions, reactionEvent],
              sessionStats: {
                ...state.sessionStats,
                totalReactions: state.sessionStats.totalReactions + 1,
                reactionBreakdown: breakdown,
                activityCount: activity
              }
            };
          });

          // Automatically purge reaction after 4s (floating animation finishes)
          setTimeout(() => {
            set((state) => ({
              floatingReactions: state.floatingReactions.filter(r => r.id !== reactionEvent.id)
            }));
          }, 4000);
        }
      });

      webrtcService.setListeners({
        onPeersStateChange: (webrtcPeers) => {
          set({ webrtcPeers });
        },
        onLocalAudioToggle: ({ isMuted }) => {
          set({ isLocalMuted: isMuted });
        },
        onRemoteStreamReceived: ({ peerId, stream: _stream }) => {
          logger.info(`Streaming audio ready for peer ${peerId}.`);
        },
        onDataChannelReceived: ({ peerId, label, message }) => {
          logger.info(`Received data channel [${label}] from ${peerId}: "${message}"`);
        },
        onTransferProgress: ({ fileId: _fileId, progress, receivedBytes }) => {
          set({ p2pProgress: progress, p2pReceivedBytes: receivedBytes });
        },
        onChunkReceived: ({ fileId, chunkIndex, totalChunks, buffer }) => {
          set((state) => {
            const buffers = new Map(state.p2pBufferedChunks);
            buffers.set(chunkIndex, buffer);

            let p2pObjectUrl = state.p2pObjectUrl;
            // 4% metadata buffer chunk count threshold before playback starts
            const initialBufferLimit = Math.max(1, Math.min(totalChunks, Math.round(totalChunks * 0.04)));
            const hasInitialBuffer = buffers.size >= initialBufferLimit;

            if (hasInitialBuffer) {
              const parts: ArrayBuffer[] = [];
              for (let i = 0; i <= chunkIndex; i++) {
                if (buffers.has(i)) {
                  parts.push(buffers.get(i)!);
                } else {
                  break; // stop on missing chunks
                }
              }

              if (parts.length > 0) {
                const blob = new Blob(parts, { type: 'video/mp4' });
                if (p2pObjectUrl) {
                  URL.revokeObjectURL(p2pObjectUrl);
                }
                p2pObjectUrl = URL.createObjectURL(blob);
              }
            }

            const isBuffering = buffers.size < totalChunks && !buffers.has(chunkIndex + 1);

            return {
              p2pBufferedChunks: buffers,
              p2pObjectUrl,
              isP2PBuffering: isBuffering
            };
          });

          // Self-regulating backpressure pull-loop
          if (chunkIndex < totalChunks - 1) {
            webrtcService.requestFileChunk(fileId, chunkIndex + 1);
          }
        }
      });
    }
  };
});

interface RoomState {
  setupServiceListeners: () => void;
}
