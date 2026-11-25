import type { Participant } from 'livekit-client';

export function isHostParticipant(participant: Participant): boolean {
  try {
    const raw = participant.metadata;
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { role?: string };
    return parsed.role === 'host';
  } catch {
    return false;
  }
}
