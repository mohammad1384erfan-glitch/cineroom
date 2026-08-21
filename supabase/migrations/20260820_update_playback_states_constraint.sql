-- Supabase SQL Migration: Update source_type check constraint on playback_states
-- Allows HLS, YouTube, Vimeo, Dailymotion, Aparat, and Generic Embed players

-- 1. Drop existing constraint
ALTER TABLE playback_states 
DROP CONSTRAINT IF EXISTS playback_states_source_type_check;

-- 2. Create updated constraint supporting all new platform source types
ALTER TABLE playback_states 
ADD CONSTRAINT playback_states_source_type_check 
CHECK (source_type IN ('local', 'url', 'hls', 'youtube', 'vimeo', 'dailymotion', 'aparat', 'embed'));
