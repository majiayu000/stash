/** Styles for the session detail page and its transcript. */
export const sessionDetailStyles = `
.session-detail-inner { overflow: hidden; height: 100%; }
.sd-head {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0.9rem 1.1rem;
  margin-bottom: 1rem;
}
.sd-crumb { display: flex; align-items: center; }
.sd-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-top: 0.4rem;
}
.sd-header-actions { display: flex; gap: 0.4rem; }
.sd-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 1.25rem;
  flex: 1;
  min-height: 0;
}
.sd-sidebar {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  overflow-y: auto;
}
.sd-crumb-link {
  background: transparent;
  border: 0;
  color: var(--neon-cyan);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 0;
}
.sd-crumb-link:disabled {
  cursor: default;
  color: var(--text-muted);
}
.sd-action {
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  white-space: nowrap;
}
.sd-action:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
.sd-action.danger:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.sd-action:disabled,
.sd-side-btn:disabled {
  cursor: default;
  opacity: 0.45;
}
.sd-action:disabled:hover,
.sd-side-btn:disabled:hover {
  border-color: var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-glass);
}
.sd-side-btn {
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  color: var(--text-secondary);
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  text-align: left;
}
.sd-side-btn:hover { border-color: var(--border-glow); color: var(--neon-cyan); background: rgba(0,255,242,0.04); }

.transcript {
  background: var(--bg-void);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  box-shadow: inset 0 0 30px rgba(0,255,242,0.03);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.65;
  display: flex; flex-direction: column; gap: 0.85rem;
}

@media (max-width: 980px) {
  .session-detail-inner {
    height: auto;
    overflow: visible;
  }
  .sd-layout { grid-template-columns: minmax(0, 1fr); }
  .transcript,
  .sd-sidebar { overflow-y: visible !important; }
}

@media (max-width: 720px) {
  .sd-header-row { flex-direction: column; }
  .sd-header-actions { flex-wrap: wrap; }
  .sd-crumb { overflow-x: auto; }
  .transcript { padding: 0.8rem; }
}

.td-turn {
  display: grid; grid-template-columns: 24px 1fr; gap: 0.6rem;
  padding: 0.55rem 0;
  border-left: 2px solid transparent;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
}
.td-turn.thinking { opacity: 0.7; }
.td-turn.thinking .td-turn-body { font-style: italic; color: var(--text-secondary); }
.td-turn.pending { border-left-color: var(--neon-cyan); background: rgba(0,255,242,0.03); }
.td-turn-icon {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.95rem;
  padding-top: 1px;
}
.td-turn-meta {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  margin-bottom: 4px;
  text-transform: lowercase;
}
.td-turn-content { color: var(--text-secondary); }
.td-turn-content p { margin: 0; margin-bottom: 0.4rem; font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; }
.td-turn-content p:last-child { margin-bottom: 0; }
.td-turn-content code {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.8rem;
}
.td-cursor {
  display: inline-block;
  color: var(--neon-cyan);
  animation: blink 1s steps(1) infinite;
}

.td-code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-cyan);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.85rem;
  margin: 0.4rem 0;
  color: var(--neon-green);
  overflow-x: auto;
  white-space: pre;
  line-height: 1.55;
}

.td-tool {
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: rgba(191,90,242,0.03);
  overflow: hidden;
}
.td-tool.open { border-color: rgba(191,90,242,0.25); }
.td-tool-head {
  width: 100%;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
}
.td-tool-head:hover { background: rgba(191,90,242,0.05); }
.td-tool-chevron { color: var(--text-muted); font-size: 0.7rem; }
.td-tool-name { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.62rem; }
.td-tool-fn { color: var(--neon-purple); font-weight: 600; }
.td-tool-arg {
  color: var(--text-primary);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.td-tool-status { margin-left: auto; font-weight: 600; white-space: nowrap; }
.td-tool-body { padding: 0 0.75rem 0.75rem; }

.td-diff {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.td-diff-line { display: grid; grid-template-columns: 18px 38px 1fr; padding: 1px 0; }
.td-diff-line.add { background: rgba(48,209,88,0.07); }
.td-diff-line.rem { background: rgba(255,55,95,0.07); }
.td-diff-gutter { text-align: center; font-weight: 700; }
.td-diff-line.add .td-diff-gutter { color: var(--neon-green); }
.td-diff-line.rem .td-diff-gutter { color: var(--neon-pink); }
.td-diff-line.ctx .td-diff-gutter { color: var(--text-muted); }
.td-diff-n { color: var(--text-muted); text-align: right; padding-right: 8px; }
.td-diff-txt { white-space: pre; color: var(--text-primary); }
.td-diff-line.ctx .td-diff-txt { color: var(--text-secondary); }
`;
