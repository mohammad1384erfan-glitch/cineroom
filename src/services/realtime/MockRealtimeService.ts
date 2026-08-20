import { Room, Participant, PlaybackState, ChatMessage, QueueItem, RealtimeEventListeners, UserPermissions, ReactionEvent, ClientSession } from './types';
import { RealtimeService } from './RealtimeService';
import { logger } from '../diagnostics/logger';

// Sync actions for BroadcastChannel communication
interface SyncMessage {
  type: 'CHAT' | 'PLAYBACK' | 'PARTICIPANTS' | 'QUEUE' | 'SETTINGS' | 'REACTION' | 'SIGNALING' | 'KICK' | 'TEARDOWN';
  senderId: string;
  payload: any;
}

export class MockRealtimeService implements RealtimeService {
  private activeRoomId: string | null = null;
  private localParticipantId: string | null = null;
  private listeners: RealtimeEventListeners = {};
  private presenceTimerId: any = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private simulatedLatencyMs = 40;
  private peerDisconnectCounters: Map<string, number> = new Map();

  constructor() {
    logger.info('Secure LocalStorageRealtimeService initialized.');
    this.attachUnloadListener();
  }

  // --- CRYPTO HELPERS ---

  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private sanitizeInput(input: string): string {
    if (!input) return '';
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  private generateRoomId(): string {
    return self.crypto.randomUUID();
  }

  private generateRoomCode(): string {
    // Generate secure 6-character alphanumeric uppercase code
    const array = new Uint8Array(6);
    self.crypto.getRandomValues(array);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars O, I, 1, 0
    return Array.from(array).map(val => chars[val % chars.length]).join('');
  }

  // --- LOCALSTORAGE DB METHODS ---

  private saveItem(key: string, data: any) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private readItem<T>(key: string): T | null {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  private deleteItem(key: string) {
    localStorage.removeItem(key);
  }

  // Load and save functions for specific rooms
  private getRoom(roomId: string): Room | null {
    return this.readItem<Room>(`cineroom_room_${roomId}`);
  }

  private saveRoom(room: Room) {
    this.saveItem(`cineroom_room_${room.id}`, room);
  }

  private getParticipants(roomId: string): Participant[] {
    return this.readItem<Participant[]>(`cineroom_participants_${roomId}`) || [];
  }

  private saveParticipants(roomId: string, participants: Participant[]) {
    this.saveItem(`cineroom_participants_${roomId}`, participants);
  }

  private getPlaybackState(roomId: string): PlaybackState {
    const state = this.readItem<PlaybackState>(`cineroom_playback_${roomId}`);
    if (state) return state;
    return {
      sourceType: 'url',
      sourceUrl: '',
      fileName: '',
      fileSize: 0,
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
      videoId: '',
      playing: false,
      lastUpdateTimestamp: Date.now(),
      stateVersion: 0,
      eventId: ''
    };
  }

  private savePlaybackState(roomId: string, state: PlaybackState) {
    this.saveItem(`cineroom_playback_${roomId}`, state);
  }

  private getChatMessages(roomId: string): ChatMessage[] {
    return this.readItem<ChatMessage[]>(`cineroom_chat_${roomId}`) || [];
  }

  private saveChatMessages(roomId: string, messages: ChatMessage[]) {
    this.saveItem(`cineroom_chat_${roomId}`, messages);
  }

  private getQueue(roomId: string): QueueItem[] {
    return this.readItem<QueueItem[]>(`cineroom_queue_${roomId}`) || [];
  }

  private saveQueue(roomId: string, queue: QueueItem[]) {
    this.saveItem(`cineroom_queue_${roomId}`, queue);
  }

  // Index map of roomCode -> roomId
  private getRoomIdByCode(code: string): string | null {
    const codesIndex = this.readItem<Record<string, string>>('cineroom_codes_index') || {};
    return codesIndex[code.toUpperCase()] || null;
  }

  private registerRoomCode(code: string, roomId: string) {
    const codesIndex = this.readItem<Record<string, string>>('cineroom_codes_index') || {};
    codesIndex[code.toUpperCase()] = roomId;
    this.saveItem('cineroom_codes_index', codesIndex);
  }

  private unregisterRoomCode(code: string) {
    const codesIndex = this.readItem<Record<string, string>>('cineroom_codes_index') || {};
    delete codesIndex[code.toUpperCase()];
    this.saveItem('cineroom_codes_index', codesIndex);
  }

  // --- MULTI-TAB BROADCAST CHANNEL SYNC ---

  private subscribeToRoomChannel(roomId: string) {
    this.unsubscribeFromRoomChannel();
    this.broadcastChannel = new BroadcastChannel(`cineroom_sync_${roomId}`);
    
    this.broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      if (msg.senderId === this.localParticipantId) return; // ignore self broadcasts
      this.handleSyncMessage(msg);
    };
  }

  private unsubscribeFromRoomChannel() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }

