-- Waiting-room statuses for guest admission by host.
-- Safe to run on existing databases.

ALTER TABLE meeting_participants
  DROP CONSTRAINT IF EXISTS meeting_participants_connection_status_check;

ALTER TABLE meeting_participants
  ADD CONSTRAINT meeting_participants_connection_status_check
  CHECK (
    connection_status IN (
      'waiting',
      'admitted',
      'connected',
      'disconnected',
      'reconnecting',
      'denied'
    )
  );

CREATE INDEX IF NOT EXISTS idx_meeting_participants_waiting
  ON meeting_participants (meeting_id, joined_at)
  WHERE left_at IS NULL AND connection_status = 'waiting';

COMMENT ON COLUMN meeting_participants.connection_status IS
  'waiting | admitted | connected | disconnected | reconnecting | denied';
