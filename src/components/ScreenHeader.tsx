import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';

export function ScreenHeader({ title, right, back }: { title: string; right?: ReactNode; back?: 'back' | 'close' }) {
  const navigate = useNavigate();
  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between px-3 py-2 safe-top"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
    >
      <button
        className="tap-target flex items-center justify-center"
        style={{ color: 'var(--fg)' }}
        onClick={() => navigate(-1)}
        aria-label={back === 'close' ? 'Close' : 'Back'}
      >
        {back === 'close' ? <X size={20} strokeWidth={1.75} /> : <ArrowLeft size={20} strokeWidth={1.75} />}
      </button>
      <h1 className="text-base font-semibold truncate px-2">{title}</h1>
      <div className="min-w-[44px] flex justify-end">{right}</div>
    </div>
  );
}
