import { useCallback, useState } from 'react';

export type Toast = {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'error';
};

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = `t-${++toastId}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
