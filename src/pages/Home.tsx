import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Link2, Shield, Users, Video } from 'lucide-react';
import { BrandShell } from '../components/common/BrandShell';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { syncCreateAccessFromSearch } from '../lib/createAccess';

function extractRoomId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/meeting\/([^/]+)/);
    return match?.[1] ?? null;
  } catch {
    if (/^[a-z0-9-]{6,}$/i.test(trimmed)) return trimmed;
    return null;
  }
}

export function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [canCreate, setCanCreate] = useState(false);
  const [joinValue, setJoinValue] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    const { unlocked, cleanedSearch } = syncCreateAccessFromSearch(location.search);
    setCanCreate(unlocked);
    if (unlocked && cleanedSearch !== location.search) {
      window.history.replaceState(
        null,
        '',
        `${location.pathname}${cleanedSearch}${location.hash}`,
      );
    }
  }, [location.pathname, location.search, location.hash]);

  const onJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const roomId = extractRoomId(joinValue);
    if (!roomId) {
      setJoinError('Enter a valid meeting link or room ID.');
      return;
    }
    navigate(`/meeting/${roomId}`);
  };

  return (
    <BrandShell
      showHomeLink={false}
      actions={
        canCreate ? (
          <Button variant="secondary" size="sm" onClick={() => navigate('/create')}>
            Create room
          </Button>
        ) : null
      }
    >
      <main className="mx-auto flex max-w-5xl flex-col px-6 pb-20">
        <section className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
          <img
            src="/logo.svg"
            alt="RoomForge"
            className="mb-8 h-28 w-28 rounded-2xl object-cover shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-[var(--accent)]/35 md:h-32 md:w-32"
          />

          <p className="mb-3 text-xs font-medium uppercase tracking-[0.28em] text-[var(--accent-deep)]">
            Private video rooms for small teams
          </p>

          <h1 className="font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--text-light)] md:text-6xl">
            RoomForge
          </h1>
          <p className="mt-3 text-sm tracking-[0.22em] text-[var(--accent-deep)] uppercase">
            Passcode meetings
          </p>

          <p className="mt-6 max-w-xl text-base text-[var(--text-light-muted)] md:text-lg">
            {canCreate
              ? 'Host access unlocked. Create a room, then share the link and passcode with your team.'
              : 'Join a meeting with the link and passcode shared by your host.'}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {canCreate ? (
              <Button size="lg" onClick={() => navigate('/create')} icon={<ArrowRight size={18} />}>
                Create Room
              </Button>
            ) : null}
            <Button
              size="lg"
              variant={canCreate ? 'secondary' : 'primary'}
              onClick={() => document.getElementById('join-field')?.focus()}
              icon={<Link2 size={18} />}
            >
              Join Room
            </Button>
          </div>

          <form
            onSubmit={onJoin}
            className="mt-10 flex w-full max-w-lg flex-col gap-3 text-left sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Input
                id="join-field"
                label="Meeting link or room ID"
                placeholder="Paste meeting URL…"
                value={joinValue}
                onChange={(e) => {
                  setJoinValue(e.target.value);
                  setJoinError('');
                }}
                error={joinError}
              />
            </div>
            <Button type="submit" variant="secondary" className="sm:mb-[1px]">
              Continue
            </Button>
          </form>
        </section>

        <section className="mt-6 grid gap-8 border-t border-[var(--border)] pt-12 md:grid-cols-3">
          {(canCreate
            ? [
                {
                  icon: Video,
                  title: 'Open a private room',
                  body: 'Create a room instantly — share a link and passcode with your group.',
                },
                {
                  icon: Users,
                  title: 'Invite your team',
                  body: 'Members open the link, enter their name and passcode, and join live.',
                },
                {
                  icon: Shield,
                  title: 'Host stays in control',
                  body: 'Guest access uses the passcode. Host controls use your separate host secret.',
                },
              ]
            : [
                {
                  icon: Link2,
                  title: 'Open your invite',
                  body: 'Use the meeting link your host shared — no account is required.',
                },
                {
                  icon: Users,
                  title: 'Join in seconds',
                  body: 'Enter your name and the passcode, check your camera, and begin.',
                },
                {
                  icon: Video,
                  title: 'Meet together',
                  body: 'Live audio and video — passcode-gated, capped at eight, no recording.',
                },
              ]
          ).map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-deep)]">
                <Icon size={18} />
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-base tracking-wide text-[var(--text-light)]">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-light-muted)]">{body}</p>
            </div>
          ))}
        </section>

        <p className="mt-12 text-center text-sm text-[var(--text-light-muted)]">
          Up to 8 participants · Live audio & video · No recording
        </p>
      </main>
    </BrandShell>
  );
}
