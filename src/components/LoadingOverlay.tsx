import { Loader2 } from 'lucide-react';

export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      role="status"
      aria-live="polite"
    >
      <Loader2 size={36} strokeWidth={2} className="animate-spin" color="white" />
      {message && <p className="text-sm font-medium px-6 text-center text-white">{message}</p>}
    </div>
  );
}
