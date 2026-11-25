import type { Request } from 'express';
import { AppError } from './errors.js';

export function paramString(req: Request, name: string): string {
  const value = req.params[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== 'string') {
    throw new AppError(400, `Missing path parameter: ${name}`);
  }
  return raw;
}
