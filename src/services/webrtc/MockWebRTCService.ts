import { PeerConnectionInfo, WebRTCEventListeners } from './types';
import { WebRTCService } from './WebRTCService';
import { realtimeService } from '../index';
import { logger } from '../diagnostics/logger';
import { useRoomStore } from '../../store/useRoomStore';

let activeInstance: MockWebRTCService | null = null;

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
  private activeSubtitle: { name: string; content: string } | null = null;
  private activeReceiveFileId: string | null = null;
  private pendingChunkHeader: { fileId: string; index: number; totalChunks: number; size: number } | null = null;
  private receivedChunkBuffers: Map<number, ArrayBuffer> = new Map();
  private queuedCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  // Speaking Analysis properties
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserIntervalId: any = null;
  private wasSpeaking = false;

  constructor() {
    activeInstance = this;
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
      console.log("[VOICE_DEBUG][MIC_GRANTED]", {
        streamId: this.localStream.id
      });
      console.log("[VOICE_TRACE] MIC_GRANTED", {
        streamId: this.localStream.id,
        tracksCount: this.localStream.getTracks().length
      });
      this.localStream.getTracks().forEach((track) => {
        console.log("[VOICE_TRACE] LOCAL_TRACK", {
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState
        });
      });
      logger.webrtc('Microphone track successfully captured.');

      if (this.localStream) {
        const audioTracks = this.localStream.getAudioTracks();
        logger.webrtc(`[VOICE_DIAGNOSTICS] Stream acquired: ${this.localStream.id}. Tracks count: ${audioTracks.length}`);
        audioTracks.forEach((track, i) => {
          logger.webrtc(`[VOICE_DIAGNOSTICS] Track ${i}: label=${track.label}, enabled=${track.enabled}, readyState=${track.readyState}, muted=${track.muted}`);
        });
      }
      
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
      const state = useRoomStore.getState();
      const isHost = state.room?.hostId === state.participantId;
      if (isHost) {
        logLocalFileE2E('[HOST][DATA_CHANNEL]', { targetId: peerId });
        console.log("[VIDEO_DEBUG][LOCAL][DATA_CHANNEL]", {
          peerId,
          readyState: dataChannel.readyState
        });
      } else {
        logLocalFileE2E('[GUEST][DATA_CHANNEL_STATE]');
        console.log("[VIDEO_DEBUG][LOCAL][GUEST_DATA_CHANNEL]", {
          readyState: dataChannel.readyState
        });
      }
      console.log("[VIDEO_TRACE][DATA_CHANNEL]", {
        peerId,
        label: 'cineroom-p2p-media',
        readyState: dataChannel.readyState
      });
      logger.webrtc(`DataChannel 'cineroom-p2p-media' opened with peer [${peerId}].`);

      if (!isHost && peerId === state.room?.hostId) {
        const fileId = state.p2pActiveFileId;
        if (fileId && state.p2pProgress < 100) {
          // Find first missing chunk index
          let firstMissing = 0;
          while (state.p2pBufferedChunks.has(firstMissing)) {
            firstMissing++;
          }
          logLocalFileE2E('[GUEST][DATA_CHANNEL_OPEN_RETRY_TRIGGER]', { chunkIndex: firstMissing });
          this.requestFileChunk(fileId, firstMissing);
        }
      }
      if (this.activeSubtitle) {
        dataChannel.send(JSON.stringify({
          type: 'CUSTOM_DATA',
          label: 'SUBTITLE',
          message: JSON.stringify(this.activeSubtitle)
        }));
      }
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
            
            const state = useRoomStore.getState();
            const roomId = state.room?.id || 'unknown';
            const participantId = state.participantId;
            const fileSize = this.streamingFile ? this.streamingFile.size : 0;

            logLocalFileE2E('[HOST][CHUNK_REQUEST_RECEIVED]', {
              targetId: senderId,
              chunkIndex: index
            });

            console.log("[VIDEO_DEBUG][LOCAL][CHUNK_REQUEST]", {
              requesterId: senderId,
              chunkIndex: index,
              start: index * 65536,
              end: Math.min(fileSize, (index + 1) * 65536)
            });

            console.log("[VIDEO_DEBUG][HOST][CHUNK_REQUEST]", {
              roomId,
              senderId,
              targetId: participantId,
              hostId: participantId,
              participantId,
              chunkIndex: index,
              chunkSize: 65536,
              fileSize
            });

            console.log("[VIDEO_TRACE][HOST] CHUNK_REQUEST_RECEIVED", {
              senderId,
              fileId,
              index
            });
            if (this.streamingFile) {
              const file = this.streamingFile;
              const totalChunks = Math.ceil(file.size / 65536);
              const start = index * 65536;
              const end = Math.min(file.size, start + 65536);
              const slice = file.slice(start, end);

              logLocalFileE2E('[HOST][CHUNK_READ]', {
                targetId: senderId,
                chunkIndex: index
              });

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
                    logLocalFileE2E('[HOST][CHUNK_SENT]', {
                      targetId: senderId,
                      chunkIndex: index,
                      bytesReceived: buffer.byteLength
                    });
                    console.log("[VIDEO_DEBUG][LOCAL][CHUNK_SENT]", {
                      targetId: senderId,
                      chunkIndex: index,
                      bytesSent: buffer.byteLength
                    });
                    console.log("[VIDEO_DEBUG][HOST][CHUNK_SENT]", {
                      roomId,
                      senderId: participantId,
                      targetId: senderId,
                      hostId: participantId,
                      participantId,
                      chunkIndex: index,
                      chunkSize: buffer.byteLength,
                      fileSize
                    });
                    console.log("[VIDEO_TRACE][HOST] CHUNK_SENT", {
                      recipientId: senderId,
                      fileId,
                      index,
                      chunkSize: buffer.byteLength
                    });
                    channel.send(`HEADER:${fileId}:${index}:${totalChunks}:${buffer.byteLength}`);
                    channel.send(buffer);
                  };
                  sendChunk();
                }
              };
              reader.readAsArrayBuffer(slice);
            }
          } else if (msg.type === 'CUSTOM_DATA') {
            if (this.listeners.onDataChannelReceived) {
              this.listeners.onDataChannelReceived({
                peerId: senderId,
                label: msg.label,
                message: msg.message
              });
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

        const processBufferAndContinue = (arrayBuffer: ArrayBuffer) => {
          const uint8Array = new Uint8Array(arrayBuffer);
          this.receivedChunkBuffers.set(header.index, arrayBuffer);

          let totalReceivedBytes = 0;
          this.receivedChunkBuffers.forEach((buf) => {
            totalReceivedBytes += buf.byteLength;
          });

          const state = useRoomStore.getState();
          const roomId = state.room?.id || 'unknown';
          const participantId = state.participantId;
          const hostId = state.room?.hostId || 'unknown';
          const fileSize = state.playbackState.fileSize;

          logLocalFileE2E('[GUEST][CHUNK_RECEIVED]', {
            chunkIndex: header.index,
            bytesReceived: uint8Array.byteLength,
            totalChunks: header.totalChunks,
            totalBytes: header.size
          });

          logLocalFileE2E('[GUEST][CHUNK_STORED]', {
            chunkIndex: header.index,
            totalChunks: header.totalChunks,
            totalBytes: header.size
          });

          logLocalFileE2E('[GUEST][BUFFER_PROGRESS]', {
            chunkIndex: header.index,
            totalChunks: header.totalChunks,
            bytesReceived: totalReceivedBytes,
            totalBytes: header.size
          });

          console.log("[VIDEO_DEBUG][LOCAL][GUEST_CHUNK_RECEIVED]", {
            chunkIndex: header.index,
            bytesReceived: uint8Array.byteLength
          });

          console.log("[VIDEO_DEBUG][LOCAL][GUEST_PROGRESS]", {
            receivedBytes: totalReceivedBytes,
            expectedBytes: header.size,
            percentage: Math.round((totalReceivedBytes / header.size) * 100)
          });

          console.log("[VIDEO_DEBUG][GUEST][CHUNK_RECEIVED]", {
            roomId,
            senderId,
            targetId: participantId,
            hostId,
            participantId,
            chunkIndex: header.index,
            chunkSize: uint8Array.byteLength,
            fileSize
          });

          console.log("[VIDEO_DEBUG][GUEST][TOTAL_BYTES]", {
            roomId,
            senderId,
            targetId: participantId,
            hostId,
            participantId,
            chunkIndex: header.index,
            chunkSize: totalReceivedBytes,
            fileSize
          });

          console.log("[VIDEO_TRACE][GUEST] CHUNK_RECEIVED", {
            fileId: header.fileId,
            index: header.index,
            totalChunks: header.totalChunks,
            chunkSize: uint8Array.byteLength
          });

          console.log("[VIDEO_TRACE][GUEST] TOTAL_BYTES", {
            fileId: header.fileId,
            receivedBytes: totalReceivedBytes,
            expectedSize: header.size
          });

          if (this.listeners.onChunkReceived) {
            this.listeners.onChunkReceived({
              fileId: header.fileId,
              chunkIndex: header.index,
              totalChunks: header.totalChunks,
              buffer: uint8Array.buffer
            });
          }

          if (this.listeners.onTransferProgress) {
            const progress = Math.round((this.receivedChunkBuffers.size / header.totalChunks) * 100);
            this.listeners.onTransferProgress({
              fileId: header.fileId,
              progress,
              receivedBytes: totalReceivedBytes
            });
          }
        };

        if (data instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            processBufferAndContinue(reader.result as ArrayBuffer);
          };
          reader.readAsArrayBuffer(data);
        } else if (data instanceof Uint8Array) {
          const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
          processBufferAndContinue(slice);
        } else if (data instanceof ArrayBuffer) {
          processBufferAndContinue(data);
        } else {
          console.error("Unsupported binary type received on WebRTC data channel:", data);
        }
      }
    }
  }

  public async startStreamingFile(file: File | null): Promise<void> {
    this.streamingFile = file;
    if (file) {
      console.log("[VIDEO_TRACE][HOST] file selected", {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        videoId: useRoomStore.getState().playbackState.videoId || 'unknown'
      });
      logger.webrtc(`Loaded local file for P2P streaming: ${file.name} (${file.size} bytes)`);
    } else {
      logger.webrtc(`Cleared local file for P2P streaming.`);
    }
    return Promise.resolve();
  }

  public requestFileChunk(fileId: string, index: number): void {
    try {
      const state = useRoomStore.getState();
      const hostId = state.room?.hostId;
      const participantId = state.participantId;

      if (hostId && hostId !== participantId) {
        logLocalFileE2E('[GUEST][CHUNK_REQUEST_SENT]', {
          chunkIndex: index
        });

        const channel = this.dataChannels.get(hostId);
        if (channel && channel.readyState === 'open') {
          channel.send(JSON.stringify({ type: 'REQUEST_CHUNK', fileId, index }));
        } else {
          // Retry automatically after a short delay if channel is still connecting
          setTimeout(() => {
            const ch = this.dataChannels.get(hostId);
            if (ch && ch.readyState === 'open') {
              ch.send(JSON.stringify({ type: 'REQUEST_CHUNK', fileId, index }));
            }
          }, 600);
        }
      }
    } catch (err: any) {
      logger.error('Failed to dispatch file chunk request:', err.message);
    }
  }

  // --- PEER ESTABLISHMENT MESH ---

  public async connectToPeer(peerId: string, peerName: string): Promise<void> {
    if (this.pcs.has(peerId)) {
      const existingPc = this.pcs.get(peerId);
      if (existingPc && (existingPc.connectionState === 'closed' || existingPc.connectionState === 'failed' || existingPc.connectionState === 'disconnected')) {
        logger.webrtc(`Cleaning up stale/failed PeerConnection for peer [${peerId}] before reconnecting.`);
        this.disconnectFromPeer(peerId);
      } else {
        return;
      }
    }

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
      iceServers.push(
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      );
    }

    const pc = new RTCPeerConnection({ iceServers });
    this.pcs.set(peerId, pc);

    console.log("[VIDEO_DEBUG][GUEST][PEER]", {
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState
    });

    console.log("[VOICE][PC]", {
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState
    });

    // Negotiate file transfer data channel
    this.setupDataChannel(peerId, pc);

    // Attach local microphone tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
        console.log("[VOICE_DEBUG][ADD_TRACK]", {
          peerId,
          trackId: track.id,
          kind: track.kind
        });
        console.log("[VOICE_TRACE] ADD_TRACK", {
          peerId,
          trackId: track.id,
          kind: track.kind
        });
      });
    }

    // Verify audio sender immediately
    const senders = pc.getSenders();
    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
    console.log("[VOICE][SENDER]", {
      hasAudioSender: !!audioSender,
      trackId: audioSender?.track?.id,
      kind: audioSender?.track?.kind,
      enabled: audioSender?.track?.enabled,
      readyState: audioSender?.track?.readyState
    });

    const getCandidateType = (candStr: string) => {
      const match = candStr.match(/typ\s+(\w+)/);
      return match ? match[1] : 'unknown';
    };

    // ICE Candidate gathering
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("[VOICE_DEBUG][ICE_SENT]", {
          senderId: this.localUserId,
          targetId: peerId,
          type: 'candidate',
          peerConnectionState: pc.connectionState,
          signalingState: pc.signalingState,
          payloadValidity: !!event.candidate
        });
        console.log("[VOICE_TRACE] ICE_STATE", {
          event: 'candidate_gathered',
          candidate: event.candidate.candidate,
          type: getCandidateType(event.candidate.candidate)
        });
        console.log("[VOICE][SIGNAL] ICE sent", {
          candidate: event.candidate.candidate,
          type: getCandidateType(event.candidate.candidate)
        });
        realtimeService.sendSignaling(peerId, 'candidate', event.candidate);
      }
    };

    // Track state switches
    pc.onconnectionstatechange = () => {
      console.log("[VOICE_DEBUG][CONNECTION_STATE]", {
        peerId,
        connectionState: pc.connectionState
      });
      console.log("[VOICE_TRACE] CONNECTION_STATE", {
        peerId,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState
      });
      console.log("[VOICE][PC] connectionStateChanged", {
        peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState
      });
      logger.webrtc(`[WEBRTC_DIAGNOSTICS] PC with [${peerName}] state changed: connectionState=${pc.connectionState}, iceConnectionState=${pc.iceConnectionState}, signalingState=${pc.signalingState}, iceGatheringState=${pc.iceGatheringState}`);
      this.notifyPeersChange();
      
      if (pc.connectionState === 'connected') {
        logger.webrtc(`Signaling handshake completed. Connected to [${peerName}].`);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[VOICE_DEBUG][ICE_STATE]", {
        peerId,
        iceConnectionState: pc.iceConnectionState
      });
      console.log("[VOICE_TRACE] ICE_STATE", {
        event: 'connection_state_change',
        iceConnectionState: pc.iceConnectionState
      });
      console.log("[VOICE][PC] iceConnectionStateChanged", {
        peerId,
        iceConnectionState: pc.iceConnectionState
      });
    };

    // Track additions
    pc.ontrack = (event) => {
      console.log("[VOICE_DEBUG][REMOTE_TRACK]", {
        peerId,
        trackId: event.track.id,
        kind: event.track.kind
      });
      console.log("[VOICE_TRACE] REMOTE_TRACK", {
        peerId,
        kind: event.track.kind,
        readyState: event.track.readyState,
        streamsLength: event.streams.length
      });
      console.log("[VOICE][REMOTE_TRACK]", {
        peerId,
        kind: event.track.kind,
        readyState: event.track.readyState,
        streamsLength: event.streams.length
      });
      let remoteStream = event.streams[0];
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteStream.addTrack(event.track);
      }
      console.log("[VOICE_DEBUG][REMOTE_STREAM]", {
        peerId,
        streamId: remoteStream.id
      });
      console.log("[VOICE_TRACE] REMOTE_STREAM", {
        streamId: remoteStream.id,
        tracksCount: remoteStream.getTracks().length
      });
      this.playRemoteAudio(peerId, remoteStream);
    };

    // Create SDP Offer
    try {
      const offer = await pc.createOffer();
      console.log("[VOICE_DEBUG][OFFER_CREATED]", {
        peerId,
        sdp: offer.sdp
      });
      await pc.setLocalDescription(offer);
      console.log("[VOICE_DEBUG][OFFER_SENT]", {
        senderId: this.localUserId,
        targetId: peerId,
        type: 'offer',
        peerConnectionState: pc.connectionState,
        signalingState: pc.signalingState,
        payloadValidity: !!offer
      });
      console.log("[VOICE_TRACE] OFFER_SENT", { peerId });
      console.log("[VOICE][SIGNAL] offer sent", { peerId });
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

    this.queuedCandidates.delete(peerId);

    this.notifyPeersChange();
  }

  public async handleSignalingMessage(senderId: string, type: string, payload: any): Promise<void> {
    if (!this.localUserId) return;
    logger.webrtc(`Processing signaling packet from [${senderId}] of type [${type}].`);

    let pc = this.pcs.get(senderId);

    if (pc && type === 'offer') {
      const state = pc.connectionState;
      if (state === 'closed' || state === 'failed' || state === 'disconnected') {
        logger.webrtc(`Recreating closed/failed PeerConnection for [${senderId}] due to new incoming offer.`);
        this.disconnectFromPeer(senderId);
        pc = undefined;
      }
    }

    if (!pc) {
      // Setup connection if not initialized
      const iceServers: RTCIceServer[] = [];
      const envServers = import.meta.env.VITE_ICE_SERVERS;
      if (envServers) {
        try { iceServers.push(...JSON.parse(envServers)); } catch {}
      }
      if (iceServers.length === 0) {
        iceServers.push(
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        );
      }

      pc = new RTCPeerConnection({ iceServers });
      this.pcs.set(senderId, pc);

      console.log("[VIDEO_DEBUG][GUEST][PEER]", {
        peerId: senderId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState
      });

      console.log("[VOICE][PC]", {
        senderId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState
      });

      // Negotiate file transfer data channel
      this.setupDataChannel(senderId, pc);

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          pc!.addTrack(track, this.localStream!);
          console.log("[VOICE_DEBUG][ADD_TRACK]", {
            peerId: senderId,
            trackId: track.id,
            kind: track.kind
          });
          console.log("[VOICE_TRACE] ADD_TRACK", {
            peerId: senderId,
            trackId: track.id,
            kind: track.kind
          });
        });
      }

      // Verify audio sender
      const senders = pc.getSenders();
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      console.log("[VOICE][SENDER]", {
        hasAudioSender: !!audioSender,
        trackId: audioSender?.track?.id,
        kind: audioSender?.track?.kind,
        enabled: audioSender?.track?.enabled,
        readyState: audioSender?.track?.readyState
      });

      const getCandidateType = (candStr: string) => {
        const match = candStr.match(/typ\s+(\w+)/);
        return match ? match[1] : 'unknown';
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("[VOICE_DEBUG][ICE_SENT]", {
            senderId: this.localUserId,
            targetId: senderId,
            type: 'candidate',
            peerConnectionState: pc!.connectionState,
            signalingState: pc!.signalingState,
            payloadValidity: !!event.candidate
          });
          console.log("[VOICE_TRACE] ICE_STATE", {
            event: 'candidate_gathered',
            candidate: event.candidate.candidate,
            type: getCandidateType(event.candidate.candidate)
          });
          console.log("[VOICE][SIGNAL] ICE sent", {
            candidate: event.candidate.candidate,
            type: getCandidateType(event.candidate.candidate)
          });
          realtimeService.sendSignaling(senderId, 'candidate', event.candidate);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("[VOICE_DEBUG][CONNECTION_STATE]", {
          peerId: senderId,
          connectionState: pc!.connectionState
        });
        console.log("[VOICE_TRACE] CONNECTION_STATE", {
          peerId: senderId,
          connectionState: pc!.connectionState,
          signalingState: pc!.signalingState
        });
        console.log("[VOICE][PC] connectionStateChanged", {
          senderId,
          connectionState: pc!.connectionState,
          iceConnectionState: pc!.iceConnectionState,
          iceGatheringState: pc!.iceGatheringState,
          signalingState: pc!.signalingState
        });
        logger.webrtc(`[WEBRTC_DIAGNOSTICS] PC with [${senderId}] state changed: connectionState=${pc!.connectionState}, iceConnectionState=${pc!.iceConnectionState}, signalingState=${pc!.signalingState}, iceGatheringState=${pc!.iceGatheringState}`);
        this.notifyPeersChange();
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[VOICE_DEBUG][ICE_STATE]", {
          peerId: senderId,
          iceConnectionState: pc!.iceConnectionState
        });
        console.log("[VOICE_TRACE] ICE_STATE", {
          event: 'connection_state_change',
          iceConnectionState: pc!.iceConnectionState
        });
        console.log("[VOICE][PC] iceConnectionStateChanged", {
          senderId,
          iceConnectionState: pc!.iceConnectionState
        });
      };

      pc.ontrack = (event) => {
        console.log("[VOICE_DEBUG][REMOTE_TRACK]", {
          peerId: senderId,
          trackId: event.track.id,
          kind: event.track.kind
        });
        console.log("[VOICE_TRACE] REMOTE_TRACK", {
          peerId: senderId,
          kind: event.track.kind,
          readyState: event.track.readyState,
          streamsLength: event.streams.length
        });
        console.log("[VOICE][REMOTE_TRACK]", {
          senderId,
          kind: event.track.kind,
          readyState: event.track.readyState,
          streamsLength: event.streams.length
        });
        let remoteStream = event.streams[0];
        if (!remoteStream) {
          remoteStream = new MediaStream();
          remoteStream.addTrack(event.track);
        }
        console.log("[VOICE_DEBUG][REMOTE_STREAM]", {
          peerId: senderId,
          streamId: remoteStream.id
        });
        console.log("[VOICE_TRACE] REMOTE_STREAM", {
          streamId: remoteStream.id,
          tracksCount: remoteStream.getTracks().length
        });
        this.playRemoteAudio(senderId, remoteStream);
      };
    }

    try {
      if (type === 'offer') {
        console.log("[VOICE_DEBUG][OFFER_RECEIVED]", {
          senderId,
          targetId: this.localUserId,
          type: 'offer',
          peerConnectionState: pc.connectionState,
          signalingState: pc.signalingState,
          payloadValidity: !!payload
        });
        console.log("[VOICE_TRACE] OFFER_RECEIVED", { senderId });
        console.log("[VOICE][SIGNAL] offer received", { senderId });
        if (pc.signalingState === 'have-remote-offer' || pc.connectionState === 'connected') {
          console.log("[VOICE_TRACE] OFFER_RECEIVED duplicate ignored (state: " + pc.signalingState + ")");
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          console.log("[VOICE_DEBUG][REMOTE_DESCRIPTION]", {
            peerId: senderId,
            type: 'offer',
            signalingState: pc.signalingState
          });
          const answer = await pc.createAnswer();
          console.log("[VOICE_DEBUG][ANSWER_CREATED]", {
            peerId: senderId,
            sdp: answer.sdp
          });
          await pc.setLocalDescription(answer);
          console.log("[VOICE_DEBUG][ANSWER_SENT]", {
            senderId: this.localUserId,
            targetId: senderId,
            type: 'answer',
            peerConnectionState: pc.connectionState,
            signalingState: pc.signalingState,
            payloadValidity: !!answer
          });
          console.log("[VOICE_TRACE] ANSWER_SENT", { senderId });
          console.log("[VOICE][SIGNAL] answer sent", { senderId });
          realtimeService.sendSignaling(senderId, 'answer', answer);
          await this.processQueuedCandidates(senderId, pc);
        }
      } else if (type === 'answer') {
        console.log("[VOICE_DEBUG][ANSWER_RECEIVED]", {
          senderId,
          targetId: this.localUserId,
          type: 'answer',
          peerConnectionState: pc.connectionState,
          signalingState: pc.signalingState,
          payloadValidity: !!payload
        });
        console.log("[VOICE_TRACE] ANSWER_RECEIVED", { senderId });
        console.log("[VOICE][SIGNAL] answer received", { senderId });
        if (pc.signalingState === 'stable') {
          console.log("[VOICE_TRACE] ANSWER_RECEIVED duplicate ignored (already stable)");
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          console.log("[VOICE_DEBUG][REMOTE_DESCRIPTION]", {
            peerId: senderId,
            type: 'answer',
            signalingState: pc.signalingState
          });
          await this.processQueuedCandidates(senderId, pc);
        }
      } else if (type === 'candidate') {
        if (!payload) {
          logger.info(`Received empty ICE candidate signalling payload from [${senderId}]. Ignored.`);
          return;
        }
        const getCandidateType = (candStr: string) => {
          if (!candStr) return 'unknown';
          const match = candStr.match(/typ\s+(\w+)/);
          return match ? match[1] : 'unknown';
        };
        const candType = getCandidateType(payload.candidate);
        console.log("[VOICE_DEBUG][ICE_RECEIVED]", {
          senderId,
          targetId: this.localUserId,
          type: 'candidate',
          peerConnectionState: pc.connectionState,
          signalingState: pc.signalingState,
          payloadValidity: !!payload
        });
        console.log("[VOICE_TRACE] ICE_STATE", {
          event: 'candidate_received',
          candidate: payload.candidate,
          type: candType
        });
        console.log("[VOICE][SIGNAL] ICE received", { senderId, type: candType });

        if (!payload.candidate) {
          logger.info(`Null candidate (ICE gathering complete) received from [${senderId}]. Ignored.`);
          return;
        }

        if (!pc.remoteDescription) {
          console.log("[VOICE_TRACE] ICE_STATE", {
            event: 'candidate_queued',
            senderId
          });
          let queue = this.queuedCandidates.get(senderId);
          if (!queue) {
            queue = [];
            this.queuedCandidates.set(senderId, queue);
          }
          queue.push(payload);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload));
          } catch (e: any) {
            logger.error(`Failed to add ICE candidate from [${senderId}]:`, e.message);
          }
        }
      }
      this.notifyPeersChange();
    } catch (err: any) {
      logger.error(`Failed to apply signaling payload from [${senderId}].`, err.message);
    }
  }

  private async processQueuedCandidates(peerId: string, pc: RTCPeerConnection) {
    const queue = this.queuedCandidates.get(peerId);
    if (queue && queue.length > 0) {
      console.log("[VOICE_TRACE] ICE_STATE", {
        event: 'applying_queued_candidates',
        peerId,
        count: queue.length
      });
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err: any) {
          logger.error(`Failed to apply queued ICE candidate for [${peerId}]:`, err.message);
        }
      }
      this.queuedCandidates.set(peerId, []);
    }
  }

  // --- AUDIO OUTPUT MANAGEMENTS ---

  private playRemoteAudio(peerId: string, stream: MediaStream) {
    let audio = this.audioElements.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.style.position = 'absolute';
      audio.style.pointerEvents = 'none';
      audio.style.opacity = '0';
      audio.style.width = '0px';
      audio.style.height = '0px';
      document.body.appendChild(audio);
      this.audioElements.set(peerId, audio);
    }
    
    audio.srcObject = stream;
    audio.muted = false;
    audio.volume = 1.0; // Standardize voice call playback volume

    console.log("[VOICE_DEBUG][AUDIO_PLAY]", {
      event: 'attempt',
      peerId,
      srcObjectSet: !!audio.srcObject
    });
    console.log("[VOICE_TRACE] AUDIO_PLAY", {
      event: 'attempt',
      peerId,
      srcObjectSet: !!audio.srcObject,
      muted: audio.muted,
      volume: audio.volume
    });
    console.log("[VOICE][PLAYBACK] Attempting to play remote peer audio", {
      peerId,
      streamId: stream.id,
      muted: audio.muted,
      volume: audio.volume,
      srcObject: !!audio.srcObject
    });

    audio.play()
      .then(() => {
        console.log("[VOICE_DEBUG][AUDIO_PLAY]", {
          event: 'success',
          peerId
        });
        console.log("[VOICE_TRACE] AUDIO_PLAY", {
          event: 'success',
          peerId
        });
        console.log("[VOICE][PLAYBACK] Remote audio playback STARTED successfully for peer:", peerId);
      })
      .catch((err: any) => {
        console.log("[VOICE_DEBUG][AUDIO_PLAY]", {
          event: 'failed',
          peerId,
          error: err.message
        });
        console.log("[VOICE_TRACE] AUDIO_PLAY", {
          event: 'failed',
          peerId,
          errorName: err.name,
          errorMessage: err.message
        });
        console.error("[VOICE][PLAYBACK] Remote audio playback FAILED for peer:", peerId, {
          name: err.name,
          message: err.message,
          code: err.code
        });
      });

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

  public sendData(label: string, message: string): void {
    if (label === 'SUBTITLE') {
      try {
        this.activeSubtitle = JSON.parse(message);
      } catch {
        this.activeSubtitle = null;
      }
    } else if (label === 'SUBTITLE_CLEAR') {
      this.activeSubtitle = null;
    }

    this.dataChannels.forEach((channel) => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify({
          type: 'CUSTOM_DATA',
          label,
          message
        }));
      }
    });
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
    this.queuedCandidates.clear();

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

  public hasPeerConnection(peerId: string): boolean {
    return this.pcs.has(peerId);
  }

  public getDataChannelState(peerId: string): string | null {
    const channel = this.dataChannels.get(peerId);
    return channel ? channel.readyState : null;
  }
}

