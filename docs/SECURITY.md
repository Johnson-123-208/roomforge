# RoomForge Security

## Threat model (no user accounts)

Anyone with a valid **meeting link + passcode** can join as a guest. That is intentional.

Owner/admin actions require a separate **host secret**, verified server-side. Possession of the link alone is never treated as host identity.

## Passcodes

- Passcodes are hashed with **Argon2id** before storage (`passcode_hash`).
- Plaintext passcodes are returned **only** in the create-meeting response.
- Verification happens exclusively in the backend (`POST /api/meetings/:roomId/verify`).
- Rate limiting (per IP + room) reduces brute-force risk.
- Frontend clients never query Supabase for hashes (RLS deny-all + no anon key usage).

## Host secrets

- Generated with `crypto.randomBytes` (256-bit, base64url).
- Stored only as Argon2id (`host_secret_hash`).
- Shown once at creation; also persisted in the creator’s browser for **host recovery** after refresh:
  - `sessionStorage` (default)
  - optional `localStorage` (“Remember on this device”)
- Host API routes accept either:
  - `host_secret`, or
  - a short-lived HMAC **host token** issued by `POST /api/meetings/:roomId/host-token`
- UI `isHost` is display-only. End/remove always re-validate on the server.

## LiveKit tokens

- Issued only by the backend.
- Scoped to a single `room`.
- Guests: publish/subscribe A/V only.
- Hosts: additional `roomAdmin` grant after secret verification.
- Short TTL (`TOKEN_TTL_SECONDS`, default 2 hours).

## Capacity

- `max_participants` constrained to 1–8 in DB and API validation.
- Join path checks LiveKit live participant count **and** active DB presence rows.
- Ninth joiner receives `403 MEETING_FULL`.

## Database

- Service role key used only on the server.
- RLS enabled with deny-all for `anon` / `authenticated`.
- No `VITE_SUPABASE_*` or service-role keys in the frontend bundle.

## Webhooks

- LiveKit webhook signatures verified via `WebhookReceiver`.
- Events logged in `webhook_events` with unique `event_id` for idempotency.
- Webhooks are the authoritative source for connect/disconnect when configured.

## Other controls

- Zod request validation
- Helmet + CORS allowlist (`FRONTEND_URL`)
- Safe error messages (no hash leakage)
- Meeting status / expiry checks before join
- Ended rooms cannot be rejoined; LiveKit room deleted on end

## Explicitly out of scope

- User signup / login / SSO
- Meeting recording / egress / cloud storage of media
- Chat, screen share (initial version)