  private broadcast(type: SyncMessage['type'], payload: any) {
    if (this.broadcastChannel && this.localParticipantId) {
      this.broadcastChannel.postMessage({
        type,
        senderId: this.localParticipantId,
        payload
      });
    }
  }

  private handleSyncMessage(msg: SyncMessage) {
    if (!this.activeRoomId) return;
    
    logger.realtime(`Sync Broadcast RECEIVED: Type [${msg.type}]`);

    const room = this.getRoom(this.activeRoomId);
    if (!room) return;

    switch (msg.type) {
      case 'CHAT': {
        const chat = msg.payload as ChatMessage;
        if (chat.isSystem) {
          // Only host or system can trigger system messages
          if (msg.senderId !== 'system' && msg.senderId !== room.hostId) {
            logger.error(`Security Alert: System chat injection rejected.`);
            return;
          }
        } else {
          const currentList = this.getParticipants(this.activeRoomId);
          const sender = currentList.find(p => p.id === msg.senderId);
          if (!sender || (!sender.isHost && !sender.permissions.canChat)) {
            logger.error(`Security Alert: Chat message broadcast rejected due to missing permissions.`);
            return;
          }
          // Input Security: Prevent chat injection and XSS
          chat.content = this.sanitizeInput(chat.content);
        }

        // Save locally and propagate
        const chatMessages = this.getChatMessages(this.activeRoomId);
        chatMessages.push(chat);
        this.saveChatMessages(this.activeRoomId, chatMessages.slice(-100));

        if (this.listeners.onChatMessage) {
          this.listeners.onChatMessage(chat);
        }
        break;
      }
      case 'PLAYBACK': {
        const state = msg.payload as PlaybackState;
        const currentList = this.getParticipants(this.activeRoomId);
        const sender = currentList.find(p => p.id === msg.senderId);

        // Verification: If not host, must have permissions
        if (msg.senderId !== room.hostId) {
          if (!sender) return; // Unknown user
          // Check what changed
          const current = this.getPlaybackState(this.activeRoomId);
          const changedPlayPause = (state.isPlaying !== current.isPlaying || state.playing !== current.playing);
          const changedSeek = (Math.abs(state.currentTime - current.currentTime) > 3); // 3s allowance
          const changedSource = (state.sourceUrl !== current.sourceUrl);

          if (changedPlayPause && !sender.permissions.canPlayPause) {
            logger.error(`Security Alert: Non-authorized playback play/pause attempt by ${sender.name}`);
            return;
          }
          if (changedSeek && !sender.permissions.canSeek) {
            logger.error(`Security Alert: Non-authorized playback seek attempt by ${sender.name}`);
            return;
          }
          if (changedSource && !sender.permissions.canChangeVideo) {
            logger.error(`Security Alert: Non-authorized playback source change attempt by ${sender.name}`);
            return;
          }
        }

        const current = this.getPlaybackState(this.activeRoomId);
        if (state.stateVersion <= current.stateVersion) {
          logger.info(`Sync: Discarding stale playback event (incoming: v${state.stateVersion}, local: v${current.stateVersion})`);
          return;
        }
        this.savePlaybackState(this.activeRoomId, state);
        if (this.listeners.onPlaybackChange) {
          this.listeners.onPlaybackChange(state);
        }
        break;
      }
      case 'PARTICIPANTS': {
        const list = msg.payload as Participant[];
        const isFromHost = msg.senderId === room.hostId;

        if (isFromHost) {
          // Accept fully from host
          this.saveParticipants(this.activeRoomId, list);
          if (this.listeners.onParticipantsChange) {
            this.listeners.onParticipantsChange(list);
          }
        } else {
          // Non-host: Only allow update to their own connectionDetails/ping, reject permissions or isHost tampering
          const currentList = this.getParticipants(this.activeRoomId);
          const senderEntry = list.find(p => p.id === msg.senderId);
          if (senderEntry) {
            const updatedList = currentList.map((p) => {
              if (p.id === msg.senderId) {
                return {
                  ...p,
                  ping: senderEntry.ping,
                  connectionStatus: senderEntry.connectionStatus,
                  isConnected: senderEntry.isConnected,
                  isSpeaking: senderEntry.isSpeaking
                };
              }
              return p;
            });
            this.saveParticipants(this.activeRoomId, updatedList);
            if (this.listeners.onParticipantsChange) {
              this.listeners.onParticipantsChange(updatedList);
            }
          }
        }
        break;
      }
      case 'QUEUE': {
        const queue = msg.payload as QueueItem[];
        const currentList = this.getParticipants(this.activeRoomId);
        const sender = currentList.find(p => p.id === msg.senderId);

        if (msg.senderId !== room.hostId) {
          if (!sender) return;
          // Check if queue is locked
          if (room.isQueueLocked) {
            logger.error(`Security Alert: Queue mutation rejected because queue is locked.`);
            return;
          }
          if (!sender.permissions.canQueue) {
            logger.error(`Security Alert: Queue mutation rejected due to missing permissions for ${sender.name}`);
            return;
          }
          
          // Participant cannot clear the entire queue or reorder items arbitrarily!
          // They can only append an item, or remove an item that they added themselves!
          const currentQueue = this.getQueue(this.activeRoomId);
          const removedItems = currentQueue.filter(cq => !queue.some(q => q.id === cq.id));

          const isReordered = queue.length === currentQueue.length && queue.some((q, idx) => q.id !== currentQueue[idx].id);
          if (isReordered) {
            logger.error(`Security Alert: Non-host user ${sender.name} attempted to reorder queue.`);
            return;
          }

          const unauthorizedRemoval = removedItems.some(item => item.addedBy !== sender.name);
          if (unauthorizedRemoval) {
            logger.error(`Security Alert: Non-host user ${sender.name} attempted to remove another user's queue item.`);
            return;
          }
        }

        this.saveQueue(this.activeRoomId, queue);
        if (this.listeners.onQueueChange) {
          this.listeners.onQueueChange(queue);
        }
        break;
      }
      case 'SETTINGS': {
        const settingsRoom = msg.payload as Room;
        if (msg.senderId !== room.hostId) {
          logger.error(`Security Alert: Settings change broadcast rejected from non-host.`);
          return;
        }
        this.saveRoom(settingsRoom);
        if (this.listeners.onRoomUpdate) {
          this.listeners.onRoomUpdate(settingsRoom);
        }
        break;
      }
      case 'REACTION': {
        const react = msg.payload as ReactionEvent;
        const currentList = this.getParticipants(this.activeRoomId);
        const sender = currentList.find(p => p.id === msg.senderId);
        if (!sender || (!sender.isHost && !sender.permissions.canReact)) {
          logger.error(`Security Alert: Reaction broadcast rejected due to missing permissions.`);
          return;
        }
        if (this.listeners.onReactionReceived) {
          this.listeners.onReactionReceived(react);
        }
        break;
      }
      case 'SIGNALING': {
        const { targetId, type, payload } = msg.payload;
        if (targetId === this.localParticipantId && this.listeners.onSignalingMessage) {
          this.listeners.onSignalingMessage({ senderId: msg.senderId, type, payload });
        }
        break;
      }
      case 'KICK': {
        const targetId = msg.payload as string;
        if (msg.senderId !== room.hostId) {
          logger.error(`Security Alert: Kick instruction rejected from non-host.`);
          return;
        }
        if (targetId === this.localParticipantId) {
          logger.error('Boot notification received. Processing ejection.');
          this.leaveRoom();
          window.location.reload();
        }
        break;
      }
      case 'TEARDOWN': {
        if (msg.senderId !== room.hostId) {
          logger.error(`Security Alert: Teardown instruction rejected from non-host.`);
          return;
        }
        logger.error('Teardown command received. Leaving watchroom.');
        this.leaveRoom();
        window.location.reload();
        break;
      }
    }
  }

