import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

export interface CursorGlowProps {
  children: ReactNode;
  color?: string;
  size?: number;
  className?: string;
}

export function CursorGlow({
  children,
  color = 'color-mix(in srgb, var(--neon-cyan) 18%, transparent)',
  size = 240,
  className = '',
}: CursorGlowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, []);

  const style: CSSProperties = {
    ['--cg-color' as string]: color,
    ['--cg-size' as string]: `${size}px`,
  };

  return (
    <div ref={ref} className={`cursor-glow-host ${className}`} style={style}>
      {children}
    </div>
  );
}
