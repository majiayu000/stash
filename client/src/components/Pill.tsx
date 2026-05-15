import type { ReactNode } from 'react';

export function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  const toneClass = tone ? `pill-status-${tone}` : '';
  return <span className={`pill ${toneClass}`}>{children}</span>;
}
