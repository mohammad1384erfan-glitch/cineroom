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
  logger,
  logLocalFileE2E,
  logLocalTransfer
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
  p2pSubtitleName: string | null;
  p2pSubtitleUrl: string | null;
  lastP2PUrlUpdateTime: number | null;

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
  sendChatMessage: (content: string, replyToId?: string | null) => Promise<void>;
  addToQueue: (title: string, url: string, sourceType: 'url' | 'local') => Promise<void>;
  removeFromQueue: (itemId: string) => Promise<void>;
  reorderQueue: (queue: QueueItem[]) => Promise<void>;
  clearQueue: () => Promise<void>;
  startStreamingFile: (file: File | null) => Promise<void>;
  removeVideo: () => Promise<void>;
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
    p2pSubtitleName: null,
    p2pSubtitleUrl: null,
    lastP2PUrlUpdateTime: null,

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
        
        const oldSubUrl = get().p2pSubtitleUrl;
        if (oldSubUrl) {
          URL.revokeObjectURL(oldSubUrl);
        }
        
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
          floatingReactions: [],
          p2pSubtitleName: null,
          p2pSubtitleUrl: null
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

    sendChatMessage: async (content, replyToId) => {
      try {
        await realtimeService.sendChatMessage(content, replyToId);
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
        
        if (!file) {
          const currentUrl = get().p2pObjectUrl;
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }
          set({
            p2pActiveFileId: null,
            p2pProgress: 0,
            p2pReceivedBytes: 0,
            p2pBufferedChunks: new Map(),
            p2pObjectUrl: null,
            isP2PBuffering: false,
            lastP2PUrlUpdateTime: null
          });
          return;
        }

        logLocalFileE2E('[HOST][FILE_SELECTED]');
        logLocalFileE2E('[HOST][FILE_METADATA]');

        console.log("[LOCAL_E2E][HOST][FILE_SELECTED]", {
          name: file.name,
          size: file.size,
          type: file.type
        });

        console.log("[VIDEO_DEBUG][HOST][FILE_SELECTED]", {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        });

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

        logLocalFileE2E('[HOST][SOURCE_PUBLISHED]');

        console.log("[LOCAL_E2E][HOST][SOURCE_PUBLISHED]", {
          roomId: get().room?.id || 'unknown',
          hostId: get().participantId,
          fileName: file.name,
          fileSize: file.size
        });

        console.log("[VIDEO_DEBUG][HOST][SOURCE_PUBLISHED]", {
          videoId: fileId,
          fileName: file.name,
          fileSize: file.size
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

    removeVideo: async () => {
      try {
        await get().startStreamingFile(null);
        await realtimeService.updatePlayback({
          sourceType: 'url',
          sourceUrl: '',
          fileName: '',
          fileSize: 0,
          isPlaying: false,
          playing: false,
          currentTime: 0,
          videoId: ''
        });
      } catch (err: any) {
        logger.error('Failed to remove video:', err.message);
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

              const oldSubUrl = get().p2pSubtitleUrl;
              if (oldSubUrl) {
                URL.revokeObjectURL(oldSubUrl);
              }

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
                floatingReactions: [],
                p2pSubtitleName: null,
                p2pSubtitleUrl: null
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
                // Prevent WebRTC glare/collision by having only the lexicographically smaller ID initiate the connection
                if (selfId && selfId < p.id) {
                  webrtcService.connectToPeer(p.id, p.name);
                }
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
          console.log("[VIDEO_DEBUG][STATE_APPLIED]", {
            sourceType: playbackState.sourceType,
            sourceUrl: playbackState.sourceUrl,
            videoId: playbackState.videoId,
            currentTime: playbackState.currentTime,
            playing: playbackState.playing,
            stateVersion: playbackState.stateVersion,
            eventId: playbackState.eventId
          });
          console.log("[PLAYBACK_TRACE]", {
            event_id: playbackState.eventId,
            state_version: playbackState.stateVersion,
            playing: playbackState.playing,
            current_time: playbackState.currentTime,
            source_url: playbackState.sourceUrl,
            source_type: playbackState.sourceType
          });
          set({ playbackState });

          if (!playbackState.fileName) {
            const currentUrl = get().p2pObjectUrl;
            if (currentUrl) {
              URL.revokeObjectURL(currentUrl);
            }
            set({
              p2pActiveFileId: null,
              p2pProgress: 0,
              p2pReceivedBytes: 0,
              p2pBufferedChunks: new Map(),
              p2pObjectUrl: null,
              isP2PBuffering: false,
              lastP2PUrlUpdateTime: null
            });
            return;
          }

          const isLocal = playbackState.sourceType === 'local';
          const selfId = get().participantId;
          const hostId = get().room?.hostId;
          const isSelfHost = hostId === selfId;
          const fileId = playbackState.videoId;

          if (isLocal && !isSelfHost && fileId) {
            logLocalFileE2E('[GUEST][SOURCE_RECEIVED]');
            logLocalTransfer('[GUEST][SOURCE_RECEIVED]');
            if (hostId) {
              logLocalFileE2E('[GUEST][HOST_ID_RESOLVED]');
              logLocalTransfer('[GUEST][HOST_RESOLVED]');
            }

            console.log("[LOCAL_E2E][GUEST][SOURCE_RECEIVED]", {
              roomId: get().room?.id || 'unknown',
              hostId,
              guestId: selfId,
              fileName: playbackState.fileName,
              fileSize: playbackState.fileSize,
              MIMEtype: playbackState.fileName?.endsWith('.webm') ? 'video/webm' : 'video/mp4'
            });
            console.log("[LOCAL_E2E][GUEST][HOST_ID]", {
              hostId
            });

            const peerConnectionExists = webrtcService.hasPeerConnection(hostId || '');
            if (peerConnectionExists) {
              logLocalFileE2E('[GUEST][PEER_FOUND]');
              logLocalTransfer('[GUEST][PEER_FOUND]');
            }

            const pc = (webrtcService as any).pcs?.get(hostId || '');
            console.log("[LOCAL_E2E][GUEST][PEER_CONNECTION]", {
              connectionState: pc ? pc.connectionState : 'none',
              iceConnectionState: pc ? pc.iceConnectionState : 'none'
            });

            const dataChannelState = webrtcService.getDataChannelState(hostId || '');
            if (dataChannelState) {
              logLocalFileE2E('[GUEST][DATA_CHANNEL_STATE]');
              logLocalTransfer('[GUEST][CHANNEL_FOUND]');
              logLocalTransfer('[GUEST][CHANNEL_STATE]');
            }

            console.log("[LOCAL_E2E][GUEST][DATA_CHANNEL_STATE]", {
              readyState: dataChannelState || 'not_found'
            });

            console.log("[VIDEO_DEBUG][LOCAL][GUEST_SOURCE_RECEIVED]");
            console.log("[VIDEO_DEBUG][LOCAL][GUEST_HOST_LOOKUP]", {
              hostId,
              participantId: selfId,
              peerConnectionExists,
              dataChannelExists: dataChannelState !== null
            });
            console.log("[VIDEO_DEBUG][LOCAL][GUEST_DATA_CHANNEL]", {
              readyState: dataChannelState || 'not_found'
            });

            const currentFileId = get().p2pActiveFileId;
            if (currentFileId !== fileId) {
              console.log("[VIDEO_DEBUG][GUEST][SOURCE_RECEIVED]", {
                fileName: playbackState.fileName,
                fileSize: playbackState.fileSize,
                videoId: fileId
              });
              console.log("[VIDEO_DEBUG][GUEST][HOST_ID]", {
                hostId,
                localParticipantId: selfId
              });
              console.log("[VIDEO_TRACE][GUEST] SOURCE_EVENT", {
                fileName: playbackState.fileName,
                fileSize: playbackState.fileSize,
                videoId: fileId,
                hostId
              });
              // New P2P streaming file: Reset buffer and request initial chunk batch
              set({
                p2pActiveFileId: fileId,
                p2pProgress: 0,
                p2pReceivedBytes: 0,
                p2pBufferedChunks: new Map(),
                p2pObjectUrl: null,
                isP2PBuffering: true,
                lastP2PUrlUpdateTime: null
              });
              webrtcService.requestFileChunk(fileId, 0);
              const totalChunks = Math.ceil((playbackState.fileSize || 65536) / 65536);
              const batchCount = Math.min(4, totalChunks);
              for (let i = 1; i < batchCount; i++) {
                webrtcService.requestFileChunk(fileId, i);
              }
            } else {
              // Resuming transfer: Locate missing indices and request next batch
              const buffers = get().p2pBufferedChunks;
              let nextIndex = 0;
              while (buffers.has(nextIndex)) {
                nextIndex++;
              }
              const total = Math.ceil((playbackState.fileSize || 65536) / 65536);
              for (let i = 0; i < 4 && nextIndex + i < total; i++) {
                if (!buffers.has(nextIndex + i)) {
                  webrtcService.requestFileChunk(fileId, nextIndex + i);
                }
              }
            }
          }
        },

        onChatMessage: (chatMsg) => {
          if (chatMsg.content === 'SYSTEM_WATCH_PARTY_FINISHED') {
            set({ isWatchPartyFinished: true });
            return;
          }

          const getChatDebugInfo = (ts: any) => {
            const tsNum = Number(ts);
            const date = new Date(tsNum);
            const iso = isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString();
            const formatted = isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return {
              timestamp: ts,
              typeofTimestamp: typeof ts,
              isoRepresentation: iso,
              formattedLocalTime: formatted
            };
          };

          console.log("[CHAT_DEBUG][STORE]", {
            messageId: chatMsg.id,
            ...getChatDebugInfo(chatMsg.timestamp)
          });

          console.log("[CHAT_TRACE]", {
            stage: 'zustand_store',
            messageId: chatMsg.id,
            timestamp: chatMsg.timestamp,
            timestampType: typeof chatMsg.timestamp,
            videoTimestamp: chatMsg.videoTimestamp,
            senderId: chatMsg.senderId,
            content: chatMsg.content
          });

          set((state) => {
            const activity = { ...state.sessionStats.activityCount };
            activity[chatMsg.senderId] = (activity[chatMsg.senderId] || 0) + 1;

            let updatedMessages = [...state.chatMessages, chatMsg].slice(-100);
            
            // Map and resolve replyToMessage references dynamically
            updatedMessages = updatedMessages.map(msg => {
              if (msg.replyToId && !msg.replyToMessage) {
                const original = updatedMessages.find(m => m.id === msg.replyToId);
                if (original) {
                  return { ...msg, replyToMessage: original };
                }
              }
              return msg;
            });

            return {
              chatMessages: updatedMessages,
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
          logger.info(`Received data channel [${label}] from ${peerId}`);
          if (label === 'SUBTITLE') {
            try {
              const sub = JSON.parse(message);
              const oldUrl = get().p2pSubtitleUrl;
              if (oldUrl) {
                URL.revokeObjectURL(oldUrl);
              }
              const blob = new Blob([sub.content], { type: 'text/vtt' });
              const url = URL.createObjectURL(blob);
              set({ p2pSubtitleName: sub.name, p2pSubtitleUrl: url });
            } catch (e: any) {
              logger.error('Failed to parse incoming subtitle data:', e.message);
            }
          } else if (label === 'SUBTITLE_CLEAR') {
            const oldUrl = get().p2pSubtitleUrl;
            if (oldUrl) {
              URL.revokeObjectURL(oldUrl);
            }
            set({ p2pSubtitleName: null, p2pSubtitleUrl: null });
          }
        },
        onTransferProgress: ({ fileId: _fileId, progress, receivedBytes }) => {
          set({ p2pProgress: progress, p2pReceivedBytes: receivedBytes });
        },
        onChunkReceived: ({ fileId, chunkIndex, totalChunks, buffer }) => {
          set((state) => {
            const buffers = new Map(state.p2pBufferedChunks);
            buffers.set(chunkIndex, buffer);

            let p2pObjectUrl = state.p2pObjectUrl;
            const prevProgress = Math.round((state.p2pBufferedChunks.size / totalChunks) * 100);
            const progress = Math.round((buffers.size / totalChunks) * 100);

            const progressChanged = progress !== prevProgress;
            const now = Date.now();

            const shouldRecreateUrl = buffers.size === totalChunks && progressChanged;

            let lastP2PUrlUpdateTime = state.lastP2PUrlUpdateTime;

            if (shouldRecreateUrl) {
              let totalReceivedBytes = 0;
              buffers.forEach((buf) => {
                totalReceivedBytes += buf.byteLength;
              });

              const expectedChunkCount = totalChunks;
              const chunkCount = buffers.size;
              const originalFileSize = state.playbackState.fileSize || 0;
              const receivedByteCount = totalReceivedBytes;

              // Calculate missing chunks count
              let missingChunkCount = 0;
              const missingIndices: number[] = [];
              for (let i = 0; i < expectedChunkCount; i++) {
                if (!buffers.has(i)) {
                  missingChunkCount++;
                  missingIndices.push(i);
                }
              }

              let fileType = 'video/mp4';
              const fileName = state.playbackState.fileName?.toLowerCase() || '';
              if (fileName.endsWith('.webm') || fileName.endsWith('.mkv')) {
                fileType = 'video/webm';
              } else if (fileName.endsWith('.ogg') || fileName.endsWith('.ogv')) {
                fileType = 'video/ogg';
              } else if (fileName.endsWith('.mov')) {
                fileType = 'video/mp4';
              }

              // Integrity check logs
              console.log("[LOCAL_FILE_E2E][GUEST][INTEGRITY_CHECK]", {
                originalFileSize,
                receivedByteCount,
                chunkCount,
                missingChunkCount,
                expectedChunkCount,
                mimeType: fileType
              });

              const isIntegrityValid = missingChunkCount === 0 && receivedByteCount > 0;

              if (!isIntegrityValid) {
                console.error("[LOCAL_FILE_E2E][GUEST][INTEGRITY_FAILED]", {
                  originalFileSize,
                  receivedByteCount,
                  missingChunkCount,
                  missingChunks: missingIndices
                });
              } else {
                const parts: ArrayBuffer[] = [];
                for (let i = 0; i < totalChunks; i++) {
                  parts.push(buffers.get(i)!);
                }

                const blob = new Blob(parts, { type: fileType });
                if (p2pObjectUrl) {
                  URL.revokeObjectURL(p2pObjectUrl);
                }
                p2pObjectUrl = URL.createObjectURL(blob);
                lastP2PUrlUpdateTime = now;

                logLocalFileE2E('[GUEST][BLOB_CREATED]', {
                  bytesReceived: blob.size,
                  totalBytes: blob.size
                });

                logLocalFileE2E('[GUEST][OBJECT_URL_CREATED]');
                logLocalFileE2E('[GUEST][VIDEO_SRC_ASSIGNED]');
              }
            }

            const isBuffering = buffers.size < totalChunks;

            return {
              p2pBufferedChunks: buffers,
              p2pObjectUrl,
              isP2PBuffering: isBuffering,
              lastP2PUrlUpdateTime
            };
          });

          // Pipelined chunk requests (request ahead up to 4 missing chunks)
          const windowAhead = 4;
          for (let w = 1; w <= windowAhead; w++) {
            const nextIdx = chunkIndex + w;
            if (nextIdx < totalChunks) {
              webrtcService.requestFileChunk(fileId, nextIdx);
            }
          }
        }
      });
    }
  };
});

interface RoomState {
  setupServiceListeners: () => void;
}
