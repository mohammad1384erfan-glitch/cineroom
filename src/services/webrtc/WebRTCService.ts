import { WebRTCEventListeners } from './types';

export interface WebRTCService {
  /**
   * Initializes local devices, prompts audio permissions, and sets up ICE servers.
   */
  initialize(localUserId: string, localNickname: string): Promise<void>;

  /**
   * Triggers signaling and creates a peer connection with a specific user.
   */
  connectToPeer(peerId: string, peerName: string): Promise<void>;

  /**
   * Safely disposes and cleans up resources associated with a specific peer.
   */
  disconnectFromPeer(peerId: string): void;

  /**
   * Processes a incoming SDP offer/answer or ICE candidate from the signaling channel.
   */
  handleSignalingMessage(senderId: string, type: string, payload: any): Promise<void>;

  /**
   * Toggles local microphone state and broadcasts updates.
   */
  toggleMute(): boolean;

  /**
   * Adjusts the rendering volume (0.0 to 1.0) of a specific peer's audio stream.
   */
  setPeerVolume(peerId: string, volume: number): void;

  /**
   * Sends low-latency data to all connected peers over WebRTC data channels.
   */
  sendData(label: string, message: string): void;

  /**
   * Disposes all connections and resets local devices (e.g. on exit).
   */
  close(): void;

  /**
   * Registers a local media file to stream progressively to other participants.
   */
  startStreamingFile(file: File | null): Promise<void>;

  /**
   * Dispatches a chunk request over WebRTC DataChannels for progressive buffering.
   */
  requestFileChunk(fileId: string, index: number): void;

  /**
   * Attach hooks for UI reactivity.
   */
  setListeners(listeners: WebRTCEventListeners): void;

  /**
   * Clear all active hooks.
   */
  clearListeners(): void;
}
