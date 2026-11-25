# RoomForge — Vercel + Render env checklist

## Architecture

- **Vercel:** Vite frontend only (`dist`). Set `VITE_*` build-time vars.
- **Render:** Express API (`npx tsx server/src/index.ts`). Holds all secrets. Native `argon2` works here.

Do **not** put `LIVEKIT_API_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_*` var.

## Vercel (frontend) project env

| Key | Example | Notes |
|---|---|---|
| `VITE_BACKEND_URL` | `https://roomforge-api.onrender.com` | No trailing slash |
| `VITE_LIVEKIT_URL` | `wss://….livekit.cloud` | Public LiveKit URL |

Build: `npm run build` · Output: `dist` · Framework: Vite

After first deploy, note the Vercel URL (e.g. `https://roomforge.vercel.app`) and put it in Render `FRONTEND_URL` / `ALLOWED_ORIGINS`.

## Render (API) service env

| Key | Required | Notes |
|---|---|---|
| `LIVEKIT_URL` | yes | Same as `VITE_LIVEKIT_URL` |
| `LIVEKIT_API_KEY` | yes | LiveKit Cloud |
| `LIVEKIT_API_SECRET` | yes | LiveKit Cloud |
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role only |
| `FRONTEND_URL` | yes | Exact Vercel origin |
| `BACKEND_URL` | yes | This Render service URL |
| `ALLOWED_ORIGINS` | recommended | Same as `FRONTEND_URL` |
| `CREATE_ACCESS_PASSWORD` | yes | Unlock create UI via `?password=` |
| `HOST_TOKEN_SECRET` | optional | ≥32 chars; else derived from LiveKit secret |
| `NODE_ENV` | yes | `production` |
| `PORT` | auto | Render sets this; blueprint uses `10000` |

Health: `GET https://<render-host>/api/health`

Create unlock: `https://<vercel-host>/?password=<CREATE_ACCESS_PASSWORD>`

## What I need from you to deploy

I cannot push to your Vercel/Render accounts without auth. Provide any of:

1. **Vercel:** logged-in `vercel` CLI on this machine, or a `VERCEL_TOKEN` + team/project scope  
2. **Render:** logged-in `render` CLI / API key, or you paste the Blueprint (`render.yaml`) in the Render dashboard  
3. Confirm LiveKit + Supabase projects stay as copied into local `.env` (already wired for RoomForge)

Then I can set env vars and trigger deploys; until then, configs in-repo are ready for one-click connect.
