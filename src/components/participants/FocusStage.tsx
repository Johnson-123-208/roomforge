import { useEffect, useMemo, useRef } from 'react';
import {
  Track,
  RemoteTrackPublication,
  VideoQuality,
  type Participant,
} from 'livekit-client';
import {
  VideoTrack,
  useTracks,
  useRoomContext,
} from '@livekit/components-react';
import { PinOff, X } from 'lucide-react';
import { ParticipantTile } from './ParticipantTile';
import { isHostParticipant } from '../../utils/participantRole';
import { cn } from '../../utils/cn';
import type { TrackReference } from '@livekit/components-core';

type Props = {
  mode: 'screen' | 'pin';
  focusParticipant: Participant;
  screenTrack?: TrackReference;
  others: Participant[];
  pinnedIdentity: string | null;
  onTogglePin: (identity: string) => void;
  onExit: () => void;
};

export function FocusStage({
  mode,
  focusParticipant,
  screenTrack,
  others,
  pinnedIdentity,
  onTogglePin,
  onExit,
}: Props) {
  const room = useRoomContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const name = focusParticipant.name || focusParticipant.identity;
  const isHost = isHostParticipant(focusParticipant);

  // Enter true browser fullscreen when pinning (best effort; ignore denials).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (mode === 'pin' || mode === 'screen') {
      const req =
        el.requestFullscreen?.bind(el) ||
        (
          el as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
          }
        ).webkitRequestFullscreen?.bind(el);
      try {
        void req?.();
      } catch {
        // ignore — fixed overlay still covers the app
      }
    }
    return () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, [mode, focusParticipant.identity]);

  // Always pull the highest quality screen-share / pinned video on remote viewers.
  useEffect(() => {
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (!(pub instanceof RemoteTrackPublication)) continue;
        const isScreen = pub.source === Track.Source.ScreenShare;
        const isFocusCam =
          participant.identity === focusParticipant.identity &&
          pub.source === Track.Source.Camera;
        if (!isScreen && !isFocusCam) continue;
        if (!pub.isSubscribed) pub.setSubscribed(true);
        try {
          pub.setVideoQuality(VideoQuality.HIGH);
        } catch {
          // older rooms may not support quality hints
        }
      }
    }
  }, [room, focusParticipant.identity, screenTrack?.publication?.trackSid]);

  const label =
    mode === 'screen'
      ? `${name}${isHost ? ' (Host)' : ''} · Screen`
      : `${name}${isHost ? ' (Host)' : ''} · Pinned`;

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-3 py-2 backdrop-blur sm:px-4">
        <p className="min-w-0 truncate text-sm font-medium text-white">{label}</p>
        <div className="flex shrink-0 items-center gap-2">
          {mode === 'pin' ? (
            <>
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
              >
                <PinOff size={14} />
                Unpin
              </button>
              <button
                type="button"
                aria-label="Close fullscreen"
                onClick={onExit}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <span className="rounded-full bg-[var(--gold)]/20 px-3 py-1.5 text-xs text-[var(--gold)]">
              Screen share · fullscreen
            </span>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        {mode === 'screen' && screenTrack?.publication ? (
          <VideoTrack
            trackRef={screenTrack}
            manageSubscription={false}
            playsInline
            muted={focusParticipant.isLocal}
            className="absolute inset-0 h-full w-full object-contain bg-black"
          />
        ) : (
          <ParticipantTile
            participant={focusParticipant}
            preferScreenShare={mode === 'screen'}
            isPinned={mode === 'pin'}
            className="absolute inset-0 h-full w-full !aspect-auto rounded-none"
            fill
          />
        )}
      </div>

      {others.length > 0 ? (
        <div className="shrink-0 border-t border-white/10 bg-black/90 px-2 py-2 sm:px-3">
          <div
            className={cn(
              'mx-auto grid max-w-6xl gap-2',
              others.length === 1
                ? 'max-w-xs grid-cols-1'
                : others.length === 2
                  ? 'max-w-md grid-cols-2'
                  : others.length <= 4
                    ? 'grid-cols-2 sm:grid-cols-4'
                    : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6',
            )}
          >
            {others.map((p) => (
              <ParticipantTile
                key={p.identity}
                participant={p}
                compact
                isPinned={pinnedIdentity === p.identity}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Collect live screen-share track refs (subscribed or not). */
export function useLiveScreenShares() {
  const tracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  return useMemo(() => {
    return tracks.filter((t) => {
      const pub = t.publication;
      if (!pub || pub.isMuted) return false;
      // Include pubs before the MediaStreamTrack attaches (common right after mobile share starts).
      return true;
    });
  }, [tracks]);
}
