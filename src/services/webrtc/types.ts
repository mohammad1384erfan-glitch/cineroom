export type PeerState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface PeerConnectionInfo {
  peerId: string;
  name: string;
  state: PeerState;
  hasAudio: boolean;
  isMuted: boolean;
  audioStream?: MediaStream | null;
}

export type WebRTCListener<T> = (data: T) => void;

export interface WebRTCEventListeners {
  onPeersStateChange?: WebRTCListener<PeerConnectionInfo[]>;
  onLocalAudioToggle?: WebRTCListener<{ isMuted: boolean }>;
  onRemoteStreamReceived?: WebRTCListener<{ peerId: string; stream: MediaStream }>;
  onDataChannelReceived?: WebRTCListener<{ peerId: string; label: string; message: string }>;
  onTransferProgress?: WebRTCListener<{ fileId: string; progress: number; receivedBytes: number }>;
  onChunkReceived?: WebRTCListener<{ fileId: string; chunkIndex: number; totalChunks: number; buffer: ArrayBuffer }>;
}