  // --- SERVICE INTERFACE IMPLEMENTATION ---

  public setListeners(listeners: RealtimeEventListeners): void {
    this.listeners = listeners;
    logger.info('Realtime listeners connected.');
  }

  public clearListeners(): void {
    this.listeners = {};
    logger.info('Realtime listeners cleared.');
  }

  public simulateLatency(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getFullPermissions(): UserPermissions {
    return {
      canPlayPause: true,
      canSeek: true,
      canChangeVideo: true,
      canQueue: true,
      canChat: true,
      canReact: true
    };
  }

  public async createRoom(
    name: string, 
    capacity: number, 
    password?: string,
    hostNickname?: string,
    hostAvatar?: string,
    theme?: string
  ): Promise<{ room: Room; participantId: string }> {
    await this.delay(200);

    const roomId = this.generateRoomId();
    const code = this.generateRoomCode();
    const participantId = 'usr-host-' + Math.random().toString(36).substring(2, 6);

    // Cryptographic Password Hashing
    let passwordHash: string | undefined;
    if (password) {
      passwordHash = await this.hashPassword(password);
    }

    const cleanRoomName = this.sanitizeInput(name?.trim() || 'CineRoom Watch').slice(0, 30);
    const cleanHostNickname = this.sanitizeInput(hostNickname?.trim() || 'Host').slice(0, 20);
    const cleanCapacity = Math.max(2, Math.min(6, capacity));

    const room: Room = {
      id: roomId,
      name: cleanRoomName,
      code,
      capacity: cleanCapacity,
      hasPassword: !!password,
      hostId: participantId,
      isLocked: false,
      isQueueLocked: false,
      theme: theme || 'cinema'
    };

    const hostParticipant: Participant = {
      id: participantId,
      name: cleanHostNickname,
      avatar: hostAvatar || '🐼',
      isHost: true,
      joinedAt: Date.now(),
      ping: this.simulatedLatencyMs,
      isMuted: false,
      isConnected: true,
      permissions: this.getFullPermissions(),
      connectionStatus: 'connected',
      isSpeaking: false
    };

    // Save schemas in localStorage
    this.saveRoom(room);
    if (passwordHash) {
      this.saveItem(`cineroom_hash_${roomId}`, passwordHash);
    }
    this.saveParticipants(roomId, [hostParticipant]);
    this.savePlaybackState(roomId, {
      sourceType: 'url',
      sourceUrl: '',
      fileName: '',
      fileSize: 0,
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
      videoId: '',
      playing: false,
      lastUpdateTimestamp: Date.now(),
      stateVersion: 0,
      eventId: ''
    });
    this.saveChatMessages(roomId, []);
    this.saveQueue(roomId, []);
    this.registerRoomCode(code, roomId);

    // Cache Session (Never store raw passwords!)
    const session: ClientSession = {
      roomId,
      participantId,
      nickname: hostParticipant.name,
      avatar: hostParticipant.avatar
    };
    this.saveItem('cineroom_active_session', session);

    this.activeRoomId = roomId;
    this.localParticipantId = participantId;

    this.subscribeToRoomChannel(roomId);
    this.startPresenceLoop();

    logger.realtime(`Secure room created: "${room.name}" (Code: ${code}, ID: ${roomId})`);
    return { room, participantId };
  }

  public async joinRoom(
    code: string, 
    nickname: string, 
    avatar: string, 
    password?: string
  ): Promise<{ room: Room; participantId: string }> {
    await this.delay(300);

    const roomId = this.getRoomIdByCode(code.trim().toUpperCase());
    
    // Privacy: Do not reveal whether room exists through specific error
    if (!roomId) {
      logger.error('Access Denied: Code not registered in indexes.');
      throw new Error('Unable to join room. Please verify the code and password.');
    }

    const room = this.getRoom(roomId);
    if (!room) {
      logger.error('Access Denied: Room schema missing.');
      throw new Error('Unable to join room. Please verify the code and password.');
    }

    // Password hashing check
    if (room.hasPassword) {
      const savedHash = this.readItem<string>(`cineroom_hash_${roomId}`);
      const inputHash = password ? await this.hashPassword(password) : '';
      if (savedHash !== inputHash) {
        logger.error('Access Denied: Password hash mismatch.');
        throw new Error('Unable to join room. Please verify the code and password.');
      }
    }

    // Lock check
    if (room.isLocked) {
      logger.error('Access Denied: Room is locked by Host.');
      throw new Error('Unable to join room. This room is locked by the Host.');
    }

    const participants = this.getParticipants(roomId);

    // Capacity checks
    if (participants.length >= room.capacity) {
      logger.error(`Access Denied: Capacity filled: ${participants.length}/${room.capacity}`);
      throw new Error('Unable to join room. Room is at maximum capacity.');
    }

    const cleanNickname = this.sanitizeInput(nickname?.trim() || 'Peer').slice(0, 20);
    const participantId = 'usr-' + Math.random().toString(36).substring(2, 6);
    const newParticipant: Participant = {
      id: participantId,
      name: cleanNickname,
      avatar: avatar || '🐱',
      isHost: participants.length === 0,
      joinedAt: Date.now(),
      ping: this.simulatedLatencyMs,
      isMuted: false,
      isConnected: true,
      permissions: this.getFullPermissions(),
      connectionStatus: 'connected',
      isSpeaking: false
    };

    if (newParticipant.isHost) {
      room.hostId = participantId;
      this.saveRoom(room);
    }

    participants.push(newParticipant);
    this.saveParticipants(roomId, participants);

    // Save system join message in chat logs and broadcast it
    const chatMessages = this.getChatMessages(roomId);
    const joinMsg: ChatMessage = {
      id: 'sys-' + Math.random().toString(36).substring(2, 8),
      senderId: 'system',
      senderName: 'System',
      senderAvatar: '',
      content: `${newParticipant.name} joined the watch party`,
      timestamp: Date.now(),
      isSystem: true
    };
    chatMessages.push(joinMsg);
    this.saveChatMessages(roomId, chatMessages);
    this.broadcast('CHAT', joinMsg);

    // Save session
    const session: ClientSession = {
      roomId,
      participantId,
      nickname: newParticipant.name,
      avatar: newParticipant.avatar
    };
    this.saveItem('cineroom_active_session', session);

    this.activeRoomId = roomId;
    this.localParticipantId = participantId;

    this.subscribeToRoomChannel(roomId);
    this.startPresenceLoop();

    // Broadcast participants update to other tabs
    this.broadcast('PARTICIPANTS', participants);

    logger.realtime(`User [${nickname}] joined watchroom "${room.name}".`);
    return { room, participantId };
  }

  public async leaveRoom(): Promise<void> {
    if (!this.activeRoomId || !this.localParticipantId) return;

    logger.realtime(`Participant [${this.localParticipantId}] leaving watchroom...`);
    this.stopPresenceLoop();
    this.deleteItem('cineroom_active_session');

    const roomId = this.activeRoomId;
    const participantId = this.localParticipantId;

    this.activeRoomId = null;
    this.localParticipantId = null;

    const participants = this.getParticipants(roomId);
    const leavingParticipant = participants.find(p => p.id === participantId);
    const updatedParticipants = participants.filter(p => p.id !== participantId);
    this.saveParticipants(roomId, updatedParticipants);

    const room = this.getRoom(roomId);

    if (updatedParticipants.length === 0) {
      // Room teardown - count is 0
      logger.realtime(`Room [${roomId}] count is 0. Executing destruction cleanup.`);
      this.teardownRoom(roomId, room?.code);
    } else {
      // Log system chat announcement
      if (leavingParticipant) {
        const chatMessages = this.getChatMessages(roomId);
        const leaveMsg: ChatMessage = {
          id: 'sys-' + Math.random().toString(36).substring(2, 8),
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '',
          content: `${leavingParticipant.name} left the room`,
          timestamp: Date.now(),
          isSystem: true
        };
        chatMessages.push(leaveMsg);
        this.saveChatMessages(roomId, chatMessages);
        this.broadcast('CHAT', leaveMsg);
      }

      // Host Hand-off logic if Host leaves
      if (room && room.hostId === participantId) {
        const nextHost = updatedParticipants.reduce((oldest, current) => {
          return current.joinedAt < oldest.joinedAt ? current : oldest;
        }, updatedParticipants[0]);

        nextHost.isHost = true;
        nextHost.permissions = this.getFullPermissions();
        room.hostId = nextHost.id;

        this.saveRoom(room);
        this.broadcast('SETTINGS', room);
        logger.realtime(`Host left. Host role handed off to [${nextHost.name}].`);
      }

      this.broadcast('PARTICIPANTS', updatedParticipants);
    }

    this.unsubscribeFromRoomChannel();
    await this.delay(100);
  }

  public async endRoom(): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost) throw new Error('Only the Host can end the room.');

