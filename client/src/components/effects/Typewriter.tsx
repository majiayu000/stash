import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

export interface TypewriterProps {
  phrases: string[];
  speed?: number;
  pause?: number;
  cursor?: boolean;
  className?: string;
}

export function Typewriter({
  phrases,
  speed = 60,
  pause = 1400,
  cursor = true,
  className = '',
}: TypewriterProps) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'type' | 'hold' | 'erase'>('type');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (phrases.length === 0) return;
    if (reducedMotion) {
      setText(phrases[0] ?? '');
      return;
    }
    const full = phrases[idx % phrases.length]!;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'type') {
      if (text.length < full.length) {
        t = setTimeout(() => setText(full.slice(0, text.length + 1)), speed);
      } else {
        t = setTimeout(() => setPhase('hold'), pause);
      }
    } else if (phase === 'hold') {
      t = setTimeout(() => setPhase('erase'), pause);
    } else {
      if (text.length > 0) {
        t = setTimeout(() => setText(text.slice(0, -1)), speed / 2);
      } else {
        setPhase('type');
        setIdx((i) => i + 1);
        return;
      }
    }
    return () => clearTimeout(t);
  }, [text, phase, idx, phrases, speed, pause, reducedMotion]);

  return (
    <span className={className}>
      {text}
      {cursor ? <span className="tw-cursor">▎</span> : null}
    </span>
  );
}
