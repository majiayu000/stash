import { useEffect, useRef, useState } from 'react';

export interface CountUpProps {
  to: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

export function CountUp({
  to,
  duration = 1200,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: CountUpProps) {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let raf: number;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const p = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <span className={className}>{format(val)}</span>;
}
