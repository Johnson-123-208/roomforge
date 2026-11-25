import { X } from 'lucide-react';
import type { Toast as ToastType } from '../../hooks/useToast';
import { cn } from '../../utils/cn';

type Props = {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
};

export function ToastViewport({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md',
            'border-[var(--border)] bg-white text-[var(--text-light)]',
            t.tone === 'success' && 'border-[var(--success)]/40',
            t.tone === 'error' && 'border-[var(--danger)]/40',
          )}
        >
          <p className="flex-1 text-sm leading-snug text-[var(--text-light)]">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-[var(--text-light-muted)] hover:text-[var(--text-light)]"
            onClick={() => onDismiss(t.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