    const room = this.getRoom(roomId);
    
    // Broadcast TEARDOWN to eject all connected tabs
    this.broadcast('TEARDOWN', roomId);

    // Teardown storage states
    this.teardownRoom(roomId, room?.code);

    // Exit locally
    this.stopPresenceLoop();
    this.deleteItem('cineroom_active_session');
    this.activeRoomId = null;
    this.localParticipantId = null;
    this.unsubscribeFromRoomChannel();
  }

  private teardownRoom(roomId: string, code?: string) {
    this.deleteItem(`cineroom_room_${roomId}`);
    this.deleteItem(`cineroom_hash_${roomId}`);
    this.deleteItem(`cineroom_participants_${roomId}`);
    this.deleteItem(`cineroom_playback_${roomId}`);
    this.deleteItem(`cineroom_chat_${roomId}`);
    this.deleteItem(`cineroom_queue_${roomId}`);
    
    if (code) {
      this.unregisterRoomCode(code);
    }
  }

  public async updatePlayback(state: Partial<PlaybackState>): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    // Permissions check
    if (!self.isHost) {
      if ((state.isPlaying !== undefined || state.playing !== undefined) && !self.permissions.canPlayPause) {
        throw new Error('You do not have permission to play/pause.');
      }
      if (state.currentTime !== undefined && !self.permissions.canSeek) {
        throw new Error('You do not have permission to seek.');
      }
      if (state.sourceUrl !== undefined && !self.permissions.canChangeVideo) {
        throw new Error('You do not have permission to change video source.');
      }
    }

    const current = this.getPlaybackState(roomId);
    
    // Increment version
    const nextVersion = current.stateVersion + 1;
    
    // Handle mappings for playing & isPlaying properties
    const isPlaying = state.isPlaying !== undefined ? state.isPlaying : (state.playing !== undefined ? state.playing : current.isPlaying);
    const playing = state.playing !== undefined ? state.playing : (state.isPlaying !== undefined ? state.isPlaying : current.playing);
    const videoId = state.videoId !== undefined ? state.videoId : (state.sourceUrl !== undefined ? state.sourceUrl : current.videoId);

    const cleanFileName = state.fileName !== undefined ? (state.fileName ? this.sanitizeInput(state.fileName).slice(0, 100) : '') : current.fileName;
    const cleanSourceUrl = state.sourceUrl !== undefined ? (state.sourceUrl ? this.sanitizeInput(state.sourceUrl).slice(0, 1000) : '') : current.sourceUrl;

    const updated: PlaybackState = {
      ...current,
      ...state,
      fileName: cleanFileName,
      sourceUrl: cleanSourceUrl,
      isPlaying,
      playing,
      videoId,
      lastUpdateTimestamp: Date.now(),
      stateVersion: nextVersion,
      eventId: 'evt-' + Math.random().toString(36).substring(2, 8),
      updatedAt: Date.now()
    };

    this.savePlaybackState(roomId, updated);
    this.broadcast('PLAYBACK', updated);

    if (this.listeners.onPlaybackChange) {
      this.listeners.onPlaybackChange(updated);
    }
  }

  public async sendChatMessage(content: string): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost && !self.permissions.canChat) {
      throw new Error('You are muted by the Host.');
    }

    const cleanContent = this.sanitizeInput(content.trim()).slice(0, 500);
    if (!cleanContent) return;

    const chatMessages = this.getChatMessages(roomId);
    
    // Capture the current playhead position as videoTimestamp
    const playback = this.getPlaybackState(roomId);
    let videoTimestamp: number | undefined;
    if (playback && playback.fileName) {
      let currentPos = playback.currentTime;
      if (playback.isPlaying || playback.playing) {
        const elapsed = (Date.now() - playback.lastUpdateTimestamp) / 1000;
        currentPos += elapsed;
      }
      videoTimestamp = Math.max(0, currentPos);
    }

    const chatMsg: ChatMessage = {
      id: 'msg-' + Math.random().toString(36).substring(2, 8),
      senderId: self.id,
      senderName: self.name,
      senderAvatar: self.avatar,
      content: cleanContent,
      timestamp: Date.now(),
      videoTimestamp
    };

    chatMessages.push(chatMsg);
    this.saveChatMessages(roomId, chatMessages);
    this.broadcast('CHAT', chatMsg);
  }

  public async addToQueue(item: Omit<QueueItem, 'id' | 'addedBy' | 'avatar'>): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    const room = this.getRoom(roomId);
    if (!self.isHost) {
      if (room?.isQueueLocked) throw new Error('Watch queue is locked by Host.');
      if (!self.permissions.canQueue) throw new Error('You do not have queue privileges.');
    }

    const queue = this.getQueue(roomId);
    const cleanTitle = this.sanitizeInput(item.title.trim()).slice(0, 100);
    const cleanUrl = this.sanitizeInput(item.url.trim()).slice(0, 1000);
    const newItem: QueueItem = {
      ...item,
      title: cleanTitle,
      url: cleanUrl,
      id: 'q-' + Math.random().toString(36).substring(2, 6),
      addedBy: self.name,
      avatar: self.avatar
    };

    queue.push(newItem);
    this.saveQueue(roomId, queue);
    this.broadcast('QUEUE', queue);
  }

  public async removeFromQueue(itemId: string): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    const room = this.getRoom(roomId);
    if (!self.isHost) {
      if (room?.isQueueLocked) throw new Error('Watch queue is locked by Host.');
      if (!self.permissions.canQueue) throw new Error('You do not have queue privileges.');
    }

    const queue = this.getQueue(roomId);
    const updated = queue.filter(q => q.id !== itemId);
    this.saveQueue(roomId, updated);
    this.broadcast('QUEUE', updated);
  }

  public async reorderQueue(queue: QueueItem[]): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost) throw new Error('Only the Host can reorder watch queue.');

    this.saveQueue(roomId, queue);
    this.broadcast('QUEUE', queue);
  }

  public async updateRoomSettings(settings: Partial<Room>): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost) throw new Error('Only Host can adjust room settings.');

    const room = this.getRoom(roomId);
    if (room) {
      const updated = {
        ...room,
        ...settings
      };
      this.saveRoom(updated);
      this.broadcast('SETTINGS', updated);
    }
  }

  public async updateParticipantPermissions(targetId: string, permissions: UserPermissions): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost) throw new Error('Only Host can edit permissions.');

    const participants = this.getParticipants(roomId);
    const target = participants.find(p => p.id === targetId);
    if (target) {
      target.permissions = permissions;
      target.isMuted = !permissions.canChat;
      this.saveParticipants(roomId, participants);
      this.broadcast('PARTICIPANTS', participants);
      
      // If user chat permission was blocked, we trigger kick check to push update in real-time
      this.broadcast('SIGNALING', { targetId, type: 'permissions-adjust', payload: permissions });
    }
  }

  public async removeParticipant(targetId: string): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost) throw new Error('Only Host can remove users.');

    const participants = this.getParticipants(roomId);
    const updated = participants.filter(p => p.id !== targetId);
    this.saveParticipants(roomId, updated);
    
    // Broadcast kick message to the target tab
    this.broadcast('KICK', targetId);
    this.broadcast('PARTICIPANTS', updated);
  }

  public async transferHost(targetId: string): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost) throw new Error('Only the Host can transfer room ownership.');

    const room = this.getRoom(roomId);
    if (room) {
      room.hostId = targetId;
      this.saveRoom(room);

      const participants = this.getParticipants(roomId);
      const updated = participants.map((p) => ({
        ...p,
        isHost: p.id === targetId,
        permissions: p.id === targetId ? this.getFullPermissions() : p.permissions
      }));
      this.saveParticipants(roomId, updated);

      this.broadcast('SETTINGS', room);
      this.broadcast('PARTICIPANTS', updated);

      const target = participants.find(p => p.id === targetId);
      if (target) {
        const chatMessages = this.getChatMessages(roomId);
        const msg: ChatMessage = {
          id: 'sys-' + Math.random().toString(36).substring(2, 8),
          senderId: 'system',
          senderName: 'System',
          senderAvatar: '',
          content: `Host privileges transferred to ${target.name}`,
          timestamp: Date.now(),
          isSystem: true
        };
        chatMessages.push(msg);
        this.saveChatMessages(roomId, chatMessages);
        this.broadcast('CHAT', msg);
      }
    }
  }

  public async sendReaction(emoji: string): Promise<void> {
    const roomId = this.activeRoomId;
    const self = this.getSelf();
    if (!roomId || !self) throw new Error('Not connected');

    if (!self.isHost && !self.permissions.canReact) {
      throw new Error('You do not have reaction privileges.');
    }

    const react: ReactionEvent = {
      id: 'react-' + Math.random().toString(36).substring(2, 7),
      emoji,
      senderId: self.id,
      xOffset: Math.floor(Math.random() * 80) + 10,
      createdAt: Date.now()
    };

    // React is local to tabs, we send it out
    this.broadcast('REACTION', react);
    if (this.listeners.onReactionReceived) {
      this.listeners.onReactionReceived(react);
    }
  }

  public async sendSignaling(targetId: string, type: string, payload: any): Promise<void> {
    this.broadcast('SIGNALING', { targetId, type, payload });
  }

  // --- REFRESH / SESSION RESTORATION ---

  public async restoreSession(): Promise<{ room: Room; participantId: string } | null> {
    const session = this.readItem<ClientSession>('cineroom_active_session');
    if (!session) return null;

    logger.info('Session recovery detected. Querying storage schema...');
    const room = this.getRoom(session.roomId);
    if (!room) {
      logger.error('Session recovery rejected: room ended or expired.');
      this.deleteItem('cineroom_active_session');
      return null;
    }

    const participants = this.getParticipants(session.roomId);
    const selfInRoom = participants.find(p => p.id === session.participantId);
    
    if (!selfInRoom) {
      logger.error('Session recovery rejected: participant kicked.');
      this.deleteItem('cineroom_active_session');
      return null;
    }

    // Reconnect
    this.activeRoomId = session.roomId;
    this.localParticipantId = session.participantId;
    this.subscribeToRoomChannel(session.roomId);
    this.startPresenceLoop();

    logger.info(`Session recovered: User [${session.nickname}] in Room "${room.name}"`);

    // Proactively fire reactive updates so Zustand store mounts data instantly
    setTimeout(() => {
      if (this.listeners.onRoomUpdate) this.listeners.onRoomUpdate(room);
      if (this.listeners.onParticipantsChange) this.listeners.onParticipantsChange(participants);
      if (this.listeners.onPlaybackChange) this.listeners.onPlaybackChange(this.getPlaybackState(session.roomId));
      if (this.listeners.onQueueChange) this.listeners.onQueueChange(this.getQueue(session.roomId));
    }, 100);

    return { room, participantId: session.participantId };
  }

  // --- INTERNAL PRESENCE drift ---

  private startPresenceLoop() {
    this.presenceTimerId = setInterval(() => {
      if (!this.activeRoomId) return;
      let participants = this.getParticipants(this.activeRoomId);
      if (participants.length > 0) {

        participants.forEach((p) => {
          if (!p.connectionStatus) {
            p.connectionStatus = 'connected';
          }

          if (p.id === this.localParticipantId) {
            p.ping = this.simulatedLatencyMs + Math.floor(Math.random() * 8 - 4);
            p.connectionStatus = 'connected';
            p.isConnected = true;
            p.isSpeaking = p.isSpeaking || false;
            this.peerDisconnectCounters.delete(p.id);
          } else {
            p.ping = 40 + Math.floor(Math.random() * 25);
            
            // Presence status simulation drift
            if (p.connectionStatus === 'reconnecting') {
              const count = (this.peerDisconnectCounters.get(p.id) || 0) + 1;
              this.peerDisconnectCounters.set(p.id, count);

              if (count >= 4) { // 4 * 4s = 16 seconds grace period
                logger.error(`Grace period expired for peer [${p.name}]. Ejecting user.`);
                this.peerDisconnectCounters.delete(p.id);
                participants = participants.filter(x => x.id !== p.id);

                // Log system chat announcement
                const chatMessages = this.getChatMessages(this.activeRoomId!);
                const leaveMsg: ChatMessage = {
                  id: 'sys-' + Math.random().toString(36).substring(2, 8),
                  senderId: 'system',
                  senderName: 'System',
                  senderAvatar: '',
                  content: `${p.name} left the room`,
                  timestamp: Date.now(),
                  isSystem: true
                };
                chatMessages.push(leaveMsg);
                this.saveChatMessages(this.activeRoomId!, chatMessages);
                this.broadcast('CHAT', leaveMsg);
              }
            } else if (p.connectionStatus === 'connected') {
              this.peerDisconnectCounters.delete(p.id);
              if (Math.random() < 0.15) { // 15% chance to toggle to reconnecting
                p.connectionStatus = 'reconnecting';
                p.isConnected = false;
                p.isSpeaking = false;
              }
            }
          }
        });

        this.saveParticipants(this.activeRoomId, participants);
        this.broadcast('PARTICIPANTS', participants);

        if (this.listeners.onParticipantsChange) {
          this.listeners.onParticipantsChange([...participants]);
        }
      }
    }, 4000);
  }

  private stopPresenceLoop() {
    if (this.presenceTimerId) {
      clearInterval(this.presenceTimerId);
      this.presenceTimerId = null;
    }
  }

  private getSelf(): Participant | null {
    if (!this.activeRoomId || !this.localParticipantId) return null;
    return this.getParticipants(this.activeRoomId).find(p => p.id === this.localParticipantId) || null;
  }

  // Hook tab closing behaviors
  private attachUnloadListener() {
    window.addEventListener('beforeunload', () => {
      if (this.activeRoomId && this.localParticipantId) {
        // Run standard leave sync tasks quickly on unload
        const roomId = this.activeRoomId;
        const participantId = this.localParticipantId;
        const participants = this.getParticipants(roomId);
        const updated = participants.filter(p => p.id !== participantId);
        
        this.saveParticipants(roomId, updated);
        this.deleteItem('cineroom_active_session');

        if (updated.length === 0) {
          this.teardownRoom(roomId);
        } else {
          const room = this.getRoom(roomId);
          if (room && room.hostId === participantId) {
            const nextHost = updated.reduce((oldest, current) => {
              return current.joinedAt < oldest.joinedAt ? current : oldest;
            }, updated[0]);
            nextHost.isHost = true;
            nextHost.permissions = this.getFullPermissions();
            room.hostId = nextHost.id;
            this.saveRoom(room);
            
            // Broadcast host transfer
            this.broadcast('SETTINGS', room);
          }
          this.broadcast('PARTICIPANTS', updated);
        }
      }
    });
  }
}
