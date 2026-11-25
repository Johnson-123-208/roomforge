# RoomForge Testing Checklist

Credentials required for live A/V: LiveKit + Supabase configured in `.env`.

## Scenario 1 — Create and join as owner

1. Open `/` → Create Meeting.
2. Set title, generate passcode, create.
3. Confirm meeting URL, passcode, and host secret are shown.
4. Confirm host secret is saved (refresh create page / open join — “I'm the meeting owner” pre-fills).
5. Join meeting → live room connects with camera/mic.

## Scenario 2 — Multiple participants

1. Open the meeting link in 6 browsers/profiles.
2. Each enters a unique display name + passcode.
3. Confirm all video tiles appear and mute/unmute works.

## Scenario 3 — Capacity (8 max)

1. Fill the room to `max_participants` (default 8).
2. Attempt a 9th join.
3. Expect `403` / “meeting is full” — enforced by the **server**, not only UI.

## Scenario 4 — Access rejection

1. Wrong passcode → rejected.
2. Invalid room ID → not found.
3. After host ends meeting → join rejected.

## Scenario 5 — Host ends meeting

1. Host clicks End → confirms.
2. All participants disconnect.
3. Room status is `ended`.

## Scenario 6 — Reconnect

1. Throttle / briefly disconnect network during a call.
2. Confirm LiveKit reconnects or user can re-join with passcode.

## Scenario 7 — Unauthorized host actions

1. As a guest, call `POST /api/meetings/:roomId/end` without host secret/token.
2. Expect `403`.
3. Same for remove-participant.

## Scenario 8 — Media permissions denied

1. Block camera/mic in the browser.
2. Confirm clear error on join preview.
3. Confirm user can still join with camera/mic disabled.

## Security spot checks

- [ ] DB rows contain hashes only (`passcode_hash`, `host_secret_hash`)
- [ ] `GET /api/meetings/:roomId` returns no hashes/secrets
- [ ] Frontend bundle has no `SERVICE_ROLE` / `API_SECRET` strings
- [ ] No recording controls or storage paths exist in the app
