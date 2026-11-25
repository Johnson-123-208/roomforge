import {
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
  useParticipants,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import {
  Camera,
  CameraOff,
  LogOut,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Pin,
  PinOff,
  Users,
} from 'lucide-react';
import { isHostParticipant } from '../../utils/participantRole';
import { cn } from '../../utils/cn';

type Props = {
  durationLabel: string;
  participantCount: number;
  isHost: boolean;
  pinnedIdentity: string | null;
  onToggleParticipants: () => void;
  onPinHost: () => void;
  onUnpin: () => void;
  onLeave: () => void;
  onEndMeeting: () => void;
  onToast?: (msg: string, tone?: 'info' | 'success' | 'error') => void;
};

export function ControlBar({
  durationLabel,
  participantCount,
  isHost,
  pinnedIdentity,
  onToggleParticipants,
  onPinHost,
  onUnpin,
  onLeave,
  onEndMeeting,
  onToast,
}: Props) {
  const room = useRoomContext();
  const participants = useParticipants();
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant();
  const connectionState = useConnectionState(room);

  const host = participants.find((p) => isHostParticipant(p));
  const hostPinned = Boolean(host && pinnedIdentity === host.identity);

  const connectionLabel =
    connectionState === ConnectionState.Connected
      ? 'Connected'
      : connectionState === ConnectionState.Reconnecting
        ? 'Reconnecting…'
        : connectionState === ConnectionState.Connecting
          ? 'Connecting…'
          : 'Disconnected';

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const toggleCam = async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  };

  const toggleScreen = async () => {
    if (isScreenShareEnabled) {
      await localParticipant.setScreenShareEnabled(false);
      return;
    }

    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onToast?.(
        mobile
          ? 'This mobile browser cannot share the screen. Use Chrome on Android, or share from a laptop.'
          : 'Screen sharing is not supported in this browser.',
        'error',
      );
      return;
    }

    try {
      // Mobile browsers often fail when screen-audio is requested — capture video first.
      await localParticipant.setScreenShareEnabled(true, {
        audio: !mobile,
        contentHint: 'detail',
        ...(mobile
          ? {}
          : {
              selfBrowserSurface: 'include' as const,
              surfaceSwitching: 'include' as const,
            }),
      });
      onToast?.(
        mobile
          ? 'Sharing started. Keep this tab open — other people should now see your screen.'
          : 'You are sharing your screen.',
        'success',
      );
    } catch (err) {
      // Retry once with the simplest constraints (helps some Android Chrome builds).
      try {
        await localParticipant.setScreenShareEnabled(true, {
          audio: false,
          contentHint: 'detail',
        });
        onToast?.('You are sharing your screen.', 'success');
      } catch {
        const message =
          err instanceof Error && /Permission|denied|NotAllowed/i.test(err.message)
            ? 'Screen share was blocked. Allow sharing in the browser prompt.'
            : mobile
              ? 'Mobile screen share failed. On iPhone use Safari/Share only if supported, or share from Android Chrome / a laptop.'
              : 'Could not start screen share.';
        onToast?.(message, 'error');
      }
    }
  };

  return (
    <div className="relative z-[60] border-t border-white/10 bg-[var(--secondary-bg)]/95 px-3 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 text-xs text-[var(--text-muted)] md:text-sm">
          <span className="font-mono text-white/90">{durationLabel}</span>
          <span className="hidden h-3 w-px bg-white/15 sm:block" />
          <span className="hidden sm:inline">{participantCount} in call</span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs',
              connectionState === ConnectionState.Connected
                ? 'bg-[var(--success)]/15 text-[var(--success)]'
                : connectionState === ConnectionState.Reconnecting
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'bg-white/10 text-[var(--text-muted)]',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                connectionState === ConnectionState.Connected
                  ? 'bg-[var(--success)]'
                  : 'bg-amber-300',
              )}
            />
            {connectionLabel}
          </span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <ControlButton
            label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
            danger={!isMicrophoneEnabled}
            onClick={() => void toggleMic()}
          >
            {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </ControlButton>
          <ControlButton
            label={isCameraEnabled ? 'Stop camera' : 'Start camera'}
            danger={!isCameraEnabled}
            onClick={() => void toggleCam()}
          >
            {isCameraEnabled ? <Camera size={20} /> : <CameraOff size={20} />}
          </ControlButton>
          <ControlButton
            label={isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}
            danger={isScreenShareEnabled}
            onClick={() => void toggleScreen()}
          >
            {isScreenShareEnabled ? <MonitorOff size={20} /> : <Monitor size={20} />}
          </ControlButton>
          <ControlButton
            label={hostPinned ? 'Unpin host' : 'Pin host'}
            danger={hostPinned}
            onClick={() => {
              if (!host) {
                onToast?.('Host is not in the meeting yet.', 'info');
                return;
              }
              if (hostPinned) onUnpin();
              else onPinHost();
            }}
          >
            {hostPinned ? <PinOff size={20} /> : <Pin size={20} />}
          </ControlButton>
          <ControlButton label="Participants" onClick={onToggleParticipants}>
            <Users size={20} />
          </ControlButton>
          <ControlButton label="Leave" danger onClick={onLeave}>
            <LogOut size={20} />
          </ControlButton>
          {isHost ? (
            <ControlButton label="End for everyone" danger onClick={onEndMeeting}>
              <PhoneOff size={20} />
            </ControlButton>
          ) : null}
        </div>

        <div className="hidden w-40 lg:block" aria-hidden />
      </div>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        danger
          ? 'bg-[var(--danger)] text-white hover:brightness-110'
          : 'bg-white/10 text-white hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}
