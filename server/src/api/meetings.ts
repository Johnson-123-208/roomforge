import { Router } from 'express';
import {
  admitParticipantSchema,
  claimAdmissionSchema,
  createMeetingSchema,
  denyParticipantSchema,
  endMeetingSchema,
  hostAuthSchema,
  hostTokenSchema,
  muteParticipantSchema,
  participantJoinSchema,
  participantLeaveSchema,
  removeParticipantSchema,
  verifyMeetingSchema,
} from '../types/api.js';
import {
  admitParticipant,
  claimAdmission,
  createMeeting,
  denyParticipant,
  endMeeting,
  getSafeMeeting,
  getWaitingStatus,
  issueHostToken,
  listWaitingParticipants,
  muteParticipant,
  recordParticipantJoin,
  recordParticipantLeave,
  removeParticipant,
  verifyAndJoin,
  generatePasscode,
} from '../services/meetings.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  hostActionRateLimiter,
  verifyRateLimiter,
} from '../middleware/security.js';
import { paramString } from '../utils/params.js';
import { getEnv } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const router = Router();

/** POST /api/meetings — create a meeting. Returns plaintext passcode + host_secret ONCE. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = {
      ...req.body,
      passcode:
        typeof req.body?.passcode === 'string' && req.body.passcode.length > 0
          ? req.body.passcode
          : generatePasscode(),
      create_access:
        typeof req.body?.create_access === 'string' && req.body.create_access.length > 0
          ? req.body.create_access
          : req.get('x-create-access') || '',
    };
    const input = createMeetingSchema.parse(body);

    const expectedCreate = getEnv().CREATE_ACCESS_PASSWORD.trim();
    let providedCreate = String(input.create_access || '').trim();
    try {
      providedCreate = decodeURIComponent(providedCreate);
    } catch {
      // keep trimmed value
    }
    if (providedCreate !== expectedCreate) {
      throw new AppError(403, 'Create access denied', 'CREATE_ACCESS_DENIED');
    }

    const origin = req.get('origin') || req.get('referer') || null;
    const meeting = await createMeeting(input, { origin });
    res.status(201).json(meeting);
  }),
);

/** GET /api/meetings/:roomId — safe public meeting details (no hashes). */
router.get(
  '/:roomId',
  asyncHandler(async (req, res) => {
    const meeting = await getSafeMeeting(paramString(req, 'roomId'));
    res.json(meeting);
  }),
);

/**
 * POST /api/meetings/:roomId/verify
 * Host (with host_secret) joins immediately.
 * Guests enter the waiting room until the host admits them.
 */
router.post(
  '/:roomId/verify',
  verifyRateLimiter,
  asyncHandler(async (req, res) => {
    const input = verifyMeetingSchema.parse(req.body);
    const result = await verifyAndJoin(paramString(req, 'roomId'), input);
    res.json(result);
  }),
);

/** Guest polls until admitted/denied. */
router.get(
  '/:roomId/waiting-status/:identity',
  asyncHandler(async (req, res) => {
    const result = await getWaitingStatus(
      paramString(req, 'roomId'),
      paramString(req, 'identity'),
    );
    res.json(result);
  }),
);

/** After host admits, guest claims LiveKit token. */
router.post(
  '/:roomId/claim-admission',
  verifyRateLimiter,
  asyncHandler(async (req, res) => {
    const body = claimAdmissionSchema.parse(req.body);
    const result = await claimAdmission(paramString(req, 'roomId'), body);
    res.json(result);
  }),
);

/** Host: list people waiting to be admitted. */
router.post(
  '/:roomId/waiting',
  hostActionRateLimiter,
  asyncHandler(async (req, res) => {
    const auth = hostAuthSchema.parse(req.body);
    const result = await listWaitingParticipants(paramString(req, 'roomId'), auth);
    res.json(result);
  }),
);

router.post(
  '/:roomId/admit',
  hostActionRateLimiter,
  asyncHandler(async (req, res) => {
    const body = admitParticipantSchema.parse(req.body);
    const result = await admitParticipant(
      paramString(req, 'roomId'),
      body.participant_identity,
      { host_token: body.host_token, host_secret: body.host_secret },
    );
    res.json(result);
  }),
);

router.post(
  '/:roomId/deny',
  hostActionRateLimiter,
  asyncHandler(async (req, res) => {
    const body = denyParticipantSchema.parse(req.body);
    const result = await denyParticipant(
      paramString(req, 'roomId'),
      body.participant_identity,
      { host_token: body.host_token, host_secret: body.host_secret },
    );
    res.json(result);
  }),
);

router.post(
  '/:roomId/host-token',
  hostActionRateLimiter,
  asyncHandler(async (req, res) => {
    const { host_secret } = hostTokenSchema.parse(req.body);
    const result = await issueHostToken(paramString(req, 'roomId'), host_secret);
    res.json(result);
  }),
);

router.post(
  '/:roomId/end',
  hostActionRateLimiter,
  asyncHandler(async (req, res) => {
    const auth = endMeetingSchema.parse(req.body);
    const result = await endMeeting(paramString(req, 'roomId'), auth);
    res.json(result);
  }),
);

router.post(
  '/:roomId/remove-participant',
  hostActionRateLimiter,
  asyncHandler(async (req, res) => {
    const body = removeParticipantSchema.parse(req.body);
    const result = await removeParticipant(
      paramString(req, 'roomId'),
      body.participant_identity,
      { host_token: body.host_token, host_secret: body.host_secret },
    );
    res.json(result);
  }),
);

router.post(
  '/:roomId/mute-participant',
  hostActionRateLimiter,
  asyncHandler(async (req, res) => {
    const body = muteParticipantSchema.parse(req.body);
    const result = await muteParticipant(
      paramString(req, 'roomId'),
      body.participant_identity,
      body.track,
      { host_token: body.host_token, host_secret: body.host_secret },
      body.muted,
    );
    res.json(result);
  }),
);

router.post(
  '/:roomId/participants/join',
  asyncHandler(async (req, res) => {
    const body = participantJoinSchema.parse(req.body);
    const result = await recordParticipantJoin(
      paramString(req, 'roomId'),
      body.participant_identity,
      body.display_name,
      body.is_host,
    );
    res.json(result);
  }),
);

router.post(
  '/:roomId/participants/leave',
  asyncHandler(async (req, res) => {
    const body = participantLeaveSchema.parse(req.body);
    const result = await recordParticipantLeave(
      paramString(req, 'roomId'),
      body.participant_identity,
    );
    res.json(result);
  }),
);

export default router;
