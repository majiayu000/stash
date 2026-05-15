import { useEffect, useState } from 'react';
import { THEMES, getTheme, onThemeChange, setTheme, type ThemeId } from '../lib/theme';

export function ThemeSwitcher() {
  const [active, setActive] = useState<ThemeId>(() => getTheme());

  useEffect(() => onThemeChange(setActive), []);

  return (
    <div
      className="flex items-center gap-1 px-1 py-1 border rounded-md"
      style={{ borderColor: 'var(--border-hair)' }}
      data-testid="theme-switcher"
    >
      {THEMES.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={`switch to ${t.label}`}
            data-testid={`theme-${t.id}`}
            onClick={() => setTheme(t.id)}
            className={
              'w-5 h-5 rounded-full border transition-transform ' +
              (isActive ? 'scale-110 ring-1' : 'opacity-70 hover:opacity-100 hover:scale-105')
            }
            style={{
              background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 50%, ${t.swatch[2]} 100%)`,
              borderColor: isActive ? 'var(--neon-cyan)' : 'var(--border-hair)',
            }}
          />
        );
      })}
    </div>
  );
}
