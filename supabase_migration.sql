-- Supabase SQL Migration: Fix host_id and participant_id UUID type matching, pgcrypto qualification, and current_time column quoting in RPCs
-- Resolves the errors:
--   - "Column 'id' is of type uuid but expression is of type text"
--   - "Column 'host_id' is of type uuid but expression is of type text"
--   - "Failed to change video via RPC:" / "Failed to update playback state:"

-- 1. Ensure pgcrypto is enabled in the extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- 2. Update create_room_secure with qualified extensions.crypt and extensions.gen_salt
CREATE OR REPLACE FUNCTION create_room_secure(
  room_name TEXT,
  room_capacity INT,
  room_password TEXT,
  host_nickname TEXT,
  host_avatar TEXT,
  room_theme TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_room_id UUID;
  new_code TEXT;
  caller_uid UUID;
  new_part_id UUID; -- Changed from TEXT to UUID to match participants.id primary key
  pwd_hash TEXT := NULL;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i INT;
  code_ok BOOLEAN := FALSE;
BEGIN
  -- Generate unique 6-character room code
  WHILE NOT code_ok LOOP
    new_code := '';
    FOR i IN 1..6 LOOP
      new_code := concat(new_code, substr(chars, floor(random() * length(chars) + 1)::int, 1));
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM rooms WHERE code = new_code) THEN
      code_ok := TRUE;
    END IF;
  END LOOP;

  new_room_id := extensions.gen_random_uuid();
  
  -- Bind IDs to the caller's authenticated user UUID (required for foreign key constraints)
  caller_uid := auth.uid();
  if caller_uid IS NULL then
    RAISE EXCEPTION 'Unauthorized: Cryptographic Auth session missing.';
  end if;

  new_part_id := caller_uid;

  -- Use extensions schema qualification for pgcrypto functions
  IF room_password IS NOT NULL AND room_password <> '' THEN
    pwd_hash := extensions.crypt(room_password, extensions.gen_salt('bf', 8));
  END IF;

  INSERT INTO rooms (id, name, code, capacity, has_password, password_hash, host_id, theme)
  VALUES (new_room_id, room_name, new_code, room_capacity, (room_password IS NOT NULL AND room_password <> ''), pwd_hash, caller_uid, room_theme);

  INSERT INTO participants (id, room_id, name, avatar, is_host, joined_at, ping, is_muted, is_connected, connection_status, is_speaking)
  VALUES (new_part_id, new_room_id, host_nickname, host_avatar, TRUE, extract(epoch from now())::bigint * 1000, 0, FALSE, TRUE, 'connected', FALSE);

  INSERT INTO playback_states (room_id, source_type, source_url, file_name, file_size, is_playing, playing, "current_time", video_id, state_version, event_id, last_update_timestamp)
  VALUES (new_room_id, 'url', '', '', 0, FALSE, FALSE, 0, '', 0, '', extract(epoch from now())::bigint * 1000);

  RETURN jsonb_build_object(
    'roomId', new_room_id,
    'code', new_code,
    'participantId', new_part_id
  );
END;
$$;

