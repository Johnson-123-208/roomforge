const PRODUCTION_ORIGIN = 'https://roomforge.vercel.app';

/** Prefer current browser origin; never keep localhost when the page is on Vercel. */
export function publicMeetingUrl(roomId: string, serverUrl?: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : PRODUCTION_ORIGIN;

  const useOrigin =
    origin.includes('localhost') || origin.includes('127.0.0.1')
      ? origin
      : origin;

  // If server returned a localhost link but we're on a real host, rewrite.
  if (serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      const pageIsLocal =
        useOrigin.includes('localhost') || useOrigin.includes('127.0.0.1');
      const serverIsLocal =
        parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (serverIsLocal && !pageIsLocal) {
        return `${useOrigin}/meeting/${roomId}`;
      }
      if (!serverIsLocal) return serverUrl;
    } catch {
      // fall through
    }
  }

  return `${useOrigin}/meeting/${roomId}`;
}
