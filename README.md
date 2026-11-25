# RoomForge

Private, lightweight video meetings for small teams (6–8 people).

Open a link → enter passcode → join live audio/video with optional screen share and host controls. No accounts, no chat, **no recording**.

Built by **Inform8**.

## Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, Lucide
- **Realtime:** LiveKit (WebRTC) + LiveKit React components
- **Backend:** Node.js, Express, TypeScript
- **Database:** Supabase PostgreSQL (hashes only; RLS deny-all for clients)

## Quick start

```bash
cp .env.example .env
# fill LiveKit + Supabase values
npm install
# run database/supabase_schema.sql in Supabase SQL editor
npm run dev
```

- App: http://localhost:5177  
- API: http://localhost:3005  

Unlock create UI: `http://localhost:5177/?password=inform8_roomforge`

Full setup: [docs/SETUP.md](docs/SETUP.md)

## Deploy

| Layer | Platform |
|---|---|
| Frontend | **Vercel** (`vercel.json`) |
| API | **Render** (`render.yaml`) — preferred for native `argon2` |
| DB | Supabase |
| Media | LiveKit Cloud |

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/VERCEL_ENV.md](docs/VERCEL_ENV.md).

## How access works

1. **Owner** creates a meeting → receives meeting URL, **passcode** (guest access), and **host secret** (owner controls).
2. Passcode and host secret are stored **only as Argon2id hashes**.
3. Host secret is saved in the owner’s browser so refresh keeps end-meeting / remove-participant capability.
4. Guests join with link + passcode. Host actions require the host secret.
5. Participant limit (default **8**) is enforced on the server.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Frontend + API together |
| `npm run build` | Production frontend build |
| `npm run start:api` | Production API |
| `npm run lint` | Oxlint |
