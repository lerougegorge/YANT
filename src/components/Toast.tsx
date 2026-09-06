import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, action?: ToastAction, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, action?: ToastAction, durationMs = 5000) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 pb-24 px-4 pointer-events-none safe-bottom">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--fg)' }}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="font-semibold text-brand-600 dark:text-brand-500"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
