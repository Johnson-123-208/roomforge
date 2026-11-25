/** Host-only create access. Unlocked via URL password, kept for this browser tab. */

export const CREATE_ACCESS_PASSWORD = 'inform8_roomforge';
const STORAGE_KEY = 'roomforge:createAccess';

const QUERY_KEYS = ['password', 'access', 'key', 'host'] as const;

export function isValidCreatePassword(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return decodeURIComponent(value.trim()) === CREATE_ACCESS_PASSWORD;
  } catch {
    return value.trim() === CREATE_ACCESS_PASSWORD;
  }
}

export function hasCreateAccess(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function grantCreateAccess(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearCreateAccess(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Read create password from the current URL search params. */
export function readCreatePasswordFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (isValidCreatePassword(value)) return CREATE_ACCESS_PASSWORD;
  }
  return null;
}

/**
 * If the URL contains the create password, unlock create access for this tab
 * and return a cleaned search string (password removed).
 */
export function syncCreateAccessFromSearch(search: string): {
  unlocked: boolean;
  cleanedSearch: string;
} {
  const params = new URLSearchParams(search);
  let unlocked = hasCreateAccess();

  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (isValidCreatePassword(value)) {
      grantCreateAccess();
      unlocked = true;
      params.delete(key);
    }
  }

  const cleaned = params.toString();
  return {
    unlocked,
    cleanedSearch: cleaned ? `?${cleaned}` : '',
  };
}

export function getCreateAccessToken(): string | null {
  return hasCreateAccess() ? CREATE_ACCESS_PASSWORD : null;
}
