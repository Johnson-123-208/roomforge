import { useEffect } from 'react';
import { Track, RemoteTrackPublication, VideoQuality } from 'livekit-client';
import { useParticipants, useRoomContext } from '@livekit/components-react';
import { ParticipantTile } from './ParticipantTile';
import { FocusStage, useLiveScreenShares } from './FocusStage';
import { isHostParticipant } from '../../utils/participantRole';
import { cn } from '../../utils/cn';

type Props = {
  pinnedIdentity: string | null;
  onTogglePin: (identity: string) => void;
  onClearPin: () => void;
};

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-3xl mx-auto';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-5xl mx-auto';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-5xl mx-auto';
  if (count <= 6) return 'grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto';
  return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 max-w-7xl mx-auto';
}

export function ParticipantGrid({
  pinnedIdentity,
  onTogglePin,
  onClearPin,
}: Props) {
  const room = useRoomContext();
  const participants = useParticipants();
  const screenTracks = useLiveScreenShares();
  const screenTrack = screenTracks[0];
  const screenSharerId = screenTrack?.participant.identity ?? null;

  // Ensure every remote screen share is subscribed at high quality.
  useEffect(() => {
    for (const participant of room.remoteParticipants.values()) {
      const pub = participant.getTrackPublication(Track.Source.ScreenShare);
      if (pub instanceof RemoteTrackPublication) {
        if (!pub.isSubscribed) pub.setSubscribed(true);
        try {
          pub.setVideoQuality(VideoQuality.HIGH);
        } catch {
          // ignore
        }
      }
    }
  }, [room, screenSharerId, participants.length]);

  // Escape exits pin fullscreen
  useEffect(() => {
    if (!pinnedIdentity && !screenSharerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClearPin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinnedIdentity, screenSharerId, onClearPin]);

  const stageIdentity = screenSharerId || pinnedIdentity;
  const stageParticipant = stageIdentity
    ? participants.find((p) => p.identity === stageIdentity)
    : undefined;

  if (stageParticipant) {
    const others = participants.filter((p) => p.identity !== stageParticipant.identity);
    const mode = screenSharerId === stageParticipant.identity ? 'screen' : 'pin';

    return (
      <FocusStage
        mode={mode}
        focusParticipant={stageParticipant}
        screenTrack={
          mode === 'screen' && screenTrack?.publication ? screenTrack : undefined
        }
        others={others}
        pinnedIdentity={pinnedIdentity}
        onTogglePin={onTogglePin}
        onExit={() => {
          if (mode === 'pin') onClearPin();
          // For screen share, Exit just clears an optional pin; share keeps going in fullscreen.
          // If user pinned someone under a share, clear pin. To leave fullscreen while sharing
          // isn't useful — keep share fullscreen until they stop sharing.
          if (mode === 'screen' && pinnedIdentity) onClearPin();
        }}
      />
    );
  }

  const count = participants.length;
  const ordered = [...participants].sort((a, b) => {
    const ah = isHostParticipant(a) ? 0 : 1;
    const bh = isHostParticipant(b) ? 0 : 1;
    return ah - bh;
  });

  return (
    <div className={cn('grid w-full gap-3 p-3 md:gap-4 md:p-4', gridClass(count))}>
      {ordered.map((p) => (
        <ParticipantTile
          key={p.identity}
          participant={p}
          isPinned={pinnedIdentity === p.identity}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
}
