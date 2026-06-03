export interface CountUpProps {
  to: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

export function CountUp({
  to,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: CountUpProps) {
  return <span className={className}>{format(to)}</span>;
}
