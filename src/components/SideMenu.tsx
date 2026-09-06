import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, Menu, Settings as SettingsIcon, X } from 'lucide-react';

const ITEMS = [
  { label: 'Analysis', path: '/analysis', icon: BarChart3 },
  { label: 'Food Library', path: '/foods', icon: BookOpen },
  { label: 'Settings', path: '/settings', icon: SettingsIcon }
];

export function SideMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <button
        className="tap-target flex items-center justify-center"
        style={{ color: 'var(--fg)' }}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={22} strokeWidth={1.75} />
      </button>

      <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <div
          className="absolute inset-0 bg-black/40 transition-opacity duration-200"
          style={{ opacity: open ? 1 : 0 }}
          onClick={() => setOpen(false)}
        />
        <nav
          className="absolute left-0 top-0 h-full w-64 max-w-[80vw] shadow-xl flex flex-col safe-top safe-bottom transition-transform duration-200 ease-out"
          style={{ background: 'var(--bg-elevated)', transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
          aria-label="Main menu"
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--fg-muted)' }}>
              Menu
            </span>
            <button className="tap-target flex items-center justify-center" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex flex-col p-2">
            {ITEMS.map(({ label, path, icon: Icon }) => (
              <button
                key={path}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium tap-target"
                onClick={() => {
                  setOpen(false);
                  navigate(path);
                }}
              >
                <Icon size={20} strokeWidth={1.75} style={{ color: 'var(--fg-muted)' }} />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
}
