import express from 'express';
import morgan from 'morgan';
import meetingsRouter from './api/meetings.js';
import webhooksRouter from './api/webhooks.js';
import { applySecurityMiddleware, generalRateLimiter } from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getEnv, validateEnvSoft } from './config/env.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Webhooks need raw body — mount before JSON parser
  app.use('/api/webhooks', webhooksRouter);

  app.use(express.json({ limit: '100kb' }));
  applySecurityMiddleware(app);
  app.use(generalRateLimiter);

  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  }

  app.get('/api/health', (_req, res) => {
    const check = validateEnvSoft();
    if (!check.ok) {
      res.status(503).json({
        status: 'misconfigured',
        service: 'meetspace-api',
        errors: check.errors,
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      service: 'meetspace-api',
      livekit_url: check.env.LIVEKIT_URL,
      supabase_url: check.env.SUPABASE_URL,
      frontend_url: check.env.FRONTEND_URL,
    });
  });

  app.use('/api/meetings', meetingsRouter);

  app.use(errorHandler);
  return app;
}

function startServer(): void {
  if (process.env.VERCEL) return;

  const gate = globalThis as typeof globalThis & {
    __roomforgeApiStarted?: boolean;
  };
  if (gate.__roomforgeApiStarted) return;
  gate.__roomforgeApiStarted = true;

  const env = getEnv();
  const app = createApp();
  const server = app.listen(env.PORT, '127.0.0.1', () => {
    console.log(`RoomForge API listening on http://127.0.0.1:${env.PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${env.PORT} is already in use. Set PORT in .env to a free port.`,
      );
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });
}

startServer();

export default createApp;
