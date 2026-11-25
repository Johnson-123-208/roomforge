import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Shield,
  AlertTriangle,
  LoaderCircle,
} from 'lucide-react';
import { BrandShell } from '../components/common/BrandShell';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ToastViewport } from '../components/common/Toast';
import { useToast } from '../hooks/useToast';
import { useMediaDevices } from '../hooks/useMediaDevices';
import {
  ApiError,
  claimAdmission,
  getMeeting,
  getWaitingStatus,
  verifyAndJoin,
} from '../services/api';
import { getHostSecret, hasHostSecret, saveHostSecret } from '../lib/hostSecretStore';
import { saveJoinSession } from '../lib/session';
import type { SafeMeeting, VerifyJoinedResponse } from '../types/meeting';
import { cn } from '../utils/cn';
import { playWaitingChime } from '../utils/meetingSounds';

type LocationState = {
  prefillPasscode?: string;
  asHost?: boolean;
};

export function JoinMeeting() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const locationState = (location.state || {}) as LocationState;
  const { toasts, push, dismiss } = useToast();
  const media = useMediaDevices();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [meeting, setMeeting] = useState<SafeMeeting | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [passcode, setPasscode] = useState(locationState.prefillPasscode || '');
  const [hostSecretInput, setHostSecretInput] = useState('');
  const [showHostField, setShowHostField] = useState(
    Boolean(locationState.asHost || searchParams.get('host') === '1'),
  );
  const [joining, setJoining] = useState(false);
  const [waitingIdentity, setWaitingIdentity] = useState<string | null>(null);
  const [waitingName, setWaitingName] = useState('');
  const [waitingPasscode, setWaitingPasscode] = useState('');
  const [waitingMessage, setWaitingMessage] = useState('Waiting for the host to admit you…');

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await getMeeting(roomId);
        if (cancelled) return;
        setMeeting(m);
        if (m.status !== 'active') {
          setLoadError(
            m.status === 'ended'
              ? 'This meeting has ended.'
              : 'This meeting has expired.',
          );
        }
        if (hasHostSecret(roomId) || searchParams.get('host') === '1') {
          setShowHostField(true);
          setHostSecretInput(getHostSecret(roomId) || '');
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Meeting not found.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, searchParams]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (media.previewStream) {
      el.srcObject = media.previewStream;
      el.muted = true;
      el.playsInline = true;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          // Autoplay can fail until a user gesture; muted preview usually works.
        });
      }
    } else {
      el.srcObject = null;
    }
  }, [media.previewStream, media.cameraEnabled]);

  const enterLive = (result: VerifyJoinedResponse) => {
    saveJoinSession({
      roomId,
      token: result.token,
      livekitUrl: result.livekit_url,
      participantIdentity: result.participant_identity,
      displayName: result.display_name,
      isHost: result.is_host,
      hostToken: result.host_token,
      meeting: result.meeting,
      enableCamera: media.cameraEnabled,
      enableMicrophone: media.micEnabled,
    });
    media.previewStream?.getTracks().forEach((t) => t.stop());
    navigate(`/meeting/${roomId}/live`, { replace: true });
  };

  // Soft waiting chime while the guest is in the admit queue
  useEffect(() => {
    if (!waitingIdentity) return;
    let cancelled = false;
    const chime = () => {
      if (!cancelled) void playWaitingChime();
    };
    chime();
    const id = window.setInterval(chime, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [waitingIdentity]);

  // Poll waiting status until admitted or denied
  useEffect(() => {
    if (!waitingIdentity || !roomId) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const status = await getWaitingStatus(roomId, waitingIdentity);
        if (cancelled) return;

        if (status.status === 'denied' || status.left) {
          setWaitingIdentity(null);
          push('The host did not admit you to this meeting.', 'error');
          return;
        }

        if (status.status === 'admitted') {
          setWaitingMessage('Admitted — joining the meeting…');
          const joined = await claimAdmission(roomId, {
            participant_identity: waitingIdentity,
            display_name: waitingName,
            passcode: waitingPasscode,
          });
          if (cancelled) return;
          enterLive(joined);
          return;
        }

        if (status.status === 'connected') {
          setWaitingIdentity(null);
          push('You are already in this meeting. Join again if needed.', 'info');
        }
      } catch {
        // keep polling on transient errors
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingIdentity, roomId, waitingName, waitingPasscode]);

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !meeting) return;
    if (meeting.status !== 'active') {
      push(loadError || 'Meeting is not joinable.', 'error');
      return;
    }
    if (!displayName.trim()) {
      push('Please enter your name to join.', 'error');
      return;
    }
    const cleanedPasscode = passcode.trim().replace(/\s+/g, '');
    if (!cleanedPasscode) {
      push('Enter the meeting passcode.', 'error');
      return;
    }

    setJoining(true);
    try {
      const hostSecret =
        hostSecretInput.trim() || getHostSecret(roomId) || undefined;

      const result = await verifyAndJoin(roomId, {
        passcode: cleanedPasscode,
        display_name: displayName.trim(),
        host_secret: showHostField ? hostSecret : undefined,
        enable_camera: media.cameraEnabled,
        enable_microphone: media.micEnabled,
      });

      if (result.status === 'waiting') {
        setWaitingIdentity(result.participant_identity);
        setWaitingName(result.display_name);
        setWaitingPasscode(cleanedPasscode);
        setWaitingMessage(result.message || 'Waiting for the host to admit you…');
        push('Your name was sent. Waiting for the host to admit you.', 'info');
        return;
      }

      // Persist host secret when joining as host so End / Admit keep working after refresh.
      if (result.is_host && hostSecret) {
        saveHostSecret(roomId, hostSecret, { rememberOnDevice: true });
      }

      enterLive(result);
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not join meeting.', 'error');
    } finally {
      setJoining(false);
    }
  };

  if (waitingIdentity) {
    return (
      <BrandShell>
        <main className="mx-auto flex max-w-lg flex-col items-center px-6 pb-20 pt-10 text-center">
          <LoaderCircle className="mb-4 h-10 w-10 animate-spin text-[var(--gold-deep)]" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-[#1a1714]">
            Almost there, {waitingName}
          </h1>
          <p className="mt-3 text-sm text-[#5c574f]">{waitingMessage}</p>
          <p className="mt-2 text-xs text-[#6b6358]">
            Stay on this page. You will join automatically once the host admits you.
          </p>
          <p className="mt-1 text-xs text-[#8a8276]">A soft chime plays while you wait.</p>
          <Button
            className="mt-8"
            variant="secondary"
            onClick={() => {
              setWaitingIdentity(null);
              setJoining(false);
            }}
          >
            Cancel
          </Button>
        </main>
        <ToastViewport toasts={toasts} onDismiss={dismiss} />
      </BrandShell>
    );
  }

  return (
    <BrandShell>
      <main className="mx-auto grid max-w-5xl gap-8 px-6 pb-16 lg:grid-cols-2">
        <section className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg)] shadow-lg">
            <div className="relative aspect-video bg-[var(--secondary-bg)]">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={cn(
                  'h-full w-full scale-x-[-1] object-cover',
                  !(media.cameraEnabled && media.previewStream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')) &&
                    'hidden',
                )}
              />
              {!(
                media.cameraEnabled &&
                media.previewStream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
              ) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[#9CA3AF]">
                  <CameraOff size={36} />
                  <p className="text-sm">
                    {!media.cameraEnabled
                      ? 'Camera is off'
                      : media.permissionState === 'denied'
                        ? 'Camera permission denied'
                        : media.error
                          ? 'Camera unavailable'
                          : 'Starting camera…'}
                  </p>
                  {media.permissionState === 'denied' || media.error ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => void media.requestPermissions()}
                    >
                      Enable camera & mic
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-center gap-2 p-4">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  aria-label={media.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full transition',
                    media.micEnabled
                      ? 'bg-white/15 text-white hover:bg-white/25'
                      : 'bg-[var(--danger)] text-white',
                  )}
                  onClick={() => media.setMicEnabled(!media.micEnabled)}
                >
                  {media.micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button
                  type="button"
                  aria-label={media.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full transition',
                    media.cameraEnabled
                      ? 'bg-white/15 text-white hover:bg-white/25'
                      : 'bg-[var(--danger)] text-white',
                  )}
                  onClick={() => media.setCameraEnabled(!media.cameraEnabled)}
                >
                  {media.cameraEnabled ? <Camera size={20} /> : <CameraOff size={20} />}
                </button>
              </div>
              <p className="text-xs text-[#9CA3AF]">
                {media.statusMessage}
                {media.permissionState === 'granted' ? ' · Permission granted' : ''}
              </p>
            </div>
          </div>

          {(media.cameras.length > 0 || media.microphones.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-[#1a1714]">
                <span className="mb-1.5 block font-semibold text-[#1a1714]">Camera</span>
                <select
                  className="h-10 w-full rounded-xl border-2 border-[#c4bba8] bg-[#fffdf9] px-3 text-sm text-[#1a1714]"
                  value={media.selectedCameraId}
                  onChange={(e) => media.setSelectedCameraId(e.target.value)}
                  disabled={media.cameras.length === 0}
                >
                  {media.cameras.length === 0 ? (
                    <option>No camera found</option>
                  ) : (
                    media.cameras.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Camera'}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="text-sm text-[#1a1714]">
                <span className="mb-1.5 block font-semibold text-[#1a1714]">Microphone</span>
                <select
                  className="h-10 w-full rounded-xl border-2 border-[#c4bba8] bg-[#fffdf9] px-3 text-sm text-[#1a1714]"
                  value={media.selectedMicId}
                  onChange={(e) => media.setSelectedMicId(e.target.value)}
                  disabled={media.microphones.length === 0}
                >
                  {media.microphones.length === 0 ? (
                    <option>No microphone found</option>
                  ) : (
                    media.microphones.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || 'Microphone'}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          )}

          {media.error ? (
            <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>{media.error}</p>
            </div>
          ) : null}
        </section>

        <section className="order-1 lg:order-2">
          <div className="rounded-3xl border border-[var(--border)] bg-white/85 p-6 shadow-sm backdrop-blur md:p-8">
            <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-[#1a1714]">
              {meeting?.title || 'Join room'}
            </h1>
            <p className="mt-2 text-sm text-[#5c574f]">
              Enter your name and the meeting passcode. Guests wait for host admission before joining
              live.
            </p>

            {loadError ? (
              <div className="mt-6 rounded-xl border border-[var(--danger)]/20 bg-red-50 p-4 text-sm text-[var(--danger)]">
                {loadError}
              </div>
            ) : (
              <form onSubmit={onJoin} className="mt-6 flex flex-col gap-4">
                <Input
                  label="Your name"
                  placeholder="Enter your full name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={50}
                  required
                  autoFocus
                  hint="Required — this is how others will see you in the meeting."
                />
                <Input
                  label="Meeting passcode"
                  type="text"
                  placeholder="Passcode shared by the host"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  hint="Enter the passcode exactly as shown in the invitation (spaces are ignored)."
                />

                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 self-start text-sm text-[var(--gold-deep)] hover:underline"
                  onClick={() => setShowHostField((v) => !v)}
                >
                  <Shield size={14} />
                  {showHostField ? 'Hide host options' : "I'm the meeting host"}
                </button>

                {showHostField ? (
                  <Input
                    label="Host secret"
                    type="password"
                    placeholder="Paste host secret"
                    value={hostSecretInput}
                    onChange={(e) => setHostSecretInput(e.target.value)}
                    hint="Hosts join immediately and can admit waiting guests."
                    autoComplete="off"
                  />
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={joining || !meeting || meeting.status !== 'active'}
                >
                  {joining
                    ? 'Submitting…'
                    : showHostField
                      ? 'Join as Host'
                      : 'Request to Join'}
                </Button>
              </form>
            )}
          </div>
        </section>
      </main>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </BrandShell>
  );
}
