import type { InputHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Input({ label, hint, error, className, id, ...rest }: Props) {
  const inputId = id || rest.name;
  return (
    <label className="flex w-full flex-col gap-1.5 text-left">
      {label ? (
        <span className="text-sm font-semibold text-[#1a1714]">{label}</span>
      ) : null}
      <input
        id={inputId}
        className={cn(
          'h-11 w-full rounded-xl border-2 border-[#c4bba8] bg-[#fffdf9] px-3.5',
          'text-[#1a1714] caret-[#1a1714]',
          'placeholder:text-[#6b6358]',
          'shadow-[inset_0_1px_2px_rgba(26,23,20,0.04)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/35 focus:border-[var(--accent)]',
          'transition-colors duration-150',
          'disabled:cursor-not-allowed disabled:bg-[#efece6] disabled:text-[#6b6358]',
          error && 'border-[var(--danger)] focus:ring-[var(--danger)]/30',
          className,
        )}
        {...rest}
      />
      {error ? (
        <span className="text-xs font-medium text-[var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[#5c574f]">{hint}</span>
      ) : null}
    </label>
  );
}
