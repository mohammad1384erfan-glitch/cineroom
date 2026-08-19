import { PeerConnectionInfo, WebRTCEventListeners } from './types';
import { WebRTCService } from './WebRTCService';
import { realtimeService } from '../index';
import { logger } from '../diagnostics/logger';

export class MockWebRTCService implements WebRTCService {
  private pcs: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private peerVolumes: Map<string, number> = new Map();
  private listeners: WebRTCEventListeners = {};
  private localStream: MediaStream | null = null;
  private isMuted: boolean = false;
  private localUserId: string | null = null;
  
  // Data Channel Properties
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private streamingFile: File | null = null;
  private activeReceiveFileId: string | null = null;
  private pendingChunkHeader: { fileId: string; index: number; totalChunks: number; size: number } | null = null;
  private receivedChunkBuffers: Map<number, ArrayBuffer> = new Map();

  // Speaking Analysis properties
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserIntervalId: any = null;
  private wasSpeaking = false;

  constructor() {
    logger.info('Real WebRTC mesh service with P2P channels initialized.');
  }

  public setListeners(listeners: WebRTCEventListeners): void {
    this.listeners = listeners;
    logger.info('WebRTC listeners bound.');
  }

  public clearListeners(): void {
    this.listeners = {};
    logger.info('WebRTC listeners cleared.');
  }

  private notifyPeersChange() {
    if (this.listeners.onPeersStateChange) {
      const peerList: PeerConnectionInfo[] = Array.from(this.pcs.entries()).map(([peerId, pc]) => {
        return {
          peerId,
          name: `Peer-${peerId.substring(4, 8)}`,
          state: pc.connectionState as any,
          hasAudio: true,
          isMuted: false,
          audioStream: null
        };
      });
      this.listeners.onPeersStateChange(peerList);
    }
  }

  // --- DEVICE CAPTURE & INITIALIZATION ---

  public async initialize(localUserId: string, localNickname: string): Promise<void> {
    logger.webrtc(`Initializing WebRTC engine for: ${localNickname} (${localUserId})`);
    this.localUserId = localUserId;
    this.close(); // Reset existing connections

    try {
      // Capture local audio track
      logger.webrtc('Requesting microphone access stream...');
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      logger.webrtc('Microphone track successfully captured.');
      
      this.isMuted = false;
      if (this.listeners.onLocalAudioToggle) {
        this.listeners.onLocalAudioToggle({ isMuted: false });
      }

      this.startSpeakingAnalyser();
    } catch (err: any) {
      logger.error('Failed to capture audio device. Proceeding silently.', err.message);
      this.localStream = null;
      this.isMuted = true;
      if (this.listeners.onLocalAudioToggle) {
        this.listeners.onLocalAudioToggle({ isMuted: true });
      }
    }
  }

  // --- DATA CHANNEL HANDLERS & BACKPRESSURE ---

  private setupDataChannel(peerId: string, pc: RTCPeerConnection) {
    // Create a negotiated data channel with a fixed channel ID
    const dataChannel = pc.createDataChannel('cineroom-p2p-media', { negotiated: true, id: 100 });
    dataChannel.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, dataChannel);

    dataChannel.onopen = () => {
      logger.webrtc(`DataChannel 'cineroom-p2p-media' opened with peer [${peerId}].`);
    };

    dataChannel.onclose = () => {
      logger.webrtc(`DataChannel 'cineroom-p2p-media' closed with peer [${peerId}].`);
      this.dataChannels.delete(peerId);
    };

