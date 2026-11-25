import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import '@livekit/components-styles';
import { PhoneOff } from 'lucide-react';
import { ParticipantGrid } from '../components/participants/ParticipantGrid';
import { ParticipantPanel } from '../components/participants/ParticipantPanel';
import { WaitingAdmitPanel } from '../components/participants/WaitingAdmitPanel';
import { ControlBar } from '../components/controls/ControlBar';
import { ToastViewport } from '../components/common/Toast';
import { Button } from '../components/common/Button';
import { useToast } from '../hooks/useToast';
import { clearJoinSession, getJoinSession } from '../lib/session';
import { getHostSecret } from '../lib/hostSecretStore';
import {
  ApiError,
  endMeeting,
  getMeeting,
  muteParticipant,
  recordJoin,
  recordLeave,
  removeParticipant,
} from '../services/api';
import type { JoinSession } from '../types/meeting';
import { isHostParticipant } from '../utils/participantRole';

type EndedNotice = {
  title: string;
  body: string;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function MeetingRoom() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const session = getJoinSession(roomId);
  /** Only clear persistence when the user confirms Leave / End — not on refresh. */
  const intentionalExitRef = useRef(false);

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center text-white">
        <h1 className="text-xl font-semibold">Join required</h1>
        <p className="max-w-md text-sm text-[var(--text-muted)]">
          Open the meeting link and enter the passcode before entering the live room.
        </p>
        <Button onClick={() => navigate(`/meeting/${roomId}`)}>Go to join page</Button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={session.token}
      serverUrl={session.livekitUrl}
      connect
      audio={session.enableMicrophone}
      video={session.enableCamera}
      options={{
        // adaptiveStream can black-out mobile screen shares when the video element
        // briefly reports 0 size; keep dynacast for camera bandwidth.
        adaptiveStream: false,
        dynacast: true,
        publishDefaults: {
          videoCodec: 'vp8',
          videoEncoding: {
            maxBitrate: 1_500_000,
            maxFramerate: 30,
          },
          screenShareEncoding: {
            maxBitrate: 3_000_000,
            maxFramerate: 15,
          },
          degradationPreference: 'maintain-resolution',
        },
      }}
      onError={(err) => push(err.message || 'Connection error', 'error')}
      onDisconnected={() => {
        // Refresh / brief network drops must NOT wipe the join session.
        if (intentionalExitRef.current) {
          clearJoinSession();
        }
      }}
      data-lk-theme="default"
      className="flex min-h-dvh flex-col bg-[var(--bg)]"
      style={{ height: '100dvh' }}
    >
      <MeetingRoomInner
        session={session}
        onToast={push}
        onLeaveNavigate={() => {
          intentionalExitRef.current = true;
          clearJoinSession();
          navigate(`/meeting/${roomId}`);
        }}
        onEndedNavigate={() => {
          intentionalExitRef.current = true;
          clearJoinSession();
          navigate('/');
        }}
      />
      <RoomAudioRenderer />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </LiveKitRoom>
  );
}