export function logLocalFileE2E(stage: string, extra: { chunkIndex?: number; totalChunks?: number; bytesReceived?: number; totalBytes?: number; errorMsg?: string; targetId?: string } = {}) {
  try {
    const state = useRoomStore.getState();
    const roomId = state.room?.id || 'unknown';
    const hostId = state.room?.hostId || 'unknown';
    const participantId = state.participantId || 'unknown';
    const guestId = hostId === participantId ? 'host' : participantId;
    const fileName = state.playbackState.fileName || 'unknown';
    const fileSize = state.playbackState.fileSize || 0;
    
    let mimeType = 'video/mp4';
    const nameLower = fileName.toLowerCase();
    if (nameLower.endsWith('.webm')) {
      mimeType = 'video/webm';
    } else if (nameLower.endsWith('.mkv')) {
      mimeType = 'video/x-matroska';
    } else if (nameLower.endsWith('.ogg') || nameLower.endsWith('.ogv')) {
      mimeType = 'video/ogg';
    } else if (nameLower.endsWith('.mov')) {
      mimeType = 'video/quicktime';
    }

    const targetId = hostId === participantId ? extra.targetId || 'unknown' : hostId;
    const dcState = activeInstance ? activeInstance.getDataChannelState(targetId) || 'closed' : 'closed';

    console.log(`[LOCAL_FILE_E2E]${stage}`, {
      roomId,
      hostId,
      guestId,
      fileName,
      fileSize,
      mimeType,
      chunkIndex: extra.chunkIndex !== undefined ? extra.chunkIndex : -1,
      totalChunks: extra.totalChunks !== undefined ? extra.totalChunks : -1,
      bytesReceived: extra.bytesReceived !== undefined ? extra.bytesReceived : -1,
      totalBytes: extra.totalBytes !== undefined ? extra.totalBytes : -1,
      dataChannelReadyState: dcState,
      ...extra
    });
  } catch (err: any) {
    console.error('Error in logLocalFileE2E:', err.message);
  }
}

