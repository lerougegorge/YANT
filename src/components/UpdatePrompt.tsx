import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const { needRefresh, updateServiceWorker } = useRegisterSW();

  if (!needRefresh[0]) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center pt-2 px-4 safe-top">
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-2.5 shadow-lg text-sm"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--fg)' }}
      >
        <span>Update available</span>
        <button className="font-semibold" style={{ color: '#16a34a' }} onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
      </div>
    </div>
  );
}
