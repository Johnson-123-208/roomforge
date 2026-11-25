import { cn } from '../../utils/cn';

type Props = {
  className?: string;
  compact?: boolean;
  /** Use on dark meeting chrome */
  light?: boolean;
};

export function Logo({ className, compact, light }: Props) {
  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <img
        src="/logo.svg"
        alt="RoomForge"
        className={cn(
          'rounded-xl object-cover shadow-sm ring-1 ring-[var(--accent)]/30',
          compact ? 'h-9 w-9' : 'h-11 w-11',
        )}
      />
      {!compact ? (
        <div className="leading-tight">
          <div
            className={cn(
              'font-[family-name:var(--font-display)] text-lg tracking-tight',
              light ? 'text-white' : 'text-[var(--text-light)]',
            )}
          >
            RoomForge
          </div>
          <div
            className={cn(
              'text-[10px] tracking-[0.18em] uppercase',
              light ? 'text-[var(--accent)]' : 'text-[var(--accent-deep)]',
            )}
          >
            Video Rooms
          </div>
        </div>
      ) : null}
    </div>
  );
}