export function logLocalTransfer(stage: string, extra: { peerId?: string; chunkIndex?: number; totalChunks?: number; start?: number; end?: number; bytes?: number; totalBytes?: number } = {}) {
  try {
    const state = useRoomStore.getState();
    const roomId = state.room?.id || 'unknown';
    const hostId = state.room?.hostId || 'unknown';
    const participantId = state.participantId || 'unknown';
    const guestId = hostId === participantId ? 'host' : participantId;
    const peerId = extra.peerId || (hostId === participantId ? 'unknown' : hostId);

    const channel = activeInstance ? (activeInstance as any).dataChannels?.get(peerId) : null;
    const channelLabel = channel ? channel.label : 'none';
    const channelReadyState = channel ? channel.readyState : 'closed';

    let mimeType = 'video/mp4';
    const fileName = state.playbackState.fileName || 'unknown';
    const nameLower = fileName.toLowerCase();
    if (nameLower.endsWith('.webm')) {
      mimeType = 'video/webm';
    } else if (nameLower.endsWith('.mkv')) {
      mimeType = 'video/x-matroska';
    } else if (nameLower.endsWith('.ogg') || nameLower.endsWith('.ogv')) {
      mimeType = 'video/ogg';
    } else if (nameLower.endsWith('.mov')) {
      mimeType = 'video/quicktime';
    }

    console.log(`[LOCAL_TRANSFER]${stage}`, {
      roomId,
      hostId,
      guestId,
      peerId,
      channelLabel,
      channelReadyState,
      mimeType,
      chunkIndex: extra.chunkIndex !== undefined ? extra.chunkIndex : -1,
      totalChunks: extra.totalChunks !== undefined ? extra.totalChunks : -1,
      start: extra.start !== undefined ? extra.start : -1,
      end: extra.end !== undefined ? extra.end : -1,
      bytes: extra.bytes !== undefined ? extra.bytes : -1,
      totalBytes: extra.totalBytes !== undefined ? extra.totalBytes : (state.playbackState.fileSize || -1)
    });
  } catch (err: any) {
    console.error('Error in logLocalTransfer:', err.message);
  }
}
