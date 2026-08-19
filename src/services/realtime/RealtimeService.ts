import { Room, PlaybackState, QueueItem, RealtimeEventListeners, UserPermissions } from './types';

export interface RealtimeService {
  /**
   * Create a new room with custom credentials.
   * Enforces capacity limits between 2 and 6.
   */
  createRoom(
    name: string, 
    capacity: number, 
    password?: string, 
    hostNickname?: string, 
    hostAvatar?: string, 
    theme?: string
  ): Promise<{ room: Room; participantId: string }>;

  /**
   * Join an existing room using code and credentials.
   * Performs backend checks (capacity limits, passcode verification).
   */
  joinRoom(
    code: string, 
    nickname: string, 
    avatar: string, 
    password?: string
  ): Promise<{ room: Room; participantId: string }>;

  /**
   * Leave the current room.
   * Performs Host-handoff if the Host leaves, or tears down the room if empty.
   */
  leaveRoom(): Promise<void>;

  /**
   * End the watch party immediately, ejecting all users and deleting all metadata (Host only).
   */
  endRoom(): Promise<void>;

  /**
   * Broadcast or update video playback synchronizations (play, pause, seek, source file details).
   */
  updatePlayback(state: Partial<PlaybackState>): Promise<void>;

  /**
   * Broadcast a validated/sanitized chat message to peers.
   */
  sendChatMessage(content: string): Promise<void>;

  /**
   * Add a new direct/local video item to the synchronized queue.
   */
  addToQueue(item: Omit<QueueItem, 'id' | 'addedBy' | 'avatar'>): Promise<void>;

  /**
   * Remove an item from the room's watch queue.
   */
  removeFromQueue(itemId: string): Promise<void>;

  /**
   * Reorder items in the watch queue (Host only).
   */
  reorderQueue(queue: QueueItem[]): Promise<void>;

  /**
   * Update room settings such as lock state, queue lock, or active theme (Host only).
   */
  updateRoomSettings(settings: Partial<Room>): Promise<void>;

  /**
   * Adjust granular play/pause/chat permissions for a user (Host only).
   */
  updateParticipantPermissions(targetId: string, permissions: UserPermissions): Promise<void>;

  /**
   * Disconnect or remove a participant from the room (Host only).
   */
  removeParticipant(targetId: string): Promise<void>;

  /**
   * Transfer host ownership privileges to another participant (Host only).
   */
  transferHost(targetId: string): Promise<void>;

  /**
   * Broadcast an emoji reaction event.
   */
  sendReaction(emoji: string): Promise<void>;

  /**
   * Routes WebRTC ICE and SDP offers/answers to specific peer endpoints.
   */
  sendSignaling(targetId: string, type: string, payload: any): Promise<void>;

  /**
   * Connect reactive callbacks from state managers or page hooks.
   */
  setListeners(listeners: RealtimeEventListeners): void;

  /**
   * Disconnect all active callbacks.
   */
  clearListeners(): void;

  /**
   * Simulates network ping adjustment for test scenarios.
   */
  simulateLatency(ms: number): void;

  /**
   * Check for any active cached session and reload it.
   */
  restoreSession(): Promise<{ room: Room; participantId: string } | null>;
}