    dataChannel.onmessage = (event) => {
      this.handleDataChannelPacket(peerId, event.data);
    };
  }

  private handleDataChannelPacket(senderId: string, data: any) {
    if (typeof data === 'string') {
      // Text packet (JSON command or chunk header)
      if (data.startsWith('HEADER:')) {
        const parts = data.split(':');
        const fileId = parts[1];
        const index = parseInt(parts[2], 10);
        const totalChunks = parseInt(parts[3], 10);
        const size = parseInt(parts[4], 10);
        this.pendingChunkHeader = { fileId, index, totalChunks, size };
      } else {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'REQUEST_CHUNK') {
            const { fileId, index } = msg;
            if (this.streamingFile) {
              const file = this.streamingFile;
              const totalChunks = Math.ceil(file.size / 65536);
              const start = index * 65536;
              const end = Math.min(file.size, start + 65536);
              const slice = file.slice(start, end);

              const reader = new FileReader();
              reader.onload = () => {
                const buffer = reader.result as ArrayBuffer;
                const channel = this.dataChannels.get(senderId);
                if (channel && channel.readyState === 'open') {
                  // Backpressure control: pause if data queue > 1MB
                  const sendChunk = () => {
                    if (channel.bufferedAmount > 1024 * 1024) {
                      setTimeout(sendChunk, 50); // backoff retry
                      return;
                    }
                    channel.send(`HEADER:${fileId}:${index}:${totalChunks}:${buffer.byteLength}`);
                    channel.send(buffer);
                  };
                  sendChunk();
                }
              };
              reader.readAsArrayBuffer(slice);
            }
          }
        } catch (e: any) {
          logger.error('Failed to parse text command on P2P channel:', e.message);
        }
      }
    } else {
      // Binary packet (ArrayBuffer containing media chunk bytes)
      const header = this.pendingChunkHeader;
      this.pendingChunkHeader = null;

      if (header) {
        if (this.activeReceiveFileId !== header.fileId) {
          this.activeReceiveFileId = header.fileId;
          this.receivedChunkBuffers.clear();
        }

        this.receivedChunkBuffers.set(header.index, data);

        if (this.listeners.onChunkReceived) {
          this.listeners.onChunkReceived({
            fileId: header.fileId,
            chunkIndex: header.index,
            totalChunks: header.totalChunks,
            buffer: data
          });
        }

        if (this.listeners.onTransferProgress) {
          const progress = Math.round((this.receivedChunkBuffers.size / header.totalChunks) * 100);
          this.listeners.onTransferProgress({
            fileId: header.fileId,
            progress,
            receivedBytes: this.receivedChunkBuffers.size * 65536
          });
        }
      }
    }
  }

  public async startStreamingFile(file: File): Promise<void> {
    this.streamingFile = file;
    logger.webrtc(`Loaded local file for P2P streaming: ${file.name} (${file.size} bytes)`);
    return Promise.resolve();
  }

  public requestFileChunk(fileId: string, index: number): void {
    // Lookup host ID circular-dependency-free from localStorage
    const sessionStr = localStorage.getItem('cineroom_active_session');
    if (!sessionStr) return;

    try {
      const session = JSON.parse(sessionStr);
      const roomId = session.roomId;
      if (!roomId) return;

      const roomStr = localStorage.getItem(`cineroom_room_${roomId}`);
      if (!roomStr) return;

      const room = JSON.parse(roomStr);
      const hostId = room.hostId;

      if (hostId && hostId !== session.participantId) {
        const channel = this.dataChannels.get(hostId);
        if (channel && channel.readyState === 'open') {
          channel.send(JSON.stringify({ type: 'REQUEST_CHUNK', fileId, index }));
        }
      }
    } catch (err: any) {
      logger.error('Failed to dispatch file chunk request:', err.message);
    }
  }

  // --- PEER ESTABLISHMENT MESH ---

  public async connectToPeer(peerId: string, peerName: string): Promise<void> {
    if (this.pcs.has(peerId)) return;

    logger.webrtc(`Initiating RTCPeerConnection mesh track to [${peerName}] (${peerId}).`);

    // Setup ICE STUN/TURN servers
    const iceServers: RTCIceServer[] = [];
    const envServers = import.meta.env.VITE_ICE_SERVERS;
    if (envServers) {
      try {
        iceServers.push(...JSON.parse(envServers));
      } catch (e: any) {
        logger.error('Parsing VITE_ICE_SERVERS configuration failed.', e.message);
      }
    }
    if (iceServers.length === 0) {
      iceServers.push({ urls: 'stun:stun.l.google.com:19302' }); // Fallback STUN
    }

    const pc = new RTCPeerConnection({ iceServers });
    this.pcs.set(peerId, pc);

    // Negotiate file transfer data channel
    this.setupDataChannel(peerId, pc);

    // Attach local microphone tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidate gathering
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        realtimeService.sendSignaling(peerId, 'candidate', event.candidate);
      }
    };

    // Track state switches
    pc.onconnectionstatechange = () => {
      logger.webrtc(`Connection state with [${peerName}] shifted to: ${pc.connectionState}`);
      this.notifyPeersChange();
      
      if (pc.connectionState === 'connected') {
        logger.webrtc(`Signaling handshake completed. Connected to [${peerName}].`);
      }
    };

    // Track additions
    pc.ontrack = (event) => {
      logger.webrtc(`Remote audio stream track received from [${peerName}].`);
      const remoteStream = event.streams[0];
      this.playRemoteAudio(peerId, remoteStream);
    };

    // Create SDP Offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      realtimeService.sendSignaling(peerId, 'offer', offer);
      this.notifyPeersChange();
    } catch (err: any) {
      logger.error(`SDP negotiation failed for [${peerName}].`, err.message);
    }
  }

  public disconnectFromPeer(peerId: string): void {
    logger.webrtc(`Closing RTCPeerConnection for peer [${peerId}].`);
    
    // Peer connection close
    const pc = this.pcs.get(peerId);
    if (pc) {
      pc.close();
      this.pcs.delete(peerId);
    }

    // Data channel teardown
    const channel = this.dataChannels.get(peerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(peerId);
    }

    // Audio node teardown
    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(peerId);
    }

    this.notifyPeersChange();
  }

  public async handleSignalingMessage(senderId: string, type: string, payload: any): Promise<void> {
    if (!this.localUserId) return;
    logger.webrtc(`Processing signaling packet from [${senderId}] of type [${type}].`);

    let pc = this.pcs.get(senderId);

    if (!pc) {
      // Setup connection if not initialized
      const iceServers: RTCIceServer[] = [];
      const envServers = import.meta.env.VITE_ICE_SERVERS;
      if (envServers) {
        try { iceServers.push(...JSON.parse(envServers)); } catch {}
      }
      if (iceServers.length === 0) {
        iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
      }

      pc = new RTCPeerConnection({ iceServers });
      this.pcs.set(senderId, pc);

      // Negotiate file transfer data channel
      this.setupDataChannel(senderId, pc);

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          pc!.addTrack(track, this.localStream!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          realtimeService.sendSignaling(senderId, 'candidate', event.candidate);
        }
      };

      pc.onconnectionstatechange = () => {
        logger.webrtc(`Connection state with [${senderId}] shifted to: ${pc!.connectionState}`);
        this.notifyPeersChange();
      };

      pc.ontrack = (event) => {
        logger.webrtc(`Remote audio stream track received from [${senderId}].`);
        this.playRemoteAudio(senderId, event.streams[0]);
      };
    }

    try {
      if (type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        realtimeService.sendSignaling(senderId, 'answer', answer);
      } else if (type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
      } else if (type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(payload));
      }
      this.notifyPeersChange();
    } catch (err: any) {
      logger.error(`Failed to apply signaling payload from [${senderId}].`, err.message);
    }
  }

  // --- AUDIO OUTPUT MANAGEMENTS ---

  private playRemoteAudio(peerId: string, stream: MediaStream) {
    let audio = this.audioElements.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.audioElements.set(peerId, audio);
    }
    
    audio.srcObject = stream;
    
    // Apply volume override
    const vol = this.peerVolumes.has(peerId) ? this.peerVolumes.get(peerId)! : 0.8;
    audio.volume = vol;

    if (this.listeners.onRemoteStreamReceived) {
      this.listeners.onRemoteStreamReceived({ peerId, stream });
    }
  }

  public setPeerVolume(peerId: string, volume: number): void {
    const vol = Math.max(0, Math.min(1, volume));
    this.peerVolumes.set(peerId, vol);
    
    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.volume = vol;
      logger.webrtc(`Volume for peer [${peerId}] set to: ${Math.round(vol * 100)}%`);
    }
  }

  public toggleMute(): boolean {
    if (!this.localStream) return true;

    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });

    logger.webrtc(`Microphone track set to muted: ${this.isMuted}`);
    if (this.listeners.onLocalAudioToggle) {
      this.listeners.onLocalAudioToggle({ isMuted: this.isMuted });
    }

    return this.isMuted;
  }

  public sendData(_label: string, _message: string): void {
    // Unused in audio phase
  }

  // --- WEBAUDIO LOCAL SPEAKER ANALYSIS ---

  private startSpeakingAnalyser() {
    if (!this.localStream) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.analyserIntervalId = setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (this.wasSpeaking) {
            this.broadcastSpeakingState(false);
          }
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        
        // Calculate root mean square (RMS) amplitude
        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i];
        }
        const average = total / bufferLength;
        const isSpeaking = average > 12; // Threshold for vocal amplitude

        if (isSpeaking !== this.wasSpeaking) {
          this.broadcastSpeakingState(isSpeaking);
        }
      }, 250);
    } catch (e: any) {
      logger.error('Speaking analyzer failed to initialize.', e.message);
    }
  }

  private broadcastSpeakingState(isSpeaking: boolean) {
    this.wasSpeaking = isSpeaking;
    if (this.localUserId) {
      // Broadcast speaking state change as signaling packet to other tabs
      realtimeService.sendSignaling('*', 'speaking', { isSpeaking });
    }
  }

  // --- RESOURCE RESET & SHUTDOWNS ---

  public close(): void {
    logger.webrtc('Stopping local audio tracks and WebRTC peer negotiation.');
    
    // Stop Analyser
    if (this.analyserIntervalId) {
      clearInterval(this.analyserIntervalId);
      this.analyserIntervalId = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.wasSpeaking = false;

    // Stop mic streams
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Close connections
    this.pcs.forEach((pc) => pc.close());
    this.pcs.clear();

    // Close data channels
    this.dataChannels.forEach((dc) => dc.close());
    this.dataChannels.clear();
    this.streamingFile = null;
    this.receivedChunkBuffers.clear();
    this.activeReceiveFileId = null;
    this.pendingChunkHeader = null;

    // Close audio nodes
    this.audioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();

    this.notifyPeersChange();
  }
}
