import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { BrandShell } from '../components/common/BrandShell';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ToastViewport } from '../components/common/Toast';
import { useToast } from '../hooks/useToast';
import { createMeeting, ApiError } from '../services/api';
import { saveHostSecret } from '../lib/hostSecretStore';
import { getCreateAccessToken } from '../lib/createAccess';
import { buildInvitation, copyText } from '../utils/clipboard';
import { publicMeetingUrl } from '../utils/meetingUrl';
import type { CreateMeetingResponse } from '../types/meeting';

function randomPasscode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function CreateMeeting() {
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();

  const [title, setTitle] = useState('');
  const [passcode, setPasscode] = useState(randomPasscode);
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [rememberHost, setRememberHost] = useState(true);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreateMeetingResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const flashCopied = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      push('Enter a meeting title.', 'error');
      return;
    }
    const createAccess = getCreateAccessToken();
    if (!createAccess) {
      push('Create access is required. Open the host invite URL first.', 'error');
      navigate('/');
      return;
    }

    setLoading(true);
    try {
      const meeting = await createMeeting({
        title: title.trim(),
        passcode,
        max_participants: maxParticipants,
        create_access: createAccess,
        frontend_origin: window.location.origin,
      });

      const inviteUrl = publicMeetingUrl(meeting.room_id, meeting.meeting_url);
      const normalized: CreateMeetingResponse = {
        ...meeting,
        meeting_url: inviteUrl,
      };

      saveHostSecret(normalized.room_id, normalized.host_secret, {
        rememberOnDevice: rememberHost,
        meta: {
          title: normalized.title,
          passcode: normalized.passcode,
          meetingUrl: normalized.meeting_url,
          createdAt: new Date().toISOString(),
        },
      });

      setCreated(normalized);
      push('Room created. Join as host when you are ready.', 'success');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not create room.';
      push(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const onCopy = async (label: string, value: string) => {
    const ok = await copyText(value);
    if (ok) {
      flashCopied(label);
      push(`${label} copied`, 'success');
    } else {
      push('Copy failed — select and copy manually.', 'error');
    }
  };

  return (
    <BrandShell>
      <main className="mx-auto max-w-2xl px-6 pb-16">
        {!created ? (
          <form
            onSubmit={onCreate}
            className="rounded-3xl border border-[var(--border)] bg-white/85 p-6 shadow-sm backdrop-blur md:p-8"
          >
            <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-wide">
              Create a room
            </h1>
            <p className="mt-2 text-sm text-[var(--text-light-muted)]">
              No account needed. You&apos;ll receive a link, passcode for guests, and a separate host
              secret for owner controls.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              <Input
                label="Meeting title"
                placeholder="Weekly team sync"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
                autoFocus
              />

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium">Passcode</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--gold-deep)] hover:underline"
                    onClick={() => setPasscode(randomPasscode())}
                  >
                    <RefreshCw size={12} /> Generate secure passcode
                  </button>
                </div>
                <Input
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  minLength={4}
                  maxLength={64}
                  required
                  hint="Guests need this to join. Only a secure hash is stored on the server."
                />
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a1714]">
                  <Users size={14} /> Maximum participants
                </span>
                <select
                  className="h-11 w-full rounded-xl border-2 border-[#c4bba8] bg-[#fffdf9] px-3.5 text-sm text-[#1a1714]"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} participants
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-xl border-2 border-[#d7cdba] bg-[#f3ebe0] p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  checked={rememberHost}
                  onChange={(e) => setRememberHost(e.target.checked)}
                />
                <span>
                  <span className="block font-semibold text-[#1a1714]">
                    Remember host secret on this device
                  </span>
                  <span className="mt-1 block leading-relaxed text-[#3f3a32]">
                    Keeps host controls after refresh. Uncheck on shared computers and copy the
                    secret yourself.
                  </span>
                </span>
              </label>
            </div>

            <Button type="submit" className="mt-6 w-full" size="lg" disabled={loading}>
              {loading ? 'Creating…' : 'Create Room'}
            </Button>
          </form>
        ) : (
          <div className="rounded-3xl border border-[var(--border)] bg-white/85 p-6 shadow-sm backdrop-blur md:p-8">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--success)]/10 px-2.5 py-1 text-xs font-medium text-[var(--success)]">
              <Check size={12} /> Room ready
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-wide">
              {created.title}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-light-muted)]">
              Share the link and passcode with your group. Keep the host secret private — it unlocks
              end-meeting and remove-participant controls.
            </p>

            <div className="mt-6 space-y-3">
              <SecretRow
                label="Meeting link"
                value={created.meeting_url}
                copied={copied === 'link'}
                onCopy={() => onCopy('link', created.meeting_url)}
              />
              <SecretRow
                label="Passcode"
                value={created.passcode}
                copied={copied === 'passcode'}
                onCopy={() => onCopy('passcode', created.passcode)}
              />
              <SecretRow
                label="Host secret"
                value={created.host_secret}
                copied={copied === 'host'}
                onCopy={() => onCopy('host', created.host_secret)}
                warn="Shown once. Stored only in your browser for recovery — never in the database as plaintext."
              />
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-3 text-sm text-[var(--text-light)]">
              <p className="inline-flex items-center gap-1.5 font-medium text-[var(--gold-deep)]">
                <ShieldCheck size={14} /> Host recovery
              </p>
              <p className="mt-1 text-[var(--text-light-muted)]">
                Your host secret is saved in this browser so refreshing won&apos;t lock you out of
                host controls. Copy it somewhere safe if you may switch devices.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                className="flex-1"
                icon={<Copy size={16} />}
                onClick={() =>
                  onCopy(
                    'invitation',
                    buildInvitation({
                      title: created.title,
                      meetingUrl: created.meeting_url,
                      passcode: created.passcode,
                    }),
                  )
                }
              >
                Copy invitation
              </Button>
              <Button
                className="flex-1"
                icon={<KeyRound size={16} />}
                onClick={() =>
                  navigate(`/meeting/${created.room_id}?host=1`, {
                    state: {
                      prefillPasscode: created.passcode,
                      asHost: true,
                    },
                  })
                }
              >
                Join as Host
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-[#5c574f]">
              Guests who open the meeting link will enter their name and wait until you admit them.
            </p>
          </div>
        )}
      </main>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </BrandShell>
  );
}

function SecretRow({
  label,
  value,
  onCopy,
  copied,
  warn,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  warn?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--ivory)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-light-muted)]">
            {label}
          </p>
          <p className="mt-1 break-all font-mono text-sm text-[var(--text-light)]">{value}</p>
          {warn ? <p className="mt-1.5 text-xs text-[var(--text-light-muted)]">{warn}</p> : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onCopy}
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
