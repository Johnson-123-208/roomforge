import type { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getEnv } from '../config/env.js';

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      (url.protocol === 'http:' || url.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

function isRoomForgeVercelOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host === 'roomforge.vercel.app' ||
      host.endsWith('-roomforge.vercel.app') ||
      host.endsWith('.roomforge.vercel.app')
    );
  } catch {
    return false;
  }
}

function collectAllowedOrigins(
  env: ReturnType<typeof getEnv> | null,
): Set<string> {
  const origins = new Set<string>([
    'http://localhost:5177',
    'http://127.0.0.1:5177',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://roomforge.vercel.app',
  ]);

  if (env?.FRONTEND_URL) origins.add(env.FRONTEND_URL.replace(/\/$/, ''));

  const extra = process.env.ALLOWED_ORIGINS || '';
  for (const part of extra.split(',')) {
    const trimmed = part.trim().replace(/\/$/, '');
    if (trimmed) origins.add(trimmed);
  }

  return origins;
}

export function applySecurityMiddleware(app: Express): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const env = (() => {
    try {
      return getEnv();
    } catch {
      return null;
    }
  })();

  const allowedOrigins = collectAllowedOrigins(env);

  app.use(
    cors({
      origin(origin, callback) {
        if (
          !origin ||
          allowedOrigins.has(origin) ||
          isRoomForgeVercelOrigin(origin) ||
          (env?.NODE_ENV !== 'production' && isLocalDevOrigin(origin))
        ) {
          callback(null, true);
          return;
        }
        // Deny without throwing — avoids turning CORS into a 500 JSON body
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Host-Token',
        'X-Create-Access',
      ],
    }),
  );

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
}

function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
}

export const verifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many passcode attempts. Please try again later.',
    code: 'RATE_LIMITED',
  },
  keyGenerator: (req) => {
    const roomId = (req.params.roomId as string) || 'unknown';
    return `${clientIp(req)}:${roomId}`;
  },
});

export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

export const hostActionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many host actions', code: 'RATE_LIMITED' },
});
