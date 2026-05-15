import type { CSSProperties } from 'react';

export interface LiveDotProps {
  color?: string;
  className?: string;
}

export function LiveDot({ color, className = '' }: LiveDotProps) {
  const style = color ? ({ ['--ld-color' as string]: color } as CSSProperties) : undefined;
  return <span className={`live-dot ${className}`} style={style} />;
}
