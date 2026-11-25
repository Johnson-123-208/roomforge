# RoomForge Setup

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [LiveKit Cloud](https://cloud.livekit.io) project (or self-hosted LiveKit)

## 1. Clone and install

```bash
npm install
```

If `argon2` install scripts are blocked by your npm policy:

```bash
npm approve-scripts argon2
npm rebuild argon2
```

## 2. Configure environment

```bash
cp .env.example .env
```

Fill in:

| Variable | Where it lives | Notes |
|---|---|---|
| `VITE_LIVEKIT_URL` | Frontend (public) | `wss://…` from LiveKit |
| `VITE_BACKEND_URL` | Frontend (optional) | Leave empty locally (Vite proxies `/api`) |
| `LIVEKIT_URL` | Server | Same WebSocket URL |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Server only | Never expose to Vite |
| `SUPABASE_URL` | Server only | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role — **not** the anon key |
| `FRONTEND_URL` / `BACKEND_URL` | Server | Used for CORS and meeting links |

## 3. Initialize Supabase

1. Open Supabase → SQL Editor.
2. Paste and run [`database/supabase_schema.sql`](../database/supabase_schema.sql).
3. Confirm tables `meetings`, `meeting_participants`, and `webhook_events` exist.
4. Confirm RLS is enabled and deny-all policies are present.

The schema stores **only Argon2id hashes** for passcodes and host secrets. Plaintext secrets are never persisted in Postgres.

## 4. Configure LiveKit

1. Create a project in LiveKit Cloud.
2. Copy the WebSocket URL, API key, and API secret into `.env`.
3. (Recommended) Add a webhook pointing to `https://<your-api>/api/webhooks/livekit` for participant join/leave events.

## 5. Run locally

```bash
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3002  

## Access model (important)

| Role | What they need | What they can do |
|---|---|---|
| Guest | Meeting link + passcode | Join A/V, mute/camera self, leave |
| Host | Meeting link + passcode **and** host secret | Everything guests can, plus end meeting / remove participants |

- Creating a meeting returns `passcode` and `host_secret` **once**.
- The browser saves the host secret (sessionStorage + optional localStorage) so a refresh does not lock the owner out.
- Host actions are always verified on the server — never trust a frontend `isHost` flag alone.
- Max participants (default 8) is enforced on the server against LiveKit + DB counts.

## No recording

This product intentionally has **no recording** infrastructure, storage buckets, or LiveKit egress configuration.
