import { useEffect } from 'react';
import {
  Track,
  RemoteTrackPublication,
  VideoQuality,
  type Participant,
} from 'livekit-client';
import {
  useIsMuted,
  useIsSpeaking,
  useConnectionQualityIndicator,
  VideoTrack,
  useTracks,
} from '@livekit/components-react';
import { ConnectionQuality } from 'livekit-client';
import {
  MicOff,
  Pin,
  PinOff,
  Monitor,
  Signal,
  SignalHigh,
  SignalLow,
  SignalZero,
} from 'lucide-react';
import { getInitials } from '../../utils/initials';
import { isHostParticipant } from '../../utils/participantRole';
import { cn } from '../../utils/cn';
import type {
  TrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core';

type Props = {
  participant: Participant;
  /** Prefer screen-share track over camera when available */
  preferScreenShare?: boolean;
  isPinned?: boolean;
  onTogglePin?: (identity: string) => void;
  className?: string;
  compact?: boolean;
  /** Fill parent without forcing aspect-video */
  fill?: boolean;
};

function isUsableTrackRef(
  ref: TrackReferenceOrPlaceholder | undefined,
): ref is TrackReference {
  return Boolean(ref && ref.publication && ref.publication.track);
}

export function ParticipantTile({
  participant,
  preferScreenShare = false,
  isPinned = false,
  onTogglePin,
  className,
  compact = false,
  fill = false,
}: Props) {
  const isSpeaking = useIsSpeaking(participant);
  const isMicMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
  });
  const { quality } = useConnectionQualityIndicator({ participant });
  const isHost = isHostParticipant(participant);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const mine = tracks.filter((t) => t.participant.identity === participant.identity);
  const screen = mine.find((t) => t.source === Track.Source.ScreenShare);
  const cam = mine.find((t) => t.source === Track.Source.Camera);

  // Also fall back to publication lookup — mobile screen shares can lag in useTracks.
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const camPub = participant.getTrackPublication(Track.Source.Camera);

  let active: TrackReference | undefined;
  if (preferScreenShare && isUsableTrackRef(screen)) active = screen;
  else if (!preferScreenShare && isUsableTrackRef(cam)) active = cam;
  else if (isUsableTrackRef(cam)) active = cam;
  else if (isUsableTrackRef(screen)) active = screen;

  // Synthesize a track ref from publication if useTracks missed it
  if (!active && preferScreenShare && screenPub?.track) {
    active = {
      participant,
      publication: screenPub,
      source: Track.Source.ScreenShare,
    };
  }
  if (!active && camPub?.track && !preferScreenShare) {
    active = {
      participant,
      publication: camPub,
      source: Track.Source.Camera,
    };
  }

  const showingScreen = active?.source === Track.Source.ScreenShare;
  const hasVideo = Boolean(active?.publication?.track);

  useEffect(() => {
    if (participant.isLocal) return;
    const pubs = [screenPub, preferScreenShare ? screenPub : camPub].filter(Boolean);
    for (const pub of pubs) {
      if (pub instanceof RemoteTrackPublication) {
        if (!pub.isSubscribed) pub.setSubscribed(true);
        try {
          pub.setVideoQuality(VideoQuality.HIGH);
        } catch {
          // ignore
        }
      }
    }
  }, [participant.isLocal, screenPub, camPub, preferScreenShare, hasVideo]);

  const name = participant.name || participant.identity;

  const QualityIcon =
    quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good
      ? SignalHigh
      : quality === ConnectionQuality.Poor
        ? SignalLow
        : quality === ConnectionQuality.Lost
          ? SignalZero
          : Signal;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-[var(--surface-meeting)]',
        !fill && 'aspect-video rounded-2xl',
        fill && 'rounded-none',
        'ring-2 ring-transparent transition-shadow duration-200',
        isSpeaking && !showingScreen && 'ring-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]',
        isPinned && 'ring-[var(--gold)]/70',
        className,
      )}
    >
      {hasVideo && active?.publication ? (
        <VideoTrack
          trackRef={active}
          manageSubscription={false}
          playsInline
          muted={participant.isLocal}
          className={cn(
            'h-full w-full',
            showingScreen || fill ? 'object-contain bg-black' : 'object-cover',
            participant.isLocal && !showingScreen && 'scale-x-[-1]',
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--secondary-bg)]">
          <div
            className={cn(
              'flex items-center justify-center rounded-full bg-[var(--accent)]/20 font-semibold text-[var(--accent)]',
              compact ? 'h-10 w-10 text-sm' : 'h-16 w-16 text-xl md:h-20 md:w-20 md:text-2xl',
            )}
          >
            {getInitials(name)}
          </div>
        </div>
      )}

      {onTogglePin ? (
        <button
          type="button"
          title={isPinned ? 'Unpin' : 'Pin fullscreen'}
          aria-label={isPinned ? 'Unpin participant' : 'Pin participant fullscreen'}
          onClick={() => onTogglePin(participant.identity)}
          className={cn(
            'absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full',
            'bg-black/55 text-white backdrop-blur transition hover:bg-black/75',
            isPinned && 'bg-[var(--gold)]/90 text-[var(--bg)] hover:bg-[var(--gold)]',
          )}
        >
          {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
        <div className="flex min-w-0 items-center gap-2">
          {isMicMuted ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--danger)] text-white">
              <MicOff size={12} />
            </span>
          ) : null}
          {showingScreen ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white">
              <Monitor size={12} />
            </span>
          ) : null}
          <span className="truncate text-sm font-medium text-white drop-shadow">
            {name}
            {participant.isLocal ? ' (You)' : ''}
            {isHost ? ' · Host' : ''}
            {showingScreen ? ' · Screen' : ''}
          </span>
        </div>
        <QualityIcon size={14} className="shrink-0 text-white/70" aria-hidden />
      </div>
    </div>
  );
}
