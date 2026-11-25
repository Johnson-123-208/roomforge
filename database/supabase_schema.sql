-- =============================================================================
-- RoomForge — Supabase PostgreSQL Schema
-- Idempotent initialization for the internal video conferencing application.
-- Run this in the Supabase SQL Editor (or via psql) to create tables from scratch.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Table: meetings
-- Stores meeting rooms. Passcodes and host secrets are stored ONLY as hashes.
-- Guests never query this table directly — all access goes through the backend
-- using the Supabase service role key.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  passcode_hash TEXT NOT NULL,
  host_secret_hash TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Capacity: support 1–8 participants per product requirements
  CONSTRAINT meetings_max_participants_check
    CHECK (max_participants >= 1 AND max_participants <= 8),

  -- Allowed lifecycle states
  CONSTRAINT meetings_status_check
    CHECK (status IN ('active', 'ended', 'expired')),

  -- Title must be non-empty after trimming
  CONSTRAINT meetings_title_nonempty_check
    CHECK (char_length(trim(title)) > 0),

  -- Room ID format: URL-safe identifier
  CONSTRAINT meetings_room_id_nonempty_check
    CHECK (char_length(trim(room_id)) >= 6)
);

COMMENT ON TABLE meetings IS
  'Meeting rooms for link+passcode access. Hashes only — never store plaintext secrets.';
COMMENT ON COLUMN meetings.room_id IS
  'Public URL-safe identifier used in /meeting/:roomId';
COMMENT ON COLUMN meetings.passcode_hash IS
  'Argon2id hash of the meeting passcode. Never returned to clients.';
COMMENT ON COLUMN meetings.host_secret_hash IS
  'Argon2id hash of the cryptographically secure host secret. Shown once at creation.';
COMMENT ON COLUMN meetings.max_participants IS
  'Hard cap on concurrent participants (default 8).';
COMMENT ON COLUMN meetings.status IS
  'active | ended | expired — ended/expired rooms reject new joins.';

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_meetings_room_id ON meetings (room_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings (status);
CREATE INDEX IF NOT EXISTS idx_meetings_expires_at ON meetings (expires_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings (created_at DESC);

-- -----------------------------------------------------------------------------
-- Table: meeting_participants
-- Tracks participant presence. LiveKit webhooks are the authoritative source
-- for connect/disconnect; frontend join/leave endpoints are best-effort.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_identity TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  connection_status TEXT NOT NULL DEFAULT 'connected',

  CONSTRAINT meeting_participants_display_name_nonempty_check
    CHECK (char_length(trim(display_name)) > 0),

  CONSTRAINT meeting_participants_identity_nonempty_check
    CHECK (char_length(trim(participant_identity)) > 0),

  CONSTRAINT meeting_participants_connection_status_check
    CHECK (
      connection_status IN (
        'waiting',
        'admitted',
        'connected',
        'disconnected',
        'reconnecting',
        'denied'
      )
    )
);

COMMENT ON TABLE meeting_participants IS
  'Presence records for meeting participants. Updated by APIs and LiveKit webhooks.';
COMMENT ON COLUMN meeting_participants.participant_identity IS
  'Stable LiveKit participant identity for this join session.';
COMMENT ON COLUMN meeting_participants.is_host IS
  'True when the participant joined with a verified host secret (server-validated).';
COMMENT ON COLUMN meeting_participants.connection_status IS
  'waiting | admitted | connected | disconnected | reconnecting | denied';

CREATE INDEX IF NOT EXISTS idx_meeting_participants_waiting
  ON meeting_participants (meeting_id, joined_at)
  WHERE left_at IS NULL AND connection_status = 'waiting';

-- One active (non-left) identity per meeting
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_participants_active_identity
  ON meeting_participants (meeting_id, participant_identity)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id
  ON meeting_participants (meeting_id);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_status
  ON meeting_participants (meeting_id, connection_status)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_participants_joined_at
  ON meeting_participants (joined_at DESC);

-- -----------------------------------------------------------------------------
-- Webhook event idempotency (optional but recommended)
-- Prevents duplicate processing of LiveKit webhook deliveries.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  room_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB
);

COMMENT ON TABLE webhook_events IS
  'Idempotency log for LiveKit webhook events. event_id must be unique.';

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at
  ON webhook_events (processed_at DESC);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Deny all direct client access. Backend uses the service role key which
-- bypasses RLS. This ensures passcode/host hashes are never readable via
-- the anon key or browser Supabase client.
-- -----------------------------------------------------------------------------
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running (idempotent)
DROP POLICY IF EXISTS meetings_deny_all ON meetings;
DROP POLICY IF EXISTS meeting_participants_deny_all ON meeting_participants;
DROP POLICY IF EXISTS webhook_events_deny_all ON webhook_events;

-- Explicit deny-all for anon/authenticated roles.
-- Service role bypasses RLS and is the only permitted accessor.
CREATE POLICY meetings_deny_all ON meetings
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY meeting_participants_deny_all ON meeting_participants
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY webhook_events_deny_all ON webhook_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- Helper: count currently connected participants for a meeting
-- Used by the backend for capacity enforcement (also enforced in application code).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION count_active_participants(p_meeting_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM meeting_participants
  WHERE meeting_id = p_meeting_id
    AND left_at IS NULL
    AND connection_status IN ('connected', 'reconnecting');
$$;

COMMENT ON FUNCTION count_active_participants(UUID) IS
  'Returns the number of currently active participants for capacity checks.';

-- -----------------------------------------------------------------------------
-- Helper: mark expired active meetings
-- Can be invoked periodically by the backend or a cron job.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_stale_meetings()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE meetings
  SET status = 'expired',
      ended_at = COALESCE(ended_at, NOW())
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION expire_stale_meetings() IS
  'Transitions active meetings past expires_at to expired status.';
