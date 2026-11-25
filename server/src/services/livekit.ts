import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver,
  type VideoGrant,
} from 'livekit-server-sdk';
import { getEnv } from '../config/env.js';

export type MuteMediaKind = 'microphone' | 'camera' | 'both';

function getRoomService(): RoomServiceClient {
  const env = getEnv();
  // RoomServiceClient expects HTTPS API URL; convert wss:// to https://
  const httpUrl = env.LIVEKIT_URL.replace(/^ws/i, 'http');
  return new RoomServiceClient(httpUrl, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

export async function createParticipantToken(options: {
  roomName: string;
  identity: string;
  displayName: string;
  isHost?: boolean;
  ttlSeconds?: number;
}): Promise<string> {
  const env = getEnv();
  const ttl = options.ttlSeconds ?? env.TOKEN_TTL_SECONDS;

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: options.identity,
    name: options.displayName,
    ttl,
    metadata: JSON.stringify({
      role: options.isHost ? 'host' : 'guest',
    }),
  });

  const grant: VideoGrant = {
    roomJoin: true,
    room: options.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: true,
  };

  if (options.isHost) {
    grant.roomAdmin = true;
  }

  at.addGrant(grant);
  return at.toJwt();
}

export async function listRoomParticipants(roomName: string) {
  const svc = getRoomService();
  try {
    return await svc.listParticipants(roomName);
  } catch {
    return [];
  }
}

export async function getRoomParticipantCount(roomName: string): Promise<number> {
  const participants = await listRoomParticipants(roomName);
  return participants.length;
}

export async function removeParticipantFromRoom(
  roomName: string,
  identity: string,
): Promise<void> {
  const svc = getRoomService();
  await svc.removeParticipant(roomName, identity);
}

function sourcesForKind(kind: MuteMediaKind): TrackSource[] {
  if (kind === 'microphone') return [TrackSource.MICROPHONE];
  if (kind === 'camera') return [TrackSource.CAMERA];
  return [TrackSource.MICROPHONE, TrackSource.CAMERA];
}

/** Server-mute a participant's published mic and/or camera tracks. */
export async function muteParticipantMedia(
  roomName: string,
  identity: string,
  kind: MuteMediaKind,
  muted = true,
): Promise<{ muted: string[] }> {
  const svc = getRoomService();
  const participants = await svc.listParticipants(roomName);
  const target = participants.find((p) => p.identity === identity);
  if (!target) {
    throw new Error('PARTICIPANT_NOT_FOUND');
  }

  const wanted = new Set(sourcesForKind(kind));
  const mutedSids: string[] = [];

  for (const track of target.tracks ?? []) {
    if (!wanted.has(track.source)) continue;
    // Already in desired state
    if (Boolean(track.muted) === muted) {
      mutedSids.push(track.sid);
      continue;
    }
    await svc.mutePublishedTrack(roomName, identity, track.sid, muted);
    mutedSids.push(track.sid);
  }

  return { muted: mutedSids };
}

export async function endRoom(roomName: string): Promise<void> {
  const svc = getRoomService();

  // Kick everyone first so clients drop even if deleteRoom is slow/unavailable.
  try {
    const participants = await svc.listParticipants(roomName);
    await Promise.allSettled(
      participants.map((p) => svc.removeParticipant(roomName, p.identity)),
    );
  } catch {
    // Room may already be gone
  }

  try {
    await svc.deleteRoom(roomName);
  } catch {
    // Room may already be empty / deleted — treat as success
  }
}

export function getWebhookReceiver(): WebhookReceiver {
  const env = getEnv();
  return new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

export function getLiveKitUrl(): string {
  return getEnv().LIVEKIT_URL;
}
