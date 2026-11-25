import { useEffect, useRef, useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { admitParticipant, denyParticipant, listWaiting, ApiError } from '../../services/api';
import type { WaitingPerson } from '../../types/meeting';
import { Button } from '../common/Button';
import { playHostWaitingAlert } from '../../utils/meetingSounds';

type Props = {
  roomId: string;
  hostAuth: { host_token?: string; host_secret?: string };
  onToast: (msg: string, tone?: 'info' | 'success' | 'error') => void;
};

export function WaitingAdmitPanel({ roomId, hostAuth, onToast }: Props) {
  const [waiting, setWaiting] = useState<WaitingPerson[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const result = await listWaiting(roomId, hostAuth);
        if (cancelled) return;

        const next = result.waiting;
        const nextIds = new Set(next.map((p) => p.participant_identity));

        if (primedRef.current) {
          const newcomers = next.filter(
            (p) => !knownIdsRef.current.has(p.participant_identity),
          );
          if (newcomers.length > 0) {
            void playHostWaitingAlert();
            onToast(
              newcomers.length === 1
                ? `${newcomers[0].display_name} is waiting to join`
                : `${newcomers.length} people are waiting to join`,
              'info',
            );
          }
        } else {
          primedRef.current = true;
        }

        knownIdsRef.current = nextIds;
        setWaiting(next);
      } catch {
        // ignore transient poll errors
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [roomId, hostAuth, onToast]);

  const onAdmit = async (identity: string, name: string) => {
    setBusyId(identity);
    try {
      await admitParticipant(roomId, identity, hostAuth);
      setWaiting((prev) => prev.filter((p) => p.participant_identity !== identity));
      onToast(`${name} admitted`, 'success');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not admit guest.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const onDeny = async (identity: string, name: string) => {
    setBusyId(identity);
    try {
      await denyParticipant(roomId, identity, hostAuth);
      setWaiting((prev) => prev.filter((p) => p.participant_identity !== identity));
      onToast(`${name} denied`, 'info');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not deny guest.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (waiting.length === 0) return null;

  return (
    <div className="absolute left-3 top-3 z-20 w-[min(100%-1.5rem,20rem)] rounded-2xl border border-[var(--border-dark)] bg-[var(--secondary-bg)]/95 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <UserPlus size={16} className="text-[var(--gold)]" />
        Waiting to join ({waiting.length})
      </div>
      <ul className="space-y-2">
        {waiting.map((person) => (
          <li
            key={person.participant_identity}
            className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{person.display_name}</p>
              <p className="text-[11px] text-[var(--text-muted)]">Asked to join</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="success"
                disabled={busyId === person.participant_identity}
                aria-label={`Admit ${person.display_name}`}
                icon={<Check size={14} />}
                onClick={() =>
                  void onAdmit(person.participant_identity, person.display_name)
                }
              />
              <Button
                size="sm"
                variant="danger"
                disabled={busyId === person.participant_identity}
                aria-label={`Deny ${person.display_name}`}
                icon={<X size={14} />}
                onClick={() =>
                  void onDeny(person.participant_identity, person.display_name)
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
