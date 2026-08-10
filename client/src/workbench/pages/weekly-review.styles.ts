/** Styles for the weekly review page. */
export const weeklyReviewStyles = `
.wr-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 1.25rem;
  padding: 0.75rem 1rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}
.wr-nav {
  width: 32px; height: 32px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  font-family: var(--font-mono);
}
.wr-nav:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

.wr-action-msg {
  margin: -0.65rem 0 0.9rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid rgba(48,209,88,0.24);
  border-radius: var(--radius-sm);
  color: var(--neon-green);
  background: rgba(48,209,88,0.06);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.wr-action-msg.error {
  border-color: rgba(255,69,58,0.28);
  color: var(--neon-pink);
  background: rgba(255,69,58,0.06);
}

.wr-summary {
  position: relative;
  background: linear-gradient(135deg, rgba(191,90,242,0.08), rgba(0,255,242,0.04));
  border: 1px solid rgba(191,90,242,0.25);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(191,90,242,0.05);
}
.wr-summary-inner { position: relative; z-index: 1; }
.wr-summary-tag {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border: 1px solid var(--border-hair);
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  margin-left: auto;
}
.wr-narrative { font-family: var(--font-body); font-size: 0.92rem; line-height: 1.65; color: var(--text-primary); }
.wr-narrative p { margin: 0; margin-bottom: 0.55rem; }
.wr-narrative p:last-child { margin-bottom: 0; }
.wr-narrative strong { color: var(--neon-orange); font-weight: 600; }
.wr-narr-pill { display: inline-flex; align-items: center; font-family: var(--font-mono); font-size: 0.8rem; padding: 1px 8px; border-radius: var(--radius-sm); font-weight: 500; }
.wr-narr-pill.cyan   { background: rgba(0,255,242,0.08); color: var(--neon-cyan); border: 1px solid rgba(0,255,242,0.2); }
.wr-narr-pill.purple { background: rgba(191,90,242,0.08); color: var(--neon-purple); border: 1px solid rgba(191,90,242,0.2); }

.wr-kpi {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.85rem;
  position: relative;
  overflow: hidden;
}
.wr-kpi::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--gradient-primary); }
.wr-kpi-label { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.wr-kpi-value { font-family: var(--font-mono); font-size: 1.45rem; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; line-height: 1.1; }
.wr-kpi-wow { font-family: var(--font-mono); font-size: 0.66rem; margin-top: 3px; }

.wr-done-group { padding: 0.7rem 0.85rem; background: rgba(48,209,88,0.03); border: 1px solid rgba(48,209,88,0.15); border-radius: var(--radius-md); }
.wr-done-head { display: flex; align-items: center; gap: 0.5rem; }
.wr-done-item { display: flex; align-items: flex-start; gap: 0.5rem; font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-secondary); padding: 2px 0; background: transparent; border: 0; text-align: left; cursor: pointer; border-radius: var(--radius-sm); }
.wr-done-item:hover { color: var(--text-primary); background: rgba(48,209,88,0.06); }
.wr-done-check { color: var(--neon-green); font-weight: 700; text-shadow: 0 0 8px rgba(48,209,88,0.6); flex-shrink: 0; }
.wr-done-text { line-height: 1.5; }

.wr-feat { padding: 0.75rem 0.85rem; background: var(--bg-glass); border: 1px solid var(--border-hair); border-radius: var(--radius-md); }

.wr-wow-row { padding: 0.55rem 0; border-bottom: 1px solid var(--border-hair); }
.wr-wow-row:last-child { border-bottom: 0; }

.wr-stale-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem 0.5rem;
  padding: 6px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.wr-stale-title {
  min-width: 0;
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  overflow: hidden;
  padding: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wr-stale-title:hover { color: var(--neon-cyan); }
.wr-stale-age {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.62rem;
}
.wr-stale-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.wr-stale-actions button {
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  padding: 2px 6px;
}
.wr-stale-actions button:hover:not(:disabled) { border-color: var(--neon-cyan); color: var(--neon-cyan); }
.wr-stale-actions button:disabled { cursor: progress; opacity: 0.55; }

.wr-nwd {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.6rem 0.7rem;
  display: flex; flex-direction: column; gap: 0.5rem;
  min-height: 130px;
}
.wr-nwd-head { display: flex; justify-content: space-between; gap: 0.4rem; font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; color: var(--neon-cyan); text-transform: uppercase; letter-spacing: 0.1em; padding-bottom: 0.35rem; border-bottom: 1px solid var(--border-hair); }
.wr-nwd-head span { color: var(--text-muted); font-size: 0.62rem; letter-spacing: 0; }
.wr-nwd-empty { color: var(--text-muted); font-family: var(--font-mono); font-size: 0.68rem; padding: 4px 0; }
.wr-nwd-priority { color: var(--neon-orange); flex-shrink: 0; font-size: 0.62rem; text-transform: uppercase; }
.wr-nwd-todo { display: flex; gap: 6px; align-items: flex-start; padding: 5px 6px; background: rgba(255,255,255,0.025); border: 1px solid var(--border-hair); border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; font-family: var(--font-mono); font-size: 0.68rem; text-align: left; }
.wr-nwd-todo:hover { border-color: var(--border-glow); }
`;
