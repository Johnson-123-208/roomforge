import type { JoinSession } from '../types/meeting';

const SESSION_KEY = 'roomforge:joinSession';
/** Keep refresh/reconnect sessions for up to the default token lifetime. */
const MAX_AGE_MS = 2.5 * 60 * 60 * 1000;

type StoredJoinSession = JoinSession & { savedAt?: number };

function readRaw(storage: Storage): StoredJoinSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredJoinSession;
  } catch {
    return null;
  }
}

function isFresh(session: StoredJoinSession): boolean {
  if (!session.savedAt) return true;
  return Date.now() - session.savedAt < MAX_AGE_MS;
}

export function saveJoinSession(session: JoinSession): void {
  const payload: StoredJoinSession = { ...session, savedAt: Date.now() };
  const raw = JSON.stringify(payload);
  try {
    sessionStorage.setItem(SESSION_KEY, raw);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(SESSION_KEY, raw);
  } catch {
    // ignore
  }
}

export function getJoinSession(roomId: string): JoinSession | null {
  const fromSession = readRaw(sessionStorage);
  const fromLocal = readRaw(localStorage);
  const session =
    (fromSession && fromSession.roomId === roomId && isFresh(fromSession)
      ? fromSession
      : null) ||
    (fromLocal && fromLocal.roomId === roomId && isFresh(fromLocal) ? fromLocal : null);

  if (!session) return null;

  // Rehydrate sessionStorage after a refresh path that only had localStorage.
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }

  const { savedAt: _savedAt, ...joinSession } = session;
  return joinSession;
}

export function clearJoinSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
