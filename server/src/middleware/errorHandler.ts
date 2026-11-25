import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isAppError } from '../utils/errors.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
    return;
  }

  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'CORS blocked', code: 'CORS' });
    return;
  }

  // body-parser JSON failures
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status?: number }).status === 400 &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }

  console.error('[api] unexpected error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
