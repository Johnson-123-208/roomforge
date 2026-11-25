# RoomForge Deployment

## Recommended architecture

| Layer | Platform |
|---|---|
| Frontend | Vercel (static Vite build) |
| Backend API | Render (Node — `render.yaml`) |
| Database | Supabase PostgreSQL |
| Media | LiveKit Cloud |

Native `argon2` is unreliable on Vercel serverless. Keep the API on Render (or Railway/Fly).

## 1. Supabase

1. Use the existing project credentials (copied into local `.env`) **or** create a new project.
2. Run `database/supabase_schema.sql` in the SQL editor if tables are missing.
3. Server uses the **service role** key only.

## 2. LiveKit Cloud

1. Project URL, API key, API secret in Render env.
2. Optional webhook → `https://<api-host>/api/webhooks/livekit`.

## 3. Backend (Render)

Import `render.yaml` or create a Node web service:

- **Build:** `npm install`
- **Start:** `npx tsx server/src/index.ts`
- **Health:** `/api/health`

Set env vars from [VERCEL_ENV.md](./VERCEL_ENV.md).

## 4. Frontend (Vercel)

1. Import the GitHub repo `roomforge`.
2. Framework preset: Vite · output `dist`.
3. Set `VITE_BACKEND_URL` and `VITE_LIVEKIT_URL`.
4. Deploy. Update Render `FRONTEND_URL` / CORS to the Vercel domain.

## 5. Post-deploy checks

- [ ] Create meeting → URL, passcode, host secret
- [ ] Refresh create page → host secret recoverable
- [ ] Guest join with passcode
- [ ] Wrong passcode rejected
- [ ] 9th participant rejected
- [ ] Host can end meeting
- [ ] Guest cannot call `/end` without host secret
- [ ] No secrets in browser network responses except create-once
- [ ] No recording UI
