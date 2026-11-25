import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(100, 'Title must be 100 characters or fewer'),
  passcode: z
    .string()
    .min(4, 'Passcode must be at least 4 characters')
    .max(64, 'Passcode must be 64 characters or fewer')
    .transform((v) => v.trim().replace(/\s+/g, '').toUpperCase()),
  max_participants: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .default(8),
  create_access: z.string().min(1, 'Create access password is required'),
  frontend_origin: z.string().url().optional(),
});

export const verifyMeetingSchema = z.object({
  passcode: z
    .string()
    .min(1, 'Passcode is required')
    .max(64)
    .transform((v) => v.trim()),
  display_name: z
    .string()
    .trim()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be 50 characters or fewer'),
  host_secret: z.string().min(1).max(128).optional(),
  enable_camera: z.boolean().optional().default(true),
  enable_microphone: z.boolean().optional().default(true),
});

export const hostTokenSchema = z.object({
  host_secret: z.string().min(1, 'Host secret is required').max(128),
});

export const hostAuthSchema = z.object({
  host_token: z.string().min(1).optional(),
  host_secret: z.string().min(1).max(128).optional(),
}).refine((d) => d.host_token || d.host_secret, {
  message: 'host_token or host_secret is required',
});

export const removeParticipantSchema = hostAuthSchema.extend({
  participant_identity: z.string().min(1).max(128),
});

export const muteParticipantSchema = hostAuthSchema.extend({
  participant_identity: z.string().min(1).max(128),
  track: z.enum(['microphone', 'camera', 'both']),
  muted: z.boolean().optional().default(true),
});

export const admitParticipantSchema = hostAuthSchema.extend({
  participant_identity: z.string().min(1).max(128),
});

export const denyParticipantSchema = hostAuthSchema.extend({
  participant_identity: z.string().min(1).max(128),
});

export const claimAdmissionSchema = z.object({
  participant_identity: z.string().min(1).max(128),
  display_name: z.string().trim().min(1).max(50),
  passcode: z
    .string()
    .min(1)
    .max(64)
    .transform((v) => v.trim()),
});

export const endMeetingSchema = hostAuthSchema;

export const participantJoinSchema = z.object({
  participant_identity: z.string().min(1).max(128),
  display_name: z.string().trim().min(1).max(50),
  is_host: z.boolean().optional().default(false),
});

export const participantLeaveSchema = z.object({
  participant_identity: z.string().min(1).max(128),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type VerifyMeetingInput = z.infer<typeof verifyMeetingSchema>;
