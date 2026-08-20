import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { Room, Participant, PlaybackState, QueueItem, RealtimeEventListeners, UserPermissions, ReactionEvent, ClientSession } from './types';
import { RealtimeService } from './RealtimeService';
import { logger } from '../diagnostics/logger';

export class SupabaseRealtimeService implements RealtimeService {
  private supabase: SupabaseClient | null = null;
  private activeRoomId: string | null = null;
  private localParticipantId: string | null = null;
  private localNickname = '';
  private localAvatar = '';
  private listeners: RealtimeEventListeners = {};
  private channel: RealtimeChannel | null = null;
  private reconnectTimers: Map<string, any> = new Map();

  constructor() {
    this.initClient();
  }

  private initClient() {
    let url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey || url.includes('your-project-id')) {
      logger.error('Supabase configuration missing or invalid. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      this.supabase = null;
    } else {
      // Clean up URL if it has a trailing /rest/v1 or /rest/v1/ suffix
      url = url.replace(/\/rest\/v1\/?$/, '');

      this.supabase = createClient(url, anonKey, {
        auth: {
          persistSession: true
        }
      });
      logger.info('Supabase client initialized with standard Auth session handling.');
    }
  }

  private checkSupabase(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('CineRoom server is currently unavailable. Please verify your Supabase configuration.');
    }
    return this.supabase;
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

  // --- FETCHERS ---
  private async fetchParticipants(roomId: string): Promise<Participant[]> {
    const sb = this.checkSupabase();
    const { data, error } = await sb
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      logger.error('Failed to fetch participants:', error.message);
      return [];
    }

