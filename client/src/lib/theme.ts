export const THEMES = [
  { id: 'cyber',     label: 'Cyber neon',  swatch: ['#00fff2', '#bf5af2', '#ff00ff'] },
  { id: 'matrix',    label: 'Matrix',      swatch: ['#00ff66', '#aaff00', '#00b347'] },
  { id: 'synthwave', label: 'Synthwave',   swatch: ['#ff006f', '#a020f0', '#ff5500'] },
  { id: 'amber',     label: 'Amber CRT',   swatch: ['#ffaa00', '#ff7700', '#ffd07a'] },
  { id: 'glacier',   label: 'Glacier',     swatch: ['#0072ce', '#6633cc', '#c026d3'] },
  { id: 'paper',     label: 'Paper',       swatch: ['#0969da', '#8250df', '#1a7f37'] },
  { id: 'mono',      label: 'Mono',        swatch: ['#000000', '#404040', '#909090'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'stash:theme';
const DEFAULT: ThemeId = 'cyber';

function clearThemeClasses() {
  const cls = document.body.classList;
  [...cls].forEach((c) => {
    if (c.startsWith('theme-')) cls.remove(c);
  });
}

export function setTheme(id: ThemeId): void {
  clearThemeClasses();
  if (id !== DEFAULT) document.body.classList.add(`theme-${id}`);
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* no-op */ }
  window.dispatchEvent(new CustomEvent('stash:themechange', { detail: { theme: id } }));
}

export function getTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved as ThemeId;
  } catch { /* no-op */ }
  return DEFAULT;
}

/** Apply persisted theme on app boot. Call once from main.tsx before render. */
export function bootstrapTheme(): void {
  const id = getTheme();
  if (id !== DEFAULT) document.body.classList.add(`theme-${id}`);
}

export function onThemeChange(cb: (theme: ThemeId) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<{ theme: ThemeId }>).detail.theme);
  window.addEventListener('stash:themechange', handler);
  return () => window.removeEventListener('stash:themechange', handler);
}
