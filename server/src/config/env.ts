import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

function loadEnvFiles(): void {
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
}

loadEnvFiles();

const httpOrWsUrl = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const u = new URL(value);
        return ['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid http(s) or ws(s) URL' },
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3005),

  LIVEKIT_API_KEY: z.string().min(1, 'LIVEKIT_API_KEY is required'),
  LIVEKIT_API_SECRET: z.string().min(1, 'LIVEKIT_API_SECRET is required'),
  LIVEKIT_URL: httpOrWsUrl,

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  FRONTEND_URL: z
    .string()
    .url()
    .default('https://roomforge.vercel.app'),
  BACKEND_URL: z
    .string()
    .url()
    .default('https://roomforge.vercel.app'),
  ALLOWED_ORIGINS: z.string().optional(),

  HOST_TOKEN_SECRET: z.string().min(32).optional(),
  TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(7200),
  MEETING_TTL_HOURS: z.coerce.number().int().positive().default(24),
  LIVEKIT_WEBHOOK_API_KEY: z.string().optional(),
  /** Required to create rooms. Must match the URL unlock password. */
  CREATE_ACCESS_PASSWORD: z.string().min(1).default('inform8_roomforge'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cached = {
    ...parsed.data,
    HOST_TOKEN_SECRET:
      parsed.data.HOST_TOKEN_SECRET ??
      parsed.data.LIVEKIT_API_SECRET.padEnd(32, '0').slice(0, 64),
  };
  return cached;
}

/** Soft validation for serverless cold starts — returns errors instead of throwing. */
export function validateEnvSoft(): { ok: true; env: Env } | { ok: false; errors: string[] } {
  try {
    return { ok: true, env: getEnv() };
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : 'Unknown env error'],
    };
  }
}

/** Reset cache (tests / hot reload). */
export function resetEnvCache(): void {
  cached = null;
}
