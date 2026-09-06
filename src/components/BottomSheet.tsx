import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function BottomSheet({
  title,
  onClose,
  children,
  footer
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-md max-h-[85vh] rounded-t-2xl shadow-xl flex flex-col"
        style={{ background: 'var(--bg-elevated)', color: 'var(--fg)' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="relative shrink-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto h-1.5 w-10 rounded-full absolute left-1/2 -translate-x-1/2 top-2" style={{ background: 'var(--border)' }} />
          <h2 className="text-base font-semibold pt-2">{title}</h2>
          <button
            className="tap-target flex items-center justify-center rounded-full"
            style={{ color: 'var(--fg-muted)' }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="shrink-0 px-4 py-3 border-t safe-bottom" style={{ borderColor: 'var(--border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
