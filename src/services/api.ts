import type {
  ApiErrorBody,
  CreateMeetingResponse,
  HostTokenResponse,
  SafeMeeting,
  VerifyJoinResponse,
  WaitingPerson,
  VerifyJoinedResponse,
} from '../types/meeting';

const API_BASE = (
  import.meta.env.VITE_BACKEND_URL || 'https://roomforge-api.onrender.com'
).replace(/\/$/, '');

export const PUBLIC_LIVEKIT_URL = (import.meta.env.VITE_LIVEKIT_URL ?? '').trim();

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = body as ApiErrorBody | null;
    throw new ApiError(
      err?.error || `Request failed (${res.status})`,
      res.status,
      err?.code,
    );
  }

  return body as T;
}

export function createMeeting(input: {
  title: string;
  passcode: string;
  max_participants: number;
  create_access: string;
  frontend_origin?: string;
}): Promise<CreateMeetingResponse> {
  return request('/api/meetings', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      frontend_origin: input.frontend_origin || window.location.origin,
    }),
    headers: {
      'X-Create-Access': input.create_access,
    },
  });
}

export function getMeeting(roomId: string): Promise<SafeMeeting> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}`);
}

export function verifyAndJoin(
  roomId: string,
  input: {
    passcode: string;
    display_name: string;
    host_secret?: string;
    enable_camera?: boolean;
    enable_microphone?: boolean;
  },
): Promise<VerifyJoinResponse> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/verify`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getWaitingStatus(
  roomId: string,
  identity: string,
): Promise<{
  participant_identity: string;
  display_name: string;
  status: string;
  left: boolean;
}> {
  return request(
    `/api/meetings/${encodeURIComponent(roomId)}/waiting-status/${encodeURIComponent(identity)}`,
  );
}

export function claimAdmission(
  roomId: string,
  input: {
    participant_identity: string;
    display_name: string;
    passcode: string;
  },
): Promise<VerifyJoinedResponse> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/claim-admission`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listWaiting(
  roomId: string,
  auth: { host_token?: string; host_secret?: string },
): Promise<{ waiting: WaitingPerson[] }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/waiting`, {
    method: 'POST',
    body: JSON.stringify(auth),
  });
}

export function admitParticipant(
  roomId: string,
  participantIdentity: string,
  auth: { host_token?: string; host_secret?: string },
): Promise<{ ok: boolean }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/admit`, {
    method: 'POST',
    body: JSON.stringify({
      participant_identity: participantIdentity,
      ...auth,
    }),
  });
}

export function denyParticipant(
  roomId: string,
  participantIdentity: string,
  auth: { host_token?: string; host_secret?: string },
): Promise<{ ok: boolean }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/deny`, {
    method: 'POST',
    body: JSON.stringify({
      participant_identity: participantIdentity,
      ...auth,
    }),
  });
}

export function issueHostToken(
  roomId: string,
  hostSecret: string,
): Promise<HostTokenResponse> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/host-token`, {
    method: 'POST',
    body: JSON.stringify({ host_secret: hostSecret }),
  });
}

export function endMeeting(
  roomId: string,
  auth: { host_token?: string; host_secret?: string },
): Promise<{ ok: boolean; status: string }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/end`, {
    method: 'POST',
    body: JSON.stringify(auth),
  });
}

export function removeParticipant(
  roomId: string,
  participantIdentity: string,
  auth: { host_token?: string; host_secret?: string },
): Promise<{ ok: boolean }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/remove-participant`, {
    method: 'POST',
    body: JSON.stringify({
      participant_identity: participantIdentity,
      ...auth,
    }),
  });
}

export function muteParticipant(
  roomId: string,
  participantIdentity: string,
  track: 'microphone' | 'camera' | 'both',
  auth: { host_token?: string; host_secret?: string },
  muted = true,
): Promise<{ ok: boolean; track: string; muted: boolean }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/mute-participant`, {
    method: 'POST',
    body: JSON.stringify({
      participant_identity: participantIdentity,
      track,
      muted,
      ...auth,
    }),
  });
}

export function recordJoin(
  roomId: string,
  data: { participant_identity: string; display_name: string; is_host?: boolean },
): Promise<{ ok: boolean }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/participants/join`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function recordLeave(
  roomId: string,
  participantIdentity: string,
): Promise<{ ok: boolean }> {
  return request(`/api/meetings/${encodeURIComponent(roomId)}/participants/leave`, {
    method: 'POST',
    body: JSON.stringify({ participant_identity: participantIdentity }),
  });
}