function MeetingRoomInner({
  session,
  onToast,
  onLeaveNavigate,
  onEndedNavigate,
}: {
  session: JoinSession;
  onToast: (msg: string, tone?: 'info' | 'success' | 'error') => void;
  onLeaveNavigate: () => void;
  onEndedNavigate: () => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [panelOpen, setPanelOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);
  const [endedNotice, setEndedNotice] = useState<EndedNotice | null>(null);
  const forcedExitRef = useRef(false);

  // Host privilege comes from server-issued token / verified host secret — not a client boolean alone.
  // UI uses session.isHost only to show controls; every host API call sends host_token or host_secret.
  const isHost = session.isHost;

  const showMeetingEnded = useCallback(
    (notice: EndedNotice) => {
      if (forcedExitRef.current) return;
      forcedExitRef.current = true;
      clearJoinSession();
      setConfirmEnd(false);
      setConfirmLeave(false);
      setEndedNotice(notice);
      try {
        void room.disconnect();
      } catch {
        // ignore
      }
    },
    [room],
  );

  useEffect(() => {
    if (!isHost || !localParticipant) return;
    const desired = JSON.stringify({ role: 'host' });
    if (localParticipant.metadata === desired) return;
    void localParticipant.setMetadata(desired).catch(() => undefined);
  }, [isHost, localParticipant]);

  const hostAuth = useMemo(() => {
    const secret = getHostSecret(session.roomId)?.trim() || undefined;
    const token = session.hostToken?.trim() || undefined;
    return {
      ...(token ? { host_token: token } : {}),
      ...(secret ? { host_secret: secret } : {}),
    };
  }, [session.hostToken, session.roomId]);

  // Poll + disconnect listener so guests see a clear "meeting ended" screen.
  useEffect(() => {
    let cancelled = false;

    const handleEnded = (status: 'ended' | 'expired') => {
      if (cancelled || forcedExitRef.current) return;
      showMeetingEnded({
        title: status === 'expired' ? 'This meeting has expired' : 'This meeting has ended',
        body:
          status === 'expired'
            ? 'The meeting time window is over. Thank you for joining.'
            : 'The host ended the meeting for everyone. You can close this page or return home.',
      });
    };

    const check = async () => {
      try {
        const meeting = await getMeeting(session.roomId);
        if (cancelled || forcedExitRef.current) return;
        if (meeting.status === 'ended' || meeting.status === 'expired') {
          handleEnded(meeting.status);
        }
      } catch {
        // ignore transient errors
      }
    };

    const onDisconnected = () => {
      if (forcedExitRef.current || cancelled) return;
      void check();
    };

    void check();
    const id = window.setInterval(() => void check(), 2500);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [session.roomId, room, showMeetingEnded]);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pinnedIdentity) return;
    if (!participants.some((p) => p.identity === pinnedIdentity)) {
      setPinnedIdentity(null);
    }
  }, [participants, pinnedIdentity]);

  useEffect(() => {
    // Re-mark connected after refresh/reconnect. Do NOT record leave on unmount —
    // refresh unmounts the room and that used to drop people from the meeting.
    void recordJoin(session.roomId, {
      participant_identity: session.participantIdentity,
      display_name: session.displayName,
      is_host: session.isHost,
    }).catch(() => undefined);
  }, [session]);

  const leave = useCallback(async () => {
    setBusy(true);
    try {
      await recordLeave(session.roomId, session.participantIdentity);
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setConfirmLeave(false);
    }
    onLeaveNavigate();
  }, [onLeaveNavigate, session.participantIdentity, session.roomId]);

  const endForEveryone = useCallback(async () => {
    if (!hostAuth.host_token && !hostAuth.host_secret) {
      onToast(
        'Host secret missing. Open your host link or paste the host secret on the join page, then try again.',
        'error',
      );
      setConfirmEnd(false);
      return;
    }

    setBusy(true);
    try {
      await endMeeting(session.roomId, hostAuth);
      showMeetingEnded({
        title: 'Meeting ended for everyone',
        body: 'You ended the meeting. All participants have been disconnected.',
      });
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : 'Could not end meeting.',
        'error',
      );
      setConfirmEnd(false);
    } finally {
      setBusy(false);
    }
  }, [hostAuth, onToast, showMeetingEnded]);

  const onRemove = useCallback(
    async (identity: string) => {
      if (!window.confirm('Remove this participant from the meeting?')) return;
      try {
        await removeParticipant(session.roomId, identity, hostAuth);
        onToast('Participant removed.', 'success');
      } catch (err) {
        onToast(
          err instanceof ApiError ? err.message : 'Could not remove participant.',
          'error',
        );
      }
    },
    [hostAuth, onToast, session.roomId],
  );

  const onMuteMic = useCallback(
    async (identity: string, name: string) => {
      if (!hostAuth.host_token && !hostAuth.host_secret) {
        onToast(
          'Host secret missing. Rejoin with the host secret to moderate guests.',
          'error',
        );
        return;
      }
      try {
        await muteParticipant(session.roomId, identity, 'microphone', hostAuth, true);
        onToast(`Muted ${name}`, 'success');
      } catch (err) {
        onToast(
          err instanceof ApiError ? err.message : 'Could not mute that participant.',
          'error',
        );
      }
    },
    [hostAuth, onToast, session.roomId],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border-dark)] px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/logo.svg"
            alt=""
            className="hidden h-9 w-9 rounded-xl object-cover ring-1 ring-[var(--accent)]/40 sm:block"
          />
          <div className="min-w-0">
            <h1 className="truncate font-[family-name:var(--font-display)] text-sm tracking-wide text-white md:text-base">
              {session.meeting.title}
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              RoomForge · {isHost ? 'Host' : 'Guest'} · {session.roomId}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-[var(--border-dark)] bg-white/5 px-3 py-1 text-xs text-[var(--gold)]">
          {participants.length}/{session.meeting.max_participants}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {isHost ? (
          <WaitingAdmitPanel
            roomId={session.roomId}
            hostAuth={hostAuth}
            onToast={onToast}
          />
        ) : null}
        <ParticipantGrid
          pinnedIdentity={pinnedIdentity}
          onTogglePin={(identity) =>
            setPinnedIdentity((prev) => (prev === identity ? null : identity))
          }
          onClearPin={() => setPinnedIdentity(null)}
        />
        <ParticipantPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          isHost={isHost}
          localIdentity={session.participantIdentity}
          onRemove={onRemove}
          onMuteMic={(identity, name) => void onMuteMic(identity, name)}
        />
      </div>

      <ControlBar
        durationLabel={formatDuration(elapsed)}
        participantCount={participants.length}
        isHost={isHost}
        pinnedIdentity={pinnedIdentity}
        onToggleParticipants={() => setPanelOpen((v) => !v)}
        onPinHost={() => {
          const host = participants.find((p) => isHostParticipant(p));
          if (host) setPinnedIdentity(host.identity);
          else onToast('Host is not in the meeting yet.', 'info');
        }}
        onUnpin={() => setPinnedIdentity(null)}
        onLeave={() => setConfirmLeave(true)}
        onEndMeeting={() => setConfirmEnd(true)}
        onToast={onToast}
      />

      {confirmLeave && !endedNotice ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--secondary-bg)] p-5 text-white shadow-xl">
            <h2 className="text-lg font-semibold">Leave this meeting?</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              You will disconnect from the live room. You can rejoin with the passcode if the meeting is still active.
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 !text-white hover:!bg-white/10"
                onClick={() => setConfirmLeave(false)}
                disabled={busy}
              >
                Stay
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => void leave()}
                disabled={busy}
              >
                {busy ? 'Leaving…' : 'Leave'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmEnd && !endedNotice ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--secondary-bg)] p-5 text-white shadow-xl">
            <h2 className="text-lg font-semibold">End meeting for everyone?</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              All participants will be disconnected and the room cannot be rejoined.
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 !text-white hover:!bg-white/10"
                onClick={() => setConfirmEnd(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => void endForEveryone()}
                disabled={busy}
              >
                {busy ? 'Ending…' : 'End meeting'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {endedNotice ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[var(--gold)]/30 bg-[var(--secondary-bg)] p-6 text-center text-white shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--danger)]/20 text-[var(--danger)]">
              <PhoneOff size={28} />
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-wide">
              {endedNotice.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              {endedNotice.body}
            </p>
            <Button className="mt-6 w-full" onClick={onEndedNavigate}>
              Back to home
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
