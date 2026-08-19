import { MockRealtimeService } from './realtime/MockRealtimeService';
import { SupabaseRealtimeService } from './realtime/SupabaseRealtimeService';
import { MockWebRTCService } from './webrtc/MockWebRTCService';
import { RealtimeService } from './realtime/RealtimeService';
import { WebRTCService } from './webrtc/WebRTCService';
import { logger } from './diagnostics/logger';

const useMock = import.meta.env.VITE_USE_MOCK_SERVICES === 'true'; // Default to false (Supabase)
logger.info(`Service Factory loaded. Sandbox Mode: ${useMock}`);

export const realtimeService: RealtimeService = useMock 
  ? new MockRealtimeService() 
  : new SupabaseRealtimeService();
export const webrtcService: WebRTCService = new MockWebRTCService();

// Export types
export * from './realtime/types';
export * from './webrtc/types';
export * from './diagnostics/logger';
