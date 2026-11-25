import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { customAlphabet } from 'nanoid';

const scryptAsync = promisify(scrypt);

const roomIdAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);
const passcodeAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

export function generateRoomId(): string {
  return roomIdAlphabet();
}

export function generatePasscode(): string {
  return passcodeAlphabet();
}

export function generateHostSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Meeting passcodes: trim spaces and normalize case for reliable matching. */
export function normalizePasscode(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export function generateParticipantIdentity(displayName: string): string {
  const slug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'guest';
  return `${slug}-${randomBytes(4).toString('hex')}`;
}

function scryptParams() {
  return { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P } as const;
}

/** Portable password hash (works on Vercel serverless — no native argon2 binary). */
export async function hashSecret(value: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(
    value,
    salt,
    KEYLEN,
    scryptParams(),
  )) as Buffer;
  return [
    'scrypt',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

async function verifyScrypt(hash: string, value: string): Promise<boolean> {
  const parts = hash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  const derived = (await scryptAsync(value, salt, expected.length, {
    N: n,
    r,
    p,
  })) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

async function verifyArgon2Legacy(hash: string, value: string): Promise<boolean> {
  try {
    const argon2 = await import('argon2');
    return await argon2.default.verify(hash, value);
  } catch (err) {
    console.error('[crypto] argon2 verify unavailable:', err);
    return false;
  }
}

export async function verifySecret(hash: string, value: string): Promise<boolean> {
  if (!hash || !value) return false;
  try {
    if (hash.startsWith('scrypt$')) {
      return await verifyScrypt(hash, value);
    }
    // Older meetings hashed with argon2
    if (hash.startsWith('$argon2')) {
      return await verifyArgon2Legacy(hash, value);
    }
    console.error('[crypto] unknown hash format');
    return false;
  } catch (err) {
    console.error('[crypto] verifySecret failed:', err);
    return false;
  }
}

/**
 * Verify a meeting passcode against a stored hash.
 * Tries normalized (trimmed/uppercased) form first, then raw trimmed.
 */
export async function verifyPasscode(
  hash: string,
  passcode: string,
): Promise<boolean> {
  const trimmed = passcode.trim();
  const normalized = normalizePasscode(passcode);
  if (await verifySecret(hash, normalized)) return true;
  if (normalized !== trimmed && (await verifySecret(hash, trimmed))) return true;
  // Last resort: original value as typed
  if (passcode !== trimmed && (await verifySecret(hash, passcode))) return true;
  return false;
}

export type HostTokenPayload = {
  roomId: string;
  meetingId: string;
  exp: number;
  iat: number;
};

function b64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64url');
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function signHostToken(
  payload: Omit<HostTokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 3600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: HostTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const body = b64url(JSON.stringify(full));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyHostToken(
  token: string,
  secret: string,
): HostTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as HostTokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.roomId || !payload.meetingId) return null;
    return payload;
  } catch {
    return null;
  }
}
