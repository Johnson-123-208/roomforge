const PRODUCTION_FRONTEND = 'https://roomforge.vercel.app';

function stripSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/**
 * Prefer the browser origin (from the create request), then env FRONTEND_URL.
 * Never return localhost invite links when running on Vercel/production.
 */
export function resolveFrontendBaseUrl(options?: {
  requestOrigin?: string | null;
  frontendOriginBody?: string | null;
  envFrontendUrl?: string;
}): string {
  const candidates = [
    options?.frontendOriginBody,
    options?.requestOrigin,
    options?.envFrontendUrl,
    PRODUCTION_FRONTEND,
  ]
    .filter((v): v is string => Boolean(v && String(v).trim()))
    .map((v) => stripSlash(String(v).trim()));

  const onVercelOrProd =
    Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

  for (const candidate of candidates) {
    try {
      // Validate URL
      // eslint-disable-next-line no-new
      new URL(candidate);
    } catch {
      continue;
    }
    if (onVercelOrProd && isLocalHost(candidate)) continue;
    return candidate;
  }

  return PRODUCTION_FRONTEND;
}
