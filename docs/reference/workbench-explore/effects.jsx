// effects.jsx — reactbits-inspired effects, neon/cyber tuned.
// All effects use React hooks, no external deps. Tuned to the
// Claude Skills Registry design system (cyan/purple/magenta neons).

const { useEffect, useState, useRef, useCallback, useMemo } = React;

// ─── Typewriter ───────────────────────────────────────────────────────────
// Cycles through phrases, types them out char-by-char, holds, then erases.
function Typewriter({ phrases, speed = 60, pause = 1400, className = '', cursor = true }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('type'); // type | hold | erase
  useEffect(() => {
    const full = phrases[idx % phrases.length];
    let t;
    if (phase === 'type') {
      if (text.length < full.length) t = setTimeout(() => setText(full.slice(0, text.length + 1)), speed);
      else t = setTimeout(() => setPhase('hold'), pause);
    } else if (phase === 'hold') {
      t = setTimeout(() => setPhase('erase'), pause);
    } else {
      if (text.length > 0) t = setTimeout(() => setText(text.slice(0, -1)), speed / 2);
      else { setPhase('type'); setIdx(i => i + 1); }
    }
    return () => clearTimeout(t);
  }, [text, phase, idx, phrases, speed, pause]);
  return (
    <span className={className}>
      {text}
      {cursor && <span className="tw-cursor">▎</span>}
    </span>
  );
}

// ─── ShinyText ────────────────────────────────────────────────────────────
// Gradient sweep across text — neon-cyan/purple highlight on dim base.
function ShinyText({ children, className = '', speed = 4 }) {
  return (
    <span className={`shiny-text ${className}`} style={{ animationDuration: `${speed}s` }}>
      {children}
    </span>
  );
}

// ─── CountUp ──────────────────────────────────────────────────────────────
// Animated counter. Eases to value over `duration` ms.
function CountUp({ to, duration = 1200, format = (n) => Math.round(n).toLocaleString(), className = '' }) {
  const [val, setVal] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    let raf;
    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts;
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

// ─── ClickSpark ───────────────────────────────────────────────────────────
// Emits a burst of neon sparks on click anywhere inside its wrapper.
function ClickSpark({ children, colors = ['#00fff2', '#bf5af2', '#ff00ff'], count = 10 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onClick = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = 'click-spark';
        const ang = (Math.PI * 2 * i) / count;
        const dist = 30 + Math.random() * 30;
        const c = colors[i % colors.length];
        s.style.setProperty('--x', x + 'px');
        s.style.setProperty('--y', y + 'px');
        s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        s.style.setProperty('--c', c);
        el.appendChild(s);
        setTimeout(() => s.remove(), 700);
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, []);
  return <div ref={ref} className="click-spark-host">{children}</div>;
}

// ─── CursorGlow ───────────────────────────────────────────────────────────
// Soft neon halo that follows the cursor inside its wrapper.
function CursorGlow({ children, color = 'rgba(0,255,242,0.18)', size = 240 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    };
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, []);
  return (
    <div
      ref={ref}
      className="cursor-glow-host"
      style={{
        '--cg-color': color,
        '--cg-size': size + 'px',
      }}
    >
      {children}
    </div>
  );
}

// ─── TiltCard ─────────────────────────────────────────────────────────────
// 3D mouse-follow tilt. Children get translateY-on-hover too.
function TiltCard({ children, max = 8, className = '', style }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * max * 2;
    const ry = (px - 0.5) * max * 2;
    el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.transform = '';
  };
  return (
    <div
      ref={ref}
      className={`tilt-card ${className}`}
      style={style}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
    </div>
  );
}

// ─── ParticleField ────────────────────────────────────────────────────────
// Canvas particle field — drifting neon points connecting with thin lines.
function ParticleField({ density = 0.00007, color = '0, 255, 242', maxLink = 110 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, dpr, particles, raf;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(w * h * density);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: 0.6 + Math.random() * 1.3,
      }));
    };
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.fillStyle = `rgba(${color},0.7)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < maxLink) {
            ctx.strokeStyle = `rgba(${color},${0.18 * (1 - d / maxLink)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    resize();
    tick();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [density, color, maxLink]);
  return <canvas ref={ref} className="particle-field" />;
}

// ─── SplitText / BlurText (entry reveal) ──────────────────────────────────
// Splits text into chars or words, fades each in with a slight blur+rise.
function BlurText({ children, delay = 0, stagger = 30, unit = 'word', className = '' }) {
  const parts = unit === 'char' ? children.split('') : children.split(' ');
  return (
    <span className={`blur-text ${className}`}>
      {parts.map((p, i) => (
        <span key={i} className="bt-part" style={{ animationDelay: (delay + i * stagger) + 'ms' }}>
          {p}{unit === 'word' && i < parts.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </span>
  );
}

// ─── LiveDot ──────────────────────────────────────────────────────────────
// Pulsing dot for "live" / "active" indicators.
function LiveDot({ color = 'var(--neon-green)' }) {
  return <span className="live-dot" style={{ '--ld-color': color }} />;
}

// ─── MagnetLines ──────────────────────────────────────────────────────────
// Grid of short lines that point toward the cursor.
function MagnetLines({ rows = 9, cols = 16, color = 'rgba(0,255,242,0.25)' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      el.querySelectorAll('.mag-line').forEach(line => {
        const lr = line.getBoundingClientRect();
        const cx = lr.left - r.left + lr.width / 2;
        const cy = lr.top - r.top + lr.height / 2;
        const ang = Math.atan2(my - cy, mx - cx) * 180 / Math.PI;
        line.style.transform = `rotate(${ang}deg)`;
      });
    };
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, []);
  return (
    <div ref={ref} className="magnet-lines" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: rows * cols }).map((_, i) => (
        <div key={i} className="mag-cell"><div className="mag-line" style={{ background: color }} /></div>
      ))}
    </div>
  );
}

Object.assign(window, {
  Typewriter, ShinyText, CountUp, ClickSpark,
  CursorGlow, TiltCard, ParticleField, BlurText, LiveDot, MagnetLines,
});