-- 3. Update join_room_secure with qualified extensions.crypt
CREATE OR REPLACE FUNCTION join_room_secure(
  room_code TEXT,
  user_nickname TEXT,
  user_avatar TEXT,
  room_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_room_id UUID;
  target_has_password BOOLEAN;
  target_pwd_hash TEXT;
  target_is_locked BOOLEAN;
  target_capacity INT;
  curr_count INT;
  caller_uid UUID;
  new_part_id UUID; -- Changed from TEXT to UUID to match participants.id primary key
BEGIN
  SELECT id, has_password, password_hash, is_locked, capacity INTO target_room_id, target_has_password, target_pwd_hash, target_is_locked, target_capacity
  FROM rooms
  WHERE code = UPPER(TRIM(room_code));

  IF target_room_id IS NULL THEN
    RAISE EXCEPTION 'Unable to join room. Please verify the code and password.';
  END IF;

  IF target_has_password THEN
    -- Use extensions schema qualification for pgcrypto functions
    IF target_pwd_hash IS NULL OR target_pwd_hash <> extensions.crypt(room_password, target_pwd_hash) THEN
      RAISE EXCEPTION 'Unable to join room. Please verify the code and password.';
    END IF;
  END IF;

  IF target_is_locked THEN
    RAISE EXCEPTION 'Unable to join room. This room is locked by the Host.';
  END IF;

  SELECT COUNT(*) INTO curr_count FROM participants WHERE room_id = target_room_id;
  IF curr_count >= target_capacity THEN
    RAISE EXCEPTION 'Unable to join room. Room is at maximum capacity.';
  END IF;

  -- Bind IDs to the caller's authenticated user UUID (required for foreign key constraints)
  caller_uid := auth.uid();
  if caller_uid IS NULL then
    RAISE EXCEPTION 'Unauthorized: Cryptographic Auth session missing.';
  end if;

  new_part_id := caller_uid;

  INSERT INTO participants (id, room_id, name, avatar, is_host, joined_at, ping, is_muted, is_connected, connection_status, is_speaking)
  VALUES (new_part_id, target_room_id, user_nickname, user_avatar, FALSE, extract(epoch from now())::bigint * 1000, 0, FALSE, TRUE, 'connected', FALSE);

  -- sender_id changed from 'system' (text) to caller_uid (UUID) to match chat_messages.sender_id constraint
  INSERT INTO chat_messages (id, room_id, sender_id, sender_name, sender_avatar, content, timestamp, is_system)
  VALUES (concat('sys-', encode(extensions.gen_random_bytes(4), 'hex')), target_room_id, caller_uid, 'System', '', concat(user_nickname, ' joined the watch party'), extract(epoch from now())::bigint * 1000, TRUE);

  RETURN jsonb_build_object(
    'roomId', target_room_id,
    'participantId', new_part_id,
    'roomName', (SELECT name FROM rooms WHERE id = target_room_id)
  );
END;
$$;

-- 4. Update playback_change_video to use quoted "current_time" column reference
CREATE OR REPLACE FUNCTION playback_change_video(
  p_room_id UUID,
  p_source_type TEXT,
  p_source_url TEXT,
  p_file_name TEXT,
  p_file_size BIGINT,
  p_video_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_is_host BOOLEAN;
  has_permission BOOLEAN;
BEGIN
  SELECT (host_id = auth.uid()) INTO caller_is_host
  FROM rooms
  WHERE id = p_room_id;

  IF caller_is_host IS NOT TRUE THEN
    SELECT can_change_video INTO has_permission
    FROM participants
    WHERE room_id = p_room_id AND id = auth.uid();

    IF has_permission IS NOT TRUE THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to change the video source.';
    END IF;
  END IF;

  UPDATE playback_states
  SET
    source_type = p_source_type,
    source_url = p_source_url,
    file_name = p_file_name,
    file_size = p_file_size,
    video_id = p_video_id,
    is_playing = FALSE,
    playing = FALSE,
    "current_time" = 0, -- Quoted current_time column
    state_version = state_version + 1,
    event_id = concat('chg-', encode(extensions.gen_random_bytes(4), 'hex')),
    last_update_timestamp = EXTRACT(epoch FROM now())::BIGINT * 1000,
    updated_at = timezone('utc'::text, now())
  WHERE room_id = p_room_id;
END;
$$;

-- 5. Update playback_play_pause to use quoted "current_time" column reference
CREATE OR REPLACE FUNCTION playback_play_pause(
  p_room_id UUID,
  p_is_playing BOOLEAN,
  p_event_id TEXT,
  p_current_time DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_is_host BOOLEAN;
  has_permission BOOLEAN;
BEGIN
  SELECT (host_id = auth.uid()) INTO caller_is_host
  FROM rooms
  WHERE id = p_room_id;

  IF caller_is_host IS NOT TRUE THEN
    SELECT can_play_pause INTO has_permission
    FROM participants
    WHERE room_id = p_room_id AND id = auth.uid();

    IF has_permission IS NOT TRUE THEN
      RAISE EXCEPTION 'Unauthorized: You do not have play/pause permission.';
    END IF;
  END IF;

  UPDATE playback_states
  SET
    is_playing = p_is_playing,
    playing = p_is_playing,
    "current_time" = p_current_time, -- Quoted current_time column
    event_id = p_event_id,
    state_version = state_version + 1,
    last_update_timestamp = EXTRACT(epoch FROM now())::BIGINT * 1000,
    updated_at = timezone('utc'::text, now())
  WHERE room_id = p_room_id;
END;
$$;

-- 6. Update playback_seek to use quoted "current_time" column reference
CREATE OR REPLACE FUNCTION playback_seek(
  p_room_id UUID,
  p_current_time DOUBLE PRECISION,
  p_event_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_is_host BOOLEAN;
  has_permission BOOLEAN;
BEGIN
  SELECT (host_id = auth.uid()) INTO caller_is_host
  FROM rooms
  WHERE id = p_room_id;

  IF caller_is_host IS NOT TRUE THEN
    SELECT can_seek INTO has_permission
    FROM participants
    WHERE room_id = p_room_id AND id = auth.uid();

    IF has_permission IS NOT TRUE THEN
      RAISE EXCEPTION 'Unauthorized: You do not have seek permission.';
    END IF;
  END IF;

  UPDATE playback_states
  SET
    "current_time" = p_current_time, -- Quoted current_time column
    event_id = p_event_id,
    state_version = state_version + 1,
    last_update_timestamp = EXTRACT(epoch FROM now())::BIGINT * 1000,
    updated_at = timezone('utc'::text, now())
  WHERE room_id = p_room_id;
END;
$$;
