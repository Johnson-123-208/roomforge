/**
 * Vercel serverless entry — wraps the Express app.
 * Prefer a long-running Node host for argon2 + LiveKit admin APIs if
 * serverless cold starts or native modules become an issue.
 */
import { createApp } from '../server/src/index.js';

const app = createApp();

export default app;
