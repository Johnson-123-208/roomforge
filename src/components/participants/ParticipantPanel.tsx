import { useParticipants } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, UserMinus, X } from 'lucide-react';
import { Button } from '../common/Button';
import { getInitials } from '../../utils/initials';
import { isHostParticipant } from '../../utils/participantRole';
import { cn } from '../../utils/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  isHost: boolean;
  localIdentity: string;
  onRemove: (identity: string) => void;
  onMuteMic: (identity: string, name: string) => void;
};

export function ParticipantPanel({
  open,
  onClose,
  isHost,
  localIdentity,
  onRemove,
  onMuteMic,
}: Props) {
  const participants = useParticipants();

  if (!open) return null;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-xs flex-col border-l border-white/10 bg-[var(--secondary-bg)] shadow-2xl md:w-80">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          Participants ({participants.length})
        </h2>
        <button
          type="button"
          aria-label="Close participants"
          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {participants.map((p) => {
          const name = p.name || p.identity;
          const micPub = p.getTrackPublication(Track.Source.Microphone);
          const isMicMuted = !micPub || micPub.isMuted;
          const canModerate = isHost && p.identity !== localIdentity;
          const roleHost = isHostParticipant(p);

          return (
            <li
              key={p.identity}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-white/5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xs font-semibold text-[var(--accent)]">
                {getInitials(name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {name}
                  {p.isLocal ? ' (You)' : ''}
                  {roleHost ? ' · Host' : ''}
                </p>
                <span
                  className={cn(
                    'mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--text-muted)]',
                    isMicMuted && 'text-[var(--danger)]',
                  )}
                >
                  {isMicMuted ? <MicOff size={12} /> : <Mic size={12} />}
                  {isMicMuted ? 'Muted' : 'Mic on'}
                </span>
              </div>
              {canModerate ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!px-2"
                    aria-label={`Mute ${name}`}
                    title="Mute microphone"
                    disabled={isMicMuted}
                    icon={<MicOff size={14} />}
                    onClick={() => onMuteMic(p.identity, name)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!px-2"
                    aria-label={`Remove ${name}`}
                    title="Remove"
                    icon={<UserMinus size={14} />}
                    onClick={() => onRemove(p.identity)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
