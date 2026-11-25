import { getEnv } from '../config/env.js';
import { getSupabase, type MeetingRow, type ParticipantRow } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';
import {
  generateHostSecret,
  generatePasscode,
  generateParticipantIdentity,
  generateRoomId,
  hashSecret,
  normalizePasscode,
  signHostToken,
  verifyHostToken,
  verifyPasscode,
  verifySecret,
} from '../utils/crypto.js';
import {
  createParticipantToken,
  endRoom,
  getLiveKitUrl,
  getRoomParticipantCount,
  muteParticipantMedia,
  removeParticipantFromRoom,
  type MuteMediaKind,
} from './livekit.js';
import type { CreateMeetingInput, VerifyMeetingInput } from '../types/api.js';
import { resolveFrontendBaseUrl } from '../utils/frontendUrl.js';

function publicMeeting(meeting: MeetingRow) {
  return {
    room_id: meeting.room_id,
    title: meeting.title,
    status: meeting.status,
    max_participants: meeting.max_participants,
    created_at: meeting.created_at,
    expires_at: meeting.expires_at,
    ended_at: meeting.ended_at,
  };
}

async function getMeetingByRoomId(roomId: string): Promise<MeetingRow> {
  const { data, error } = await getSupabase()
    .from('meetings')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) throw new AppError(500, 'Failed to look up meeting');
  if (!data) throw new AppError(404, 'Meeting not found', 'MEETING_NOT_FOUND');
  return data as MeetingRow;
}

async function ensureMeetingJoinable(meeting: MeetingRow): Promise<void> {
  if (meeting.status === 'ended') {
    throw new AppError(403, 'This meeting has ended', 'MEETING_ENDED');
  }
  if (meeting.status === 'expired') {
    throw new AppError(403, 'This meeting has expired', 'MEETING_EXPIRED');
  }
  if (meeting.expires_at && new Date(meeting.expires_at) < new Date()) {
    await getSupabase()
      .from('meetings')
      .update({ status: 'expired', ended_at: new Date().toISOString() })
      .eq('id', meeting.id);
    throw new AppError(403, 'This meeting has expired', 'MEETING_EXPIRED');
  }
}

