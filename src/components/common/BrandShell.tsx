import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { cn } from '../../utils/cn';

type Props = {
  children: ReactNode;
  className?: string;
  showHomeLink?: boolean;
  actions?: ReactNode;
};

export function BrandShell({
  children,
  className,
  showHomeLink = true,
  actions,
}: Props) {
  return (
    <div className={cn('rf-page', className)}>
      <div className="rf-page__bg" aria-hidden>
        <div className="rf-page__bg-image" />
        <div className="rf-page__bg-overlay" />
      </div>

      <div className="rf-page__content">
        <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
          <Link to="/" aria-label="RoomForge home">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            {actions}
            {showHomeLink ? (
              <Link
                to="/"
                className="text-sm text-[var(--text-light-muted)] transition hover:text-[var(--text-light)]"
              >
                Home
              </Link>
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
