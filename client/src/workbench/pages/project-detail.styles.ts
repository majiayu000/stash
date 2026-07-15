export 
const projectDetailStyles = `
.kw-hero {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.4rem 1.6rem;
  position: relative;
  overflow: hidden;
}
.kw-hero::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--gradient-primary);
}
.kw-hero-row { display: flex; align-items: flex-start; gap: 1rem; }
.kw-hero-identity {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  flex: 1;
  min-width: 0;
}
.kw-hero-icon {
  font-size: 3.2rem;
  filter: drop-shadow(0 0 20px var(--neon-cyan));
  animation: pulse 3s ease-in-out infinite;
  flex-shrink: 0;
  line-height: 1;
}
.kw-hero-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}
.kw-hero-stats {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 1rem;
  margin-top: 1.25rem;
}
.kw-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 1.25rem;
  flex: 1;
  min-height: 0;
  margin-top: 1.25rem;
}
.kw-main-left,
.kw-main-right {
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.kw-main-left { padding-right: 0.25rem; }
.kw-crumb {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
  overflow-wrap: anywhere;
}
.kw-crumb-link {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;
  padding: 0;
}
.kw-crumb-link:hover,
.kw-crumb-link:focus-visible {
  color: var(--neon-cyan);
  outline: none;
}
.kw-name {
  font-family: var(--font-mono);
  font-size: 2.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--neon-cyan);
  text-shadow: 0 0 24px rgba(0,255,242,0.4);
  line-height: 1.1;
  margin: 0;
  overflow-wrap: anywhere;
}
.sd-action {
  padding: 0.45rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
}
.sd-action:hover { border-color: var(--border-glow); color: var(--neon-cyan); }
.sd-action:disabled {
  cursor: default;
  opacity: 0.45;
}
.sd-action:disabled:hover {
  border-color: var(--border-hair);
  color: var(--text-secondary);
}
.link-button {
  background: transparent;
  border: 0;
  color: var(--neon-cyan);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 0;
}
.link-button:hover { color: var(--text-primary); }

.kw-intent {
  background: linear-gradient(135deg, rgba(0,255,242,0.05), rgba(191,90,242,0.03));
  border-color: rgba(0,255,242,0.2);
}
.kw-intent p { color: var(--text-primary); }

.kw-ms { display: flex; flex-direction: column; }
.kw-ms-row {
  position: relative;
  display: grid; grid-template-columns: 24px 1fr; gap: 0.85rem;
  padding-bottom: 1rem;
}
.kw-ms-row:last-child { padding-bottom: 0; }
.kw-ms-dot {
  width: 14px; height: 14px;
  border-radius: 50%;
  margin-left: 5px;
  margin-top: 4px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.kw-ms-line {
  position: absolute;
  left: 11px;
  top: 22px;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, var(--border-subtle), transparent);
}
.kw-ms-head {
  display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
.kw-ms-name { font-weight: 600; color: var(--text-primary); }
.kw-ms-date { color: var(--text-muted); font-size: 0.72rem; }
.kw-ms-pct { margin-left: auto; font-weight: 600; font-size: 0.78rem; }

.kw-dec {
  padding: 0.75rem 0.9rem;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-purple);
  border-radius: var(--radius-md);
}
.kw-dec-head { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 5px; }
.kw-dec-date {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--neon-purple);
  font-weight: 600;
  background: rgba(191,90,242,0.08);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.kw-dec-title {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  color: var(--text-primary);
  font-weight: 600;
  flex: 1;
}
.kw-dec-body {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.kw-tag {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--neon-purple);
  background: rgba(191,90,242,0.06);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(191,90,242,0.15);
}

.kw-notes {
  padding: 0.85rem 1rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 25px rgba(0,255,242,0.03);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.7;
  max-height: 360px;
  overflow-y: auto;
}
.md-body { color: var(--text-secondary); }
.md-h1 {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  color: var(--neon-cyan);
  text-shadow: 0 0 12px rgba(0,255,242,0.4);
  margin: 0.5rem 0 0.4rem;
}
.md-h1:first-child { margin-top: 0; }
.md-h2 {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--neon-purple);
  margin: 0.7rem 0 0.3rem;
}
.md-p { margin: 0 0 0.4rem; color: var(--text-secondary); }
.md-ul { margin: 0 0 0.5rem; padding-left: 1.25rem; list-style: none; }
.md-ul li { position: relative; padding-left: 0.4rem; margin-bottom: 0.15rem; color: var(--text-secondary); }
.md-ul li::before { content: '·'; color: var(--neon-cyan); position: absolute; left: -0.7rem; font-weight: 700; }
.md-code {
  font-family: var(--font-mono);
  color: var(--neon-green);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.76rem;
}

.kw-lessons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.kw-lesson {
  padding: 0.75rem 0.85rem;
  background: linear-gradient(135deg, rgba(191,90,242,0.04), rgba(255,255,255,0.02));
  border: 1px solid rgba(191,90,242,0.15);
  border-radius: var(--radius-md);
}

.kw-skill {
  display: grid;
  grid-template-columns: 22px 1fr 32px;
  gap: 0.55rem;
  align-items: center;
  padding: 0.5rem 0.6rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
}
.kw-skill:hover { border-color: var(--border-glow); transform: translateX(2px); }
.kw-skill-toggle {
  width: 28px; height: 16px;
  background: var(--bg-elevated);
  border-radius: 8px;
  position: relative;
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
  transition: all var(--transition-fast, 0.2s);
}
.kw-skill-toggle.on {
  background: var(--gradient-primary);
  border-color: transparent;
  box-shadow: 0 0 10px rgba(0,255,242,0.4);
}
.kw-skill-toggle-knob {
  position: absolute;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--text-secondary);
  top: 1px; left: 1px;
  transition: all var(--transition-fast, 0.2s);
}
.kw-skill-toggle.on .kw-skill-toggle-knob {
  background: var(--bg-void);
  left: 13px;
}

@media (max-width: 760px) {
  .kw-hero {
    padding: 1rem;
  }
  .kw-hero-row {
    flex-direction: column;
  }
  .kw-hero-identity {
    width: 100%;
    gap: 0.75rem;
  }
  .kw-hero-icon {
    font-size: 2.2rem;
    filter: drop-shadow(0 0 12px var(--neon-cyan));
  }
  .kw-name {
    font-size: 1.35rem;
    line-height: 1.18;
    text-shadow: none;
  }
  .kw-hero-actions {
    width: 100%;
    overflow-x: auto;
    justify-content: flex-start;
    padding-bottom: 0.15rem;
  }
  .kw-hero-actions .sd-action {
    white-space: nowrap;
  }
  .kw-hero-stats,
  .kw-main-grid,
  .kw-lessons {
    grid-template-columns: 1fr;
  }
  .kw-main-grid {
    min-height: auto;
  }
  .kw-main-left,
  .kw-main-right {
    overflow: visible;
    padding-right: 0;
  }
}
`;
