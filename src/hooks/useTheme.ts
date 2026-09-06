import { useEffect } from 'react';
import { useSettings } from './useSettings';

export function useTheme(): void {
  const settings = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    function apply() {
      const resolved = settings.theme === 'system' ? (mql.matches ? 'dark' : 'light') : settings.theme;
      root.dataset.theme = resolved;
    }

    apply();
    if (settings.theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
  }, [settings.theme]);
}
