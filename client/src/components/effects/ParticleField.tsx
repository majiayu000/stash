import { useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

export interface ParticleFieldProps {
  /** Particles per pixel. 0.00007 ≈ 60 on a 1000×1000 panel. */
  density?: number;
  /** RGB triplet string, e.g. '0, 255, 242'. */
  color?: string;
  /** Max distance to draw a connecting line. */
  maxLink?: number;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function ParticleField({
  density = 0.00007,
  color = '0, 255, 242',
  maxLink = 110,
  className = '',
}: ParticleFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0,
      h = 0,
      dpr = 1,
      raf = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(8, Math.round(w * h * density));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 0.6 + Math.random() * 1.3,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (!reducedMotion) {
          p.x += p.vx;
          p.y += p.vy;
        }
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.fillStyle = `rgba(${color},0.7)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]!;
          const b = particles[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < maxLink) {
            ctx.strokeStyle = `rgba(${color},${0.18 * (1 - d / maxLink)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    };

    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };

    resize();
    draw();
    if (!reducedMotion) tick();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, color, maxLink, reducedMotion]);

  return <canvas ref={ref} className={`particle-field ${className}`} aria-hidden />;
}
