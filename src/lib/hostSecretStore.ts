/**
 * Host secret recovery
 * --------------------
 * The host secret is shown ONLY at meeting creation and is never stored in
 * the database as plaintext. To keep the owner able to end/remove after a
 * page refresh, we persist it in the browser:
 *
 * - sessionStorage: survives refresh within the same tab (default, safer)
 * - localStorage: optional "Remember on this device" for longer recovery
 *
 * Guests never receive this value. Possession of the meeting link + passcode
 * grants guest A/V access only — host controls require this separate secret.
 */

const SESSION_PREFIX = 'roomforge:hostSecret:';
const LOCAL_PREFIX = 'roomforge:hostSecret:persistent:';
const META_PREFIX = 'roomforge:hostMeta:';

export type HostMeetingMeta = {
  roomId: string;
  title: string;
  passcode: string;
  meetingUrl: string;
  createdAt: string;
};

function sessionKey(roomId: string) {
  return `${SESSION_PREFIX}${roomId}`;
}

function localKey(roomId: string) {
  return `${LOCAL_PREFIX}${roomId}`;
}

function metaKey(roomId: string) {
  return `${META_PREFIX}${roomId}`;
}

export function saveHostSecret(
  roomId: string,
  hostSecret: string,
  options?: { rememberOnDevice?: boolean; meta?: Omit<HostMeetingMeta, 'roomId'> },
): void {
  try {
    sessionStorage.setItem(sessionKey(roomId), hostSecret);
    if (options?.rememberOnDevice) {
      localStorage.setItem(localKey(roomId), hostSecret);
    }
    if (options?.meta) {
      const payload: HostMeetingMeta = { roomId, ...options.meta };
      sessionStorage.setItem(metaKey(roomId), JSON.stringify(payload));
      if (options.rememberOnDevice) {
        localStorage.setItem(metaKey(roomId), JSON.stringify(payload));
      }
    }
  } catch {
    // Storage may be unavailable (private mode) — caller should warn the user
    // to copy the host secret manually.
  }
}

export function getHostSecret(roomId: string): string | null {
  try {
    return (
      sessionStorage.getItem(sessionKey(roomId)) ||
      localStorage.getItem(localKey(roomId)) ||
      null
    );
  } catch {
    return null;
  }
}

export function getHostMeetingMeta(roomId: string): HostMeetingMeta | null {
  try {
    const raw =
      sessionStorage.getItem(metaKey(roomId)) ||
      localStorage.getItem(metaKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as HostMeetingMeta;
  } catch {
    return null;
  }
}

export function clearHostSecret(roomId: string): void {
  try {
    sessionStorage.removeItem(sessionKey(roomId));
    sessionStorage.removeItem(metaKey(roomId));
    localStorage.removeItem(localKey(roomId));
    localStorage.removeItem(metaKey(roomId));
  } catch {
    // ignore
  }
}

export function hasHostSecret(roomId: string): boolean {
  return Boolean(getHostSecret(roomId));
}
