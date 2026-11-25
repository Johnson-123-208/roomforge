import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
};

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-[#111111] hover:bg-[var(--accent-hover)] shadow-sm shadow-[var(--accent)]/25',
  secondary:
    'bg-[var(--surface)] text-[var(--text-light)] border border-[var(--border)] hover:bg-[var(--surface-hover)]',
  ghost:
    'bg-transparent text-[var(--text-light-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-light)]',
  danger: 'bg-[var(--danger)] text-white hover:brightness-110',
  success: 'bg-[var(--success)] text-white hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  icon,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ivory)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
