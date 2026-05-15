import type { ReactNode } from 'react';

export interface ShinyTextProps {
  children: ReactNode;
  className?: string;
  speed?: number;
}

export function ShinyText({ children, className = '', speed = 4 }: ShinyTextProps) {
  return (
    <span className={`shiny-text ${className}`} style={{ animationDuration: `${speed}s` }}>
      {children}
    </span>
  );
}