export async function createMeeting(
  input: CreateMeetingInput,
  requestMeta?: { origin?: string | null },
) {
  const env = getEnv();
  const roomId = generateRoomId();
  const passcode = normalizePasscode(input.passcode || generatePasscode());
  const hostSecret = generateHostSecret();
  const expiresAt = new Date(
    Date.now() + env.MEETING_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [passcodeHash, hostSecretHash] = await Promise.all([
    hashSecret(passcode),
    hashSecret(hostSecret),
  ]);

  const { data, error } = await getSupabase()
    .from('meetings')
    .insert({
      room_id: roomId,
      title: input.title.trim(),
      passcode_hash: passcodeHash,
      host_secret_hash: hostSecretHash,
      max_participants: input.max_participants ?? 8,
      status: 'active',
      expires_at: expiresAt,
    })
    .select('room_id, title, max_participants, created_at, expires_at, status')
    .single();

  if (error || !data) {
    throw new AppError(500, 'Failed to create meeting');
  }

  const frontendBase = resolveFrontendBaseUrl({
    frontendOriginBody: input.frontend_origin,
    requestOrigin: requestMeta?.origin,
    envFrontendUrl: env.FRONTEND_URL,
  });
  const meetingUrl = `${frontendBase}/meeting/${roomId}`;

  return {
    room_id: data.room_id,
    title: data.title,
    meeting_url: meetingUrl,
    passcode,
    host_secret: hostSecret,
    max_participants: data.max_participants,
    expires_at: data.expires_at,
    status: data.status,
  };
}

export async function getSafeMeeting(roomId: string) {
  const meeting = await getMeetingByRoomId(roomId);
  // Soft-expire if needed without throwing for GET
  if (
    meeting.status === 'active' &&
    meeting.expires_at &&
    new Date(meeting.expires_at) < new Date()
  ) {
    await getSupabase()
      .from('meetings')
      .update({ status: 'expired', ended_at: new Date().toISOString() })
      .eq('id', meeting.id);
    return publicMeeting({ ...meeting, status: 'expired' });
  }
  return publicMeeting(meeting);
}

async function countInRoom(meeting: MeetingRow): Promise<number> {
  const [liveCount, dbCountResult] = await Promise.all([
    getRoomParticipantCount(meeting.room_id),
    getSupabase()
      .from('meeting_participants')
      .select('id', { count: 'exact', head: true })
      .eq('meeting_id', meeting.id)
      .is('left_at', null)
      .in('connection_status', ['connected', 'reconnecting', 'admitted']),
  ]);
  return Math.max(liveCount, dbCountResult.count ?? 0);
}

export async function verifyAndJoin(roomId: string, input: VerifyMeetingInput) {
  const meeting = await getMeetingByRoomId(roomId);
  await ensureMeetingJoinable(meeting);

  const passcodeValid = await verifyPasscode(meeting.passcode_hash, input.passcode);
  if (!passcodeValid) {
    throw new AppError(401, 'Incorrect passcode', 'INVALID_PASSCODE');
  }

  let isHost = false;
  if (input.host_secret) {
    isHost = await verifySecret(
      meeting.host_secret_hash,
      input.host_secret.trim(),
    );
    if (!isHost) {
      throw new AppError(401, 'Invalid host secret', 'INVALID_HOST_SECRET');
    }
  }

  const effectiveCount = await countInRoom(meeting);
  if (effectiveCount >= meeting.max_participants) {
    throw new AppError(
      403,
      `This meeting is full (max ${meeting.max_participants} participants)`,
      'MEETING_FULL',
    );
  }

  const identity = generateParticipantIdentity(input.display_name);
  const displayName = input.display_name.trim();

  // Hosts enter immediately. Guests wait for host admission.
  if (!isHost) {
    const { error } = await getSupabase().from('meeting_participants').insert({
      meeting_id: meeting.id,
      participant_identity: identity,
      display_name: displayName,
      is_host: false,
      connection_status: 'waiting',
    });
    if (error) throw new AppError(500, 'Failed to join waiting room');

    return {
      status: 'waiting' as const,
      meeting: publicMeeting(meeting),
      participant_identity: identity,
      display_name: displayName,
      is_host: false,
      message: 'Waiting for the host to admit you.',
    };
  }

  const token = await createParticipantToken({
    roomName: meeting.room_id,
    identity,
    displayName,
    isHost: true,
  });

  await getSupabase().from('meeting_participants').insert({
    meeting_id: meeting.id,
    participant_identity: identity,
    display_name: displayName,
    is_host: true,
    connection_status: 'connected',
  });

  const hostToken = signHostToken(
    { roomId: meeting.room_id, meetingId: meeting.id },
    getEnv().HOST_TOKEN_SECRET!,
    getEnv().TOKEN_TTL_SECONDS,
  );

  return {
    status: 'joined' as const,
    meeting: publicMeeting(meeting),
    token,
    participant_identity: identity,
    display_name: displayName,
    is_host: true,
    host_token: hostToken,
    livekit_url: getLiveKitUrl(),
  };
}

export async function listWaitingParticipants(
  roomId: string,
  auth: { host_token?: string; host_secret?: string },
) {
  const meeting = await getMeetingByRoomId(roomId);
  await authorizeHost(meeting, auth);

  const { data, error } = await getSupabase()
    .from('meeting_participants')
    .select('participant_identity, display_name, joined_at, connection_status')
    .eq('meeting_id', meeting.id)
    .eq('connection_status', 'waiting')
    .is('left_at', null)
    .order('joined_at', { ascending: true });

  if (error) throw new AppError(500, 'Failed to load waiting list');
  return { waiting: data ?? [] };
}

export async function getWaitingStatus(roomId: string, identity: string) {
  const meeting = await getMeetingByRoomId(roomId);
  const { data, error } = await getSupabase()
    .from('meeting_participants')
    .select('participant_identity, display_name, connection_status, left_at')
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', identity)
    .maybeSingle();

  if (error) throw new AppError(500, 'Failed to check waiting status');
  if (!data) throw new AppError(404, 'Join request not found', 'REQUEST_NOT_FOUND');

  return {
    participant_identity: data.participant_identity,
    display_name: data.display_name,
    status: data.connection_status,
    left: Boolean(data.left_at),
  };
}

export async function admitParticipant(
  roomId: string,
  participantIdentity: string,
  auth: { host_token?: string; host_secret?: string },
) {
  const meeting = await getMeetingByRoomId(roomId);
  await authorizeHost(meeting, auth);

  const effectiveCount = await countInRoom(meeting);
  if (effectiveCount >= meeting.max_participants) {
    throw new AppError(403, 'Meeting is full', 'MEETING_FULL');
  }

  const { data, error } = await getSupabase()
    .from('meeting_participants')
    .update({ connection_status: 'admitted' })
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', participantIdentity)
    .eq('connection_status', 'waiting')
    .is('left_at', null)
    .select('participant_identity, display_name')
    .maybeSingle();

  if (error) throw new AppError(500, 'Failed to admit participant');
  if (!data) throw new AppError(404, 'Waiting participant not found', 'NOT_WAITING');

  return { ok: true, participant: data };
}

export async function denyParticipant(
  roomId: string,
  participantIdentity: string,
  auth: { host_token?: string; host_secret?: string },
) {
  const meeting = await getMeetingByRoomId(roomId);
  await authorizeHost(meeting, auth);

  const { data, error } = await getSupabase()
    .from('meeting_participants')
    .update({
      connection_status: 'denied',
      left_at: new Date().toISOString(),
    })
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', participantIdentity)
    .eq('connection_status', 'waiting')
    .is('left_at', null)
    .select('participant_identity')
    .maybeSingle();

  if (error) throw new AppError(500, 'Failed to deny participant');
  if (!data) throw new AppError(404, 'Waiting participant not found', 'NOT_WAITING');

  return { ok: true };
}

export async function claimAdmission(
  roomId: string,
  input: { participant_identity: string; display_name: string; passcode: string },
) {
  const meeting = await getMeetingByRoomId(roomId);
  await ensureMeetingJoinable(meeting);

  const passcodeValid = await verifyPasscode(meeting.passcode_hash, input.passcode);
  if (!passcodeValid) {
    throw new AppError(401, 'Incorrect passcode', 'INVALID_PASSCODE');
  }

  const { data: row, error } = await getSupabase()
    .from('meeting_participants')
    .select('*')
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', input.participant_identity)
    .eq('connection_status', 'admitted')
    .is('left_at', null)
    .maybeSingle();

  if (error) throw new AppError(500, 'Failed to claim admission');
  if (!row) {
    throw new AppError(403, 'Not admitted yet', 'NOT_ADMITTED');
  }

  const effectiveCount = await countInRoom(meeting);
  // Admitted row already counts; allow if under or equal after they're connected
  if (effectiveCount > meeting.max_participants) {
    throw new AppError(403, 'Meeting is full', 'MEETING_FULL');
  }

  const displayName = input.display_name.trim() || row.display_name;
  const token = await createParticipantToken({
    roomName: meeting.room_id,
    identity: input.participant_identity,
    displayName,
    isHost: false,
  });

  await getSupabase()
    .from('meeting_participants')
    .update({ connection_status: 'connected', display_name: displayName })
    .eq('id', row.id);

  return {
    status: 'joined' as const,
    meeting: publicMeeting(meeting),
    token,
    participant_identity: input.participant_identity,
    display_name: displayName,
    is_host: false,
    livekit_url: getLiveKitUrl(),
  };
}

async function authorizeHost(
  meeting: MeetingRow,
  auth: { host_token?: string; host_secret?: string },
): Promise<void> {
  const token = auth.host_token?.trim();
  const secret = auth.host_secret?.trim();

  if (token) {
    const payload = verifyHostToken(token, getEnv().HOST_TOKEN_SECRET!);
    if (
      payload &&
      payload.roomId === meeting.room_id &&
      payload.meetingId === meeting.id
    ) {
      return;
    }
    // Fall through to host_secret — expired tokens used to block ending even when
    // the browser still had a valid host secret from meeting creation.
  }

  if (secret) {
    const ok = await verifySecret(meeting.host_secret_hash, secret);
    if (!ok) throw new AppError(403, 'Invalid host secret', 'INVALID_HOST_SECRET');
    return;
  }

  if (token) {
    throw new AppError(403, 'Invalid or expired host token', 'INVALID_HOST_TOKEN');
  }

  throw new AppError(403, 'Host authorization required', 'HOST_AUTH_REQUIRED');
}

export async function issueHostToken(roomId: string, hostSecret: string) {
  const meeting = await getMeetingByRoomId(roomId);
  await ensureMeetingJoinable(meeting);

  const ok = await verifySecret(meeting.host_secret_hash, hostSecret);
  if (!ok) throw new AppError(403, 'Invalid host secret', 'INVALID_HOST_SECRET');

  const ttl = getEnv().TOKEN_TTL_SECONDS;
  const hostToken = signHostToken(
    { roomId: meeting.room_id, meetingId: meeting.id },
    getEnv().HOST_TOKEN_SECRET!,
    ttl,
  );

  return {
    host_token: hostToken,
    expires_in: ttl,
    meeting: publicMeeting(meeting),
  };
}

export async function endMeeting(
  roomId: string,
  auth: { host_token?: string; host_secret?: string },
) {
  const meeting = await getMeetingByRoomId(roomId);
  await authorizeHost(meeting, auth);

  if (meeting.status !== 'active') {
    return { ok: true, status: meeting.status };
  }

  const endedAt = new Date().toISOString();
  const { error } = await getSupabase()
    .from('meetings')
    .update({ status: 'ended', ended_at: endedAt })
    .eq('id', meeting.id);

  if (error) throw new AppError(500, 'Failed to end meeting');

  await getSupabase()
    .from('meeting_participants')
    .update({
      left_at: endedAt,
      connection_status: 'disconnected',
    })
    .eq('meeting_id', meeting.id)
    .is('left_at', null);

  await endRoom(meeting.room_id);

  return { ok: true, status: 'ended' as const, ended_at: endedAt };
}

export async function removeParticipant(
  roomId: string,
  participantIdentity: string,
  auth: { host_token?: string; host_secret?: string },
) {
  const meeting = await getMeetingByRoomId(roomId);
  await authorizeHost(meeting, auth);

  try {
    await removeParticipantFromRoom(meeting.room_id, participantIdentity);
  } catch {
    throw new AppError(404, 'Participant not found in room', 'PARTICIPANT_NOT_FOUND');
  }

  await getSupabase()
    .from('meeting_participants')
    .update({
      left_at: new Date().toISOString(),
      connection_status: 'disconnected',
    })
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', participantIdentity)
    .is('left_at', null);

  return { ok: true, participant_identity: participantIdentity };
}

export async function muteParticipant(
  roomId: string,
  participantIdentity: string,
  track: MuteMediaKind,
  auth: { host_token?: string; host_secret?: string },
  muted = true,
) {
  const meeting = await getMeetingByRoomId(roomId);
  await authorizeHost(meeting, auth);

  if (meeting.status !== 'active') {
    throw new AppError(409, 'Meeting is not active', 'MEETING_INACTIVE');
  }

  try {
    const result = await muteParticipantMedia(
      meeting.room_id,
      participantIdentity,
      track,
      muted,
    );
    return {
      ok: true as const,
      participant_identity: participantIdentity,
      track,
      muted,
      track_sids: result.muted,
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'PARTICIPANT_NOT_FOUND') {
      throw new AppError(404, 'Participant not found in room', 'PARTICIPANT_NOT_FOUND');
    }
    throw new AppError(500, 'Could not update participant media', 'MUTE_FAILED');
  }
}

export async function recordParticipantJoin(
  roomId: string,
  identity: string,
  displayName: string,
  isHost = false,
) {
  const meeting = await getMeetingByRoomId(roomId);

  // Prefer an active row; otherwise reopen the latest row for this identity
  // so a page refresh does not create a duplicate "left" participant.
  const { data: active } = await getSupabase()
    .from('meeting_participants')
    .select('id')
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', identity)
    .is('left_at', null)
    .maybeSingle();

  if (active) {
    await getSupabase()
      .from('meeting_participants')
      .update({ connection_status: 'connected', display_name: displayName })
      .eq('id', (active as ParticipantRow).id);
    return { ok: true };
  }

  const { data: recent } = await getSupabase()
    .from('meeting_participants')
    .select('id')
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', identity)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    await getSupabase()
      .from('meeting_participants')
      .update({
        connection_status: 'connected',
        display_name: displayName,
        left_at: null,
        is_host: isHost,
      })
      .eq('id', (recent as ParticipantRow).id);
    return { ok: true };
  }

  await getSupabase().from('meeting_participants').insert({
    meeting_id: meeting.id,
    participant_identity: identity,
    display_name: displayName,
    is_host: isHost,
    connection_status: 'connected',
  });

  return { ok: true };
}

