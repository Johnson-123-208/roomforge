import { Router, raw } from 'express';
import { getWebhookReceiver } from '../services/livekit.js';
import { handleParticipantWebhook } from '../services/meetings.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * LiveKit webhook endpoint.
 * Auth: LiveKit Authorization header signature verified by WebhookReceiver.
 * Idempotent via webhook_events.event_id unique constraint.
 */
router.post(
  '/livekit',
  // Capture raw body for signature verification when available
  raw({ type: '*/*' }),
  asyncHandler(async (req, res) => {
    const receiver = getWebhookReceiver();
    const authHeader = req.get('Authorization') || req.get('authorization') || '';

    let body: string;
    if (Buffer.isBuffer(req.body)) {
      body = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else {
      body = JSON.stringify(req.body ?? {});
    }

    const event = await receiver.receive(body, authHeader);

    const eventId =
      (event as { id?: string }).id ||
      `${event.event}-${event.room?.name}-${event.participant?.identity}-${event.createdAt}`;

    await handleParticipantWebhook({
      eventId,
      eventType: event.event,
      roomName: event.room?.name || '',
      identity: event.participant?.identity,
      displayName: event.participant?.name,
      payload: event,
    });

    res.status(200).json({ received: true });
  }),
);

export default router;