    return (data || []).map(p => this.mapParticipant(p));
  }

  private async fetchQueue(roomId: string): Promise<QueueItem[]> {
    const sb = this.checkSupabase();
    const { data, error } = await sb
      .from('queue_items')
      .select('*')
      .eq('room_id', roomId)
      .order('order', { ascending: true });

    if (error) {
      logger.error('Failed to fetch queue:', error.message);
      return [];
    }

    return (data || []).map(q => ({
      id: q.id,
      title: q.title,
      url: q.url,
      sourceType: q.source_type as any,
      addedBy: q.added_by_name,
      avatar: q.added_by_avatar
    }));
  }

  private mapParticipant(p: any): Participant {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.is_host,
      joinedAt: Number(p.joined_at),
      ping: p.ping,
      isMuted: p.is_muted,
      isConnected: p.is_connected,
      connectionStatus: p.connection_status as any,
      isSpeaking: p.is_speaking,
      permissions: {
        canPlayPause: p.can_play_pause,
        canSeek: p.can_seek,
        canChangeVideo: p.can_change_video,
        canQueue: p.can_queue,
        canChat: p.can_chat,
        canReact: p.can_react
      }
    };
  }

  // --- SERVICE METHODS ---

  public async createRoom(
    name: string,
    capacity: number,
    password?: string,
    hostNickname?: string,
    hostAvatar?: string,
    theme?: string
  ): Promise<{ room: Room; participantId: string }> {
    const sb = this.checkSupabase();

    // 1. Ensure user is signed in anonymously to get a cryptographic user UUID
    let authSession = await sb.auth.getSession();
    if (!authSession.data.session) {
      const { data: authData, error: authErr } = await sb.auth.signInAnonymously();
      if (authErr) {
        logger.error('Anonymous Auth failed:', authErr.message);
        throw new Error('Authentication failed. Please try again.');
      }
      authSession = { data: { session: authData.session } } as any;
    }

    const participantId = authSession.data.session!.user.id;

    const cleanRoomName = this.sanitizeInput(name?.trim() || 'CineRoom Watch').slice(0, 30);
    const cleanHostNickname = this.sanitizeInput(hostNickname?.trim() || 'Host').slice(0, 20);
    const cleanCapacity = Math.max(2, Math.min(6, capacity));

    // Call secure Postgres function (Bcrypt hashing, secure UID/code generation)
    const { data, error } = await sb.rpc('create_room_secure', {
      room_name: cleanRoomName,
      room_capacity: cleanCapacity,
      room_password: password || '',
      host_nickname: cleanHostNickname,
      host_avatar: hostAvatar || '🐼',
      room_theme: theme || 'cinema'
    });

    if (error || !data) {
      logger.error('Failed to create room via RPC:', error?.message);
      throw new Error(error?.message || 'Failed to create room.');
    }

    const { roomId, code } = data as { roomId: string; code: string };

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

    const session: ClientSession = {
      roomId,
      participantId,
      nickname: cleanHostNickname,
      avatar: hostAvatar || '🐼'
    };
    localStorage.setItem('cineroom_active_session', JSON.stringify(session));

    this.activeRoomId = roomId;
    this.localParticipantId = participantId;
    this.localNickname = cleanHostNickname;
    this.localAvatar = hostAvatar || '🐼';

    await this.subscribeToRoom(roomId);

    return { room, participantId };
  }

  public async joinRoom(
    code: string,
    nickname: string,
    avatar: string,
    password?: string
  ): Promise<{ room: Room; participantId: string }> {
    const sb = this.checkSupabase();

    // 1. Ensure user is signed in anonymously to get a cryptographic user UUID
    let authSession = await sb.auth.getSession();
    if (!authSession.data.session) {
      const { data: authData, error: authErr } = await sb.auth.signInAnonymously();
      if (authErr) {
        logger.error('Anonymous Auth failed:', authErr.message);
        throw new Error('Authentication failed. Please try again.');
      }
      authSession = { data: { session: authData.session } } as any;
    }

    const participantId = authSession.data.session!.user.id;
    const cleanNickname = this.sanitizeInput(nickname?.trim() || 'Peer').slice(0, 20);

    // Call secure Postgres RPC (Capacity checks, password checks, insert participant)
    const { data, error } = await sb.rpc('join_room_secure', {
      room_code: code.trim().toUpperCase(),
      user_nickname: cleanNickname,
      user_avatar: avatar || '🐱',
      room_password: password || ''
    });

    if (error || !data) {
      logger.error('Failed to join room via RPC:', error?.message);
      throw new Error(error?.message || 'Unable to join room. Please verify the code and password.');
    }

    const { roomId } = data as { roomId: string };

    // Fetch the room details securely (RLS allows select since we now have the auth session active!)
    const { data: roomData, error: fetchErr } = await sb
      .from('rooms')
      .select('id, name, code, capacity, has_password, host_id, is_locked, is_queue_locked, theme')
      .eq('id', roomId)
      .single();

    if (fetchErr || !roomData) {
      logger.error('Failed to sync room metadata post-join:', fetchErr?.message);
      throw new Error('Failed to synchronize room state.');
    }

    const room: Room = {
      id: roomData.id,
      name: roomData.name,
      code: roomData.code,
      capacity: roomData.capacity,
      hasPassword: roomData.has_password,
      hostId: roomData.host_id,
      isLocked: roomData.is_locked,
      isQueueLocked: roomData.is_queue_locked,
      theme: roomData.theme
    };

    // Save session locally
    const session: ClientSession = {
      roomId: room.id,
      participantId,
      nickname: cleanNickname,
      avatar: avatar || '🐱'
    };
    localStorage.setItem('cineroom_active_session', JSON.stringify(session));

    this.activeRoomId = room.id;
    this.localParticipantId = participantId;
    this.localNickname = cleanNickname;
    this.localAvatar = avatar || '🐱';

    await this.subscribeToRoom(room.id);

    return { room, participantId };
  }

  public async leaveRoom(): Promise<void> {
    if (!this.activeRoomId || !this.localParticipantId) return;

    const sb = this.checkSupabase();
    const roomId = this.activeRoomId;
    const participantId = this.localParticipantId;

    this.activeRoomId = null;
    this.localParticipantId = null;
    this.unsubscribe();
    localStorage.removeItem('cineroom_active_session');

    // Remove participant database entry
    await sb.from('participants').delete().eq('id', participantId);

    const remaining = await this.fetchParticipants(roomId);

    if (remaining.length === 0) {
      // Teardown empty room (cascade prunes playback, queue, chat)
      await sb.from('rooms').delete().eq('id', roomId);
      logger.info(`Room [${roomId}] ended. Cleaned up associated metadata.`);
    } else {
      // Re-evaluate host hand-off
      const room = await this.getRoomSchema(roomId);
      if (room && room.hostId === participantId) {
        const nextHost = remaining.reduce((oldest, current) => {
          return current.joinedAt < oldest.joinedAt ? current : oldest;
        }, remaining[0]);

        await sb.from('rooms').update({ host_id: nextHost.id }).eq('id', roomId);
        await sb.from('participants').update({ is_host: true }).eq('id', nextHost.id);

        // System broadcast info
        await sb.from('chat_messages').insert({
          id: 'sys-' + Math.random().toString(36).substring(2, 8),
          room_id: roomId,
          sender_id: null,
          sender_name: 'System',
          sender_avatar: '',
          content: `Host left. Role transferred to ${nextHost.name}`,
          timestamp: Date.now(),
          is_system: true
        });
      } else {
        await sb.from('chat_messages').insert({
          id: 'sys-' + Math.random().toString(36).substring(2, 8),
          room_id: roomId,
          sender_id: null,
          sender_name: 'System',
          sender_avatar: '',
          content: `${this.localNickname} left the watch party`,
          timestamp: Date.now(),
          is_system: true
        });
      }
    }
  }

  public async endRoom(): Promise<void> {
    const roomId = this.activeRoomId;
    if (!roomId) return;

    const sb = this.checkSupabase();

    // Broadcast teardown event locally before deleting DB schemas
    if (this.channel) {
      await this.channel.send({
        type: 'broadcast',
        event: 'teardown',
        payload: {}
      });
    }

    await sb.from('rooms').delete().eq('id', roomId);

    this.activeRoomId = null;
    this.localParticipantId = null;
    this.unsubscribe();
    localStorage.removeItem('cineroom_active_session');
  }

  public async updatePlayback(state: Partial<PlaybackState>): Promise<void> {
    const roomId = this.activeRoomId;
    if (!roomId) return;

    const sb = this.checkSupabase();
    
    // 1. If changing video source
    if (state.sourceUrl !== undefined || state.sourceType !== undefined || state.fileName !== undefined) {
      const sourceUrl = state.sourceUrl || '';
      const sourceType = state.sourceType || 'url';
      const fileName = state.fileName || '';
      const fileSize = state.fileSize || 0;
      const videoId = state.videoId || '';

      const { error } = await sb.rpc('playback_change_video', {
        p_room_id: roomId,
        p_source_type: sourceType,
        p_source_url: sourceUrl,
        p_file_name: fileName,
        p_file_size: fileSize,
        p_video_id: videoId
      });
      if (error) {
        logger.error('Failed to change video via RPC:', error.message);
        throw new Error(error.message);
      }
      return;
    }

    // 2. If play/pause toggle
    if (state.isPlaying !== undefined || state.playing !== undefined) {
      const isPlaying = state.isPlaying !== undefined ? state.isPlaying : !!state.playing;
      const currentTime = state.currentTime !== undefined ? state.currentTime : 0;
      const eventId = state.eventId || 'evt-' + Math.random().toString(36).substring(2, 8);

      const { error } = await sb.rpc('playback_play_pause', {
        p_room_id: roomId,
        p_is_playing: isPlaying,
        p_event_id: eventId,
        p_current_time: currentTime
      });
      if (error) {
        logger.error('Failed to update play/pause via RPC:', error.message);
        throw new Error(error.message);
      }
      return;
    }

    // 3. If seek operation
    if (state.currentTime !== undefined) {
      const currentTime = state.currentTime;
      const eventId = state.eventId || 'evt-' + Math.random().toString(36).substring(2, 8);

      const { error } = await sb.rpc('playback_seek', {
        p_room_id: roomId,
        p_current_time: currentTime,
        p_event_id: eventId
      });
      if (error) {
        logger.error('Failed to seek video via RPC:', error.message);
        throw new Error(error.message);
      }
      return;
    }
  }

  public async sendChatMessage(content: string): Promise<void> {
    const roomId = this.activeRoomId;
    const participantId = this.localParticipantId;
    if (!roomId || !participantId) return;

    const sb = this.checkSupabase();
    const cleanContent = this.sanitizeInput(content.trim()).slice(0, 500);
    if (!cleanContent) return;

    // Query active playback state for timestamps matching
    const { data: play } = await sb.from('playback_states').select('*').eq('room_id', roomId).single();
    let videoTimestamp: number | undefined;
    if (play && play.file_name) {
      let currentPos = play.current_time;
      if (play.is_playing || play.playing) {
        const elapsed = (Date.now() - Number(play.last_update_timestamp)) / 1000;
        currentPos += elapsed;
      }
      videoTimestamp = Math.max(0, currentPos);
    }

    await sb.from('chat_messages').insert({
      id: 'msg-' + Math.random().toString(36).substring(2, 8),
      room_id: roomId,
      sender_id: participantId,
      sender_name: this.localNickname,
      sender_avatar: this.localAvatar,
      content: cleanContent,
      timestamp: Date.now(),
      video_timestamp: videoTimestamp || null,
      is_system: false
    });
  }

  public async addToQueue(item: Omit<QueueItem, 'id' | 'addedBy' | 'avatar'>): Promise<void> {
    const roomId = this.activeRoomId;
    const participantId = this.localParticipantId;
    if (!roomId || !participantId) return;

    const sb = this.checkSupabase();
    const cleanTitle = this.sanitizeInput(item.title.trim()).slice(0, 100);
    const cleanUrl = this.sanitizeInput(item.url.trim()).slice(0, 1000);

    // Compute max order
    const { data: queue } = await sb.from('queue_items').select('order').eq('room_id', roomId);
    const nextOrder = queue && queue.length > 0 ? Math.max(...queue.map(q => q.order)) + 1 : 0;

    await sb.from('queue_items').insert({
      id: 'q-' + Math.random().toString(36).substring(2, 6),
      room_id: roomId,
      title: cleanTitle,
      url: cleanUrl,
      source_type: item.sourceType,
      added_by: participantId,
      added_by_name: this.localNickname,
      added_by_avatar: this.localAvatar,
      created_at: Date.now(),
      order: nextOrder
    });
  }

  public async removeFromQueue(itemId: string): Promise<void> {
    const roomId = this.activeRoomId;
    if (!roomId) return;

    const sb = this.checkSupabase();
    await sb.from('queue_items').delete().eq('id', itemId).eq('room_id', roomId);
  }

  public async reorderQueue(queue: QueueItem[]): Promise<void> {
    const roomId = this.activeRoomId;
    if (!roomId) return;

    const sb = this.checkSupabase();
    
    // Update ordering sequentially in database transaction equivalents
    const promises = queue.map((item, idx) => {
      return sb
        .from('queue_items')
        .update({ order: idx })
        .eq('id', item.id)
        .eq('room_id', roomId);
    });

    await Promise.all(promises);
  }

  public async updateRoomSettings(settings: Partial<Room>): Promise<void> {
    const roomId = this.activeRoomId;
    if (!roomId) return;

    const sb = this.checkSupabase();
    const updates: any = {};
    if (settings.isLocked !== undefined) updates.is_locked = settings.isLocked;
    if (settings.isQueueLocked !== undefined) updates.is_queue_locked = settings.isQueueLocked;
    if (settings.theme !== undefined) updates.theme = settings.theme;

    await sb.from('rooms').update(updates).eq('id', roomId);
  }

  public async updateParticipantPermissions(targetId: string, permissions: UserPermissions): Promise<void> {
    const sb = this.checkSupabase();

    const { error } = await sb.rpc('update_participant_permissions', {
      target_participant_id: targetId,
      p_play_pause: permissions.canPlayPause,
      p_seek: permissions.canSeek,
      p_change_video: permissions.canChangeVideo,
      p_queue: permissions.canQueue,
      p_chat: permissions.canChat,
      p_react: permissions.canReact
    });

    if (error) {
      logger.error('Failed to update participant permissions via RPC:', error.message);
      throw new Error(error.message);
    }
  }

  public async removeParticipant(targetId: string): Promise<void> {
    const roomId = this.activeRoomId;
    if (!roomId) return;

    const sb = this.checkSupabase();

    // Broadcast ejection channel message so player knows they are kicked
    if (this.channel) {
      await this.channel.send({
        type: 'broadcast',
        event: 'kick',
        payload: targetId
      });
    }

    // Delete DB record
    await sb.from('participants').delete().eq('id', targetId).eq('room_id', roomId);
  }

  public async transferHost(targetId: string): Promise<void> {
    const roomId = this.activeRoomId;
    if (!roomId) return;

    const sb = this.checkSupabase();

    const { data: target } = await sb.from('participants').select('name').eq('id', targetId).single();

    const { error } = await sb.rpc('transfer_room_host', {
      target_host_id: targetId
    });

    if (error) {
      logger.error('Failed to transfer host via RPC:', error.message);
      throw new Error(error.message);
    }

    await sb.from('chat_messages').insert({
      id: 'sys-' + Math.random().toString(36).substring(2, 8),
      room_id: roomId,
      sender_id: 'system',
      sender_name: 'System',
      sender_avatar: '',
      content: `Host transferred to ${target ? target.name : 'Peer'}`,
      timestamp: Date.now(),
      is_system: true
    });
  }

  public async sendReaction(emoji: string): Promise<void> {
    const roomId = this.activeRoomId;
    const participantId = this.localParticipantId;
    if (!roomId || !participantId) return;

    if (this.channel) {
      const react: ReactionEvent = {
        id: 'react-' + Math.random().toString(36).substring(2, 7),
        emoji,
        senderId: participantId,
        xOffset: Math.floor(Math.random() * 80) + 10,
        createdAt: Date.now()
      };

      await this.channel.send({
        type: 'broadcast',
        event: 'reaction',
        payload: react
      });

      if (this.listeners.onReactionReceived) {
        this.listeners.onReactionReceived(react);
      }
    }
  }

  public async sendSignaling(targetId: string, type: string, payload: any): Promise<void> {
    if (this.channel && this.localParticipantId) {
      await this.channel.send({
        type: 'broadcast',
        event: 'signaling',
        payload: {
          targetId,
          senderId: this.localParticipantId,
          type,
          data: payload
        }
      });
    }
  }

  // --- SESSION RESTORATION ---

  public async restoreSession(): Promise<{ room: Room; participantId: string } | null> {
    const sb = this.checkSupabase();
    const rawSession = localStorage.getItem('cineroom_active_session');
    if (!rawSession) return null;

    try {
      const session = JSON.parse(rawSession) as ClientSession;
      
      // Verify the active Supabase authenticated user matches the restored session ID
      const authSession = await sb.auth.getSession();
      if (!authSession.data.session || authSession.data.session.user.id !== session.participantId) {
        localStorage.removeItem('cineroom_active_session');
        return null;
      }

      const { data: roomData } = await sb
        .from('rooms')
        .select('id, name, code, capacity, has_password, host_id, is_locked, is_queue_locked, theme')
        .eq('id', session.roomId)
        .single();

      if (!roomData) {
        localStorage.removeItem('cineroom_active_session');
        return null;
      }

      const { data: partData } = await sb.from('participants').select('*').eq('id', session.participantId).single();
      if (!partData) {
        localStorage.removeItem('cineroom_active_session');
        return null;
      }

      this.activeRoomId = session.roomId;
      this.localParticipantId = session.participantId;
      this.localNickname = session.nickname;
      this.localAvatar = session.avatar;

      await this.subscribeToRoom(session.roomId);

      // Trigger local state hydration events
      const room: Room = {
        id: roomData.id,
        name: roomData.name,
        code: roomData.code,
        capacity: roomData.capacity,
        hasPassword: roomData.has_password,
        hostId: roomData.host_id,
        isLocked: roomData.is_locked,
        isQueueLocked: roomData.is_queue_locked,
        theme: roomData.theme
      };

      const participants = await this.fetchParticipants(session.roomId);
      const queue = await this.fetchQueue(session.roomId);
      
      const { data: playData } = await sb.from('playback_states').select('*').eq('room_id', session.roomId).single();
      const playback: PlaybackState = playData ? {
        sourceType: playData.source_type as any,
        sourceUrl: playData.source_url || '',
        fileName: playData.file_name || '',
        fileSize: Number(playData.file_size),
        isPlaying: playData.is_playing,
        playing: playData.playing,
        currentTime: playData.current_time,
        videoId: playData.video_id || '',
        stateVersion: playData.state_version,
        eventId: playData.event_id || '',
        lastUpdateTimestamp: Number(playData.last_update_timestamp),
        updatedAt: playData.updated_at ? new Date(playData.updated_at).getTime() : Date.now()
      } : {
        sourceType: 'url',
        sourceUrl: '',
        fileName: '',
        fileSize: 0,
        isPlaying: false,
        playing: false,
        currentTime: 0,
        videoId: '',
        stateVersion: 0,
        eventId: '',
        lastUpdateTimestamp: Date.now(),
        updatedAt: Date.now()
      };

      setTimeout(() => {
        if (this.listeners.onRoomUpdate) this.listeners.onRoomUpdate(room);
        if (this.listeners.onParticipantsChange) this.listeners.onParticipantsChange(participants);
        if (this.listeners.onPlaybackChange) this.listeners.onPlaybackChange(playback);
        if (this.listeners.onQueueChange) this.listeners.onQueueChange(queue);
      }, 200);

      return { room, participantId: session.participantId };
    } catch {
      localStorage.removeItem('cineroom_active_session');
      return null;
    }
  }

  // --- PRIVATE CHANNEL MANAGEMENT ---

  private async subscribeToRoom(roomId: string) {
    const sb = this.checkSupabase();
    this.unsubscribe();

    this.channel = sb.channel(`cineroom_${roomId}`);

    this.channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        if (payload.new && this.listeners.onRoomUpdate) {
          const r = payload.new as any;
          this.listeners.onRoomUpdate({
            id: r.id,
            name: r.name,
            code: r.code,
            capacity: r.capacity,
            hasPassword: r.has_password,
            hostId: r.host_id,
            isLocked: r.is_locked,
            isQueueLocked: r.is_queue_locked,
            theme: r.theme
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` }, async () => {
        const list = await this.fetchParticipants(roomId);
        if (this.listeners.onParticipantsChange) {
          this.listeners.onParticipantsChange(list);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playback_states', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.new && this.listeners.onPlaybackChange) {
          const p = payload.new as any;
          this.listeners.onPlaybackChange({
            sourceType: p.source_type,
            sourceUrl: p.source_url || '',
            fileName: p.file_name || '',
            fileSize: Number(p.file_size),
            isPlaying: p.is_playing,
            playing: p.playing,
            currentTime: p.current_time,
            videoId: p.video_id || '',
            stateVersion: p.state_version,
            eventId: p.event_id || '',
            lastUpdateTimestamp: Number(p.last_update_timestamp),
            updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : Date.now()
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` }, async () => {
        const queue = await this.fetchQueue(roomId);
        if (this.listeners.onQueueChange) {
          this.listeners.onQueueChange(queue);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.new && this.listeners.onChatMessage) {
          const c = payload.new as any;
          this.listeners.onChatMessage({
            id: c.id,
            senderId: c.sender_id,
            senderName: c.sender_name,
            senderAvatar: c.sender_avatar,
            content: c.content,
            timestamp: Number(c.timestamp),
            videoTimestamp: c.video_timestamp,
            isSystem: c.is_system
          });
        }
      })
      .on('broadcast', { event: 'reaction' }, async (payload) => {
        const react = payload.payload;
        if (react && await this.isParticipantActive(react.senderId)) {
          if (this.listeners.onReactionReceived) {
            this.listeners.onReactionReceived(react);
          }
        }
      })
      .on('broadcast', { event: 'signaling' }, async (payload) => {
        const { targetId, senderId, type, data } = payload.payload;
        if (targetId === this.localParticipantId && await this.isParticipantActive(senderId)) {
          if (this.listeners.onSignalingMessage) {
            this.listeners.onSignalingMessage({ senderId, type, payload: data });
          }
        }
      })
      .on('broadcast', { event: 'kick' }, (payload) => {
        if (payload.payload === this.localParticipantId) {
          this.leaveRoom();
          window.location.reload();
        }
      })
      .on('broadcast', { event: 'teardown' }, () => {
        this.leaveRoom();
        window.location.reload();
      })
      .on('presence', { event: 'sync' }, () => {
        this.handlePresenceSync();
      })
      .on('presence', { event: 'join' }, ({ key: _key, newPresences }) => {
        this.handlePresenceJoin(_key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key: _key, leftPresences }) => {
        this.handlePresenceLeave(_key, leftPresences);
      });

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        logger.info('Subscribed to Supabase Realtime channel.');
        await this.channel!.track({
          id: this.localParticipantId,
          nickname: this.localNickname,
          avatar: this.localAvatar,
          onlineAt: new Date().toISOString()
        });
      }
    });
  }

  private unsubscribe() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }

  // --- PRESENCE HANDLERS ---

  private handlePresenceSync() {
    // General presence sync logic if needed
  }

  private handlePresenceJoin(_key: string, newPresences: any[]) {
    // Clear reconnect timer if user joined again
    newPresences.forEach((presence) => {
      const timer = this.reconnectTimers.get(presence.id);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(presence.id);
      }
      this.updateParticipantConnection(presence.id, 'connected', true);
    });
  }

  private handlePresenceLeave(_key: string, leftPresences: any[]) {
    // Start graceful reconnect timer when socket drops
    const sb = this.checkSupabase();
    leftPresences.forEach((presence) => {
      this.updateParticipantConnection(presence.id, 'reconnecting', false);

      const timer = setTimeout(async () => {
        this.reconnectTimers.delete(presence.id);
        
        // Eject user completely if offline for > 15 seconds
        const room = await this.getRoomSchema(this.activeRoomId || '');
        if (room) {
          await sb.from('participants').delete().eq('id', presence.id).eq('room_id', room.id);
          
          // Triggers system chat alert
          await sb.from('chat_messages').insert({
            id: 'sys-' + Math.random().toString(36).substring(2, 8),
            room_id: room.id,
            sender_id: null,
            sender_name: 'System',
            sender_avatar: '',
            content: `${presence.nickname} disconnected.`,
            timestamp: Date.now(),
            is_system: true
          });

          // Check if Host disconnected
          if (room.hostId === presence.id) {
            const remaining = await this.fetchParticipants(room.id);
            if (remaining.length > 0) {
              const nextHost = remaining.reduce((oldest, current) => {
                return current.joinedAt < oldest.joinedAt ? current : oldest;
              }, remaining[0]);

              await sb.from('rooms').update({ host_id: nextHost.id }).eq('id', room.id);
              await sb.from('participants').update({ is_host: true }).eq('id', nextHost.id);
            } else {
              await sb.from('rooms').delete().eq('id', room.id);
            }
          }
        }
      }, 15000);

      this.reconnectTimers.set(presence.id, timer);
    });
  }

  private async updateParticipantConnection(id: string, status: string, isConnected: boolean) {
    const sb = this.checkSupabase();
    await sb
      .from('participants')
      .update({ connection_status: status, is_connected: isConnected })
      .eq('id', id);
  }

  private async isParticipantActive(participantId: string): Promise<boolean> {
    if (!this.activeRoomId || !participantId) return false;
    const sb = this.checkSupabase();
    const { data } = await sb
      .from('participants')
      .select('id')
      .eq('id', participantId)
      .eq('room_id', this.activeRoomId)
      .single();
    return !!data;
  }

  private async getRoomSchema(roomId: string): Promise<Room | null> {
    const sb = this.checkSupabase();
    const { data } = await sb
      .from('rooms')
      .select('id, name, code, capacity, has_password, host_id, is_locked, is_queue_locked, theme')
      .eq('id', roomId)
      .single();
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      capacity: data.capacity,
      hasPassword: data.has_password,
      hostId: data.host_id,
      isLocked: data.is_locked,
      isQueueLocked: data.is_queue_locked,
      theme: data.theme
    };
  }

  // --- LISTENERS ---

  public setListeners(listeners: RealtimeEventListeners): void {
    this.listeners = listeners;
  }

  public clearListeners(): void {
    this.listeners = {};
  }

  public simulateLatency(_ms: number): void {
  }
}