export async function recordParticipantLeave(roomId: string, identity: string) {
  const meeting = await getMeetingByRoomId(roomId);

  await getSupabase()
    .from('meeting_participants')
    .update({
      left_at: new Date().toISOString(),
      connection_status: 'disconnected',
    })
    .eq('meeting_id', meeting.id)
    .eq('participant_identity', identity)
    .is('left_at', null);

  return { ok: true };
}

export async function handleParticipantWebhook(opts: {
  eventId: string;
  eventType: string;
  roomName: string;
  identity?: string;
  displayName?: string;
  payload: unknown;
}) {
  const sb = getSupabase();

  // Idempotency
  const { error: insertErr } = await sb.from('webhook_events').insert({
    event_id: opts.eventId,
    event_type: opts.eventType,
    room_id: opts.roomName,
    payload: opts.payload as object,
  });

  if (insertErr) {
    // Unique violation — already processed
    if (insertErr.code === '23505') return { ok: true, duplicate: true };
  }

  const { data: meeting } = await sb
    .from('meetings')
    .select('id')
    .eq('room_id', opts.roomName)
    .maybeSingle();

  if (!meeting || !opts.identity) return { ok: true };

  const meetingId = (meeting as { id: string }).id;

  if (opts.eventType === 'participant_joined') {
    const { data: existing } = await sb
      .from('meeting_participants')
      .select('id')
      .eq('meeting_id', meetingId)
      .eq('participant_identity', opts.identity)
      .is('left_at', null)
      .maybeSingle();

    if (existing) {
      await sb
        .from('meeting_participants')
        .update({ connection_status: 'connected' })
        .eq('id', (existing as { id: string }).id);
    } else {
      await sb.from('meeting_participants').insert({
        meeting_id: meetingId,
        participant_identity: opts.identity,
        display_name: opts.displayName || opts.identity,
        connection_status: 'connected',
      });
    }
  }

  if (
    opts.eventType === 'participant_left' ||
    opts.eventType === 'participant_connection_aborted'
  ) {
    // Mark reconnecting rather than fully left — page refresh disconnects briefly
    // then the client reconnects with the same identity and recordJoin clears this.
    await sb
      .from('meeting_participants')
      .update({
        connection_status: 'reconnecting',
      })
      .eq('meeting_id', meetingId)
      .eq('participant_identity', opts.identity)
      .is('left_at', null);
  }

  return { ok: true };
}

export { generatePasscode };
