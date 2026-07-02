export const conceptEStyles = `
.concept-e-home {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 7rem);
  overflow: visible;
}
.ce-topbar-stats .tb-stat:nth-child(1) .tb-stat-val { color: var(--semantic-inbox); }
.ce-topbar-stats .tb-stat:nth-child(2) .tb-stat-val { color: var(--semantic-due); }
.ce-topbar-stats .tb-stat:nth-child(3) .tb-stat-val { color: var(--semantic-priority-high); }
.ce-topbar-stats .tb-stat:nth-child(4) .tb-stat-val { color: var(--text-primary); }
.ce-insights {
  margin-top: 0.85rem;
  border-top: 1px solid var(--border-hair);
  padding-top: 0.55rem;
}
.ce-insights-summary {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--semantic-muted-readable);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ce-insights-summary::before {
  content: '+';
  color: var(--semantic-inbox);
  font-weight: 700;
  margin-right: 0.5rem;
}
.ce-insights.open .ce-insights-summary::before { content: '-'; }
.ce-insights-summary span:first-child {
  margin-right: auto;
}
.ce-insights-summary span:last-child {
  color: var(--text-muted);
  text-transform: none;
  letter-spacing: 0;
}
.ce-insights .connected-flow {
  margin: 0.75rem 0 0;
}
.capture-hero {
  position: relative;
  background: linear-gradient(135deg, rgba(191,90,242,0.08), rgba(0,255,242,0.05));
  border: 1px solid rgba(191,90,242,0.25);
  border-radius: var(--radius-xl, 16px);
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(191,90,242,0.06);
}
.capture-hero::before {
  content: '';
  position: absolute; inset: -2px;
  background: linear-gradient(90deg, var(--neon-purple), var(--neon-cyan), var(--neon-magenta), var(--neon-purple));
  background-size: 300% 100%;
  border-radius: var(--radius-xl, 16px);
  z-index: -1;
  opacity: 0.5;
  animation: borderFlow 5s linear infinite;
  filter: blur(6px);
}
@keyframes borderFlow {
  0% { background-position: 0% 0; }
  100% { background-position: 300% 0; }
}
.capture-hero-inner { position: relative; z-index: 1; }
.capture-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 30px rgba(0,255,242,0.04);
}
.capture-prompt {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  font-weight: 700;
  font-size: 1.1rem;
  text-shadow: 0 0 10px rgba(0,255,242,0.6);
}
.capture-input { flex: 1; min-width: 0; position: relative; }
.capture-real-input {
  width: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--text-primary);
  caret-color: var(--neon-cyan);
}
.capture-placeholder {
  position: absolute; inset: 0;
  pointer-events: none;
  display: flex; align-items: center;
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--semantic-muted-readable);
}
.capture-kbd-btn {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-primary);
  padding: 4px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-glow);
  border-radius: 4px;
  cursor: pointer;
  transition: all .15s;
}
.capture-kbd-btn:hover:not(:disabled) {
  background: var(--neon-cyan);
  color: var(--bg-void);
  box-shadow: 0 0 16px rgba(0,255,242,0.4);
}
.capture-kbd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.capture-hints {
  display: flex; gap: 1rem; align-items: center;
  margin-top: 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.capture-hints kbd {
  font-family: var(--font-mono);
  color: var(--neon-purple);
  background: rgba(191,90,242,0.08);
  border: 1px solid rgba(191,90,242,0.2);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.7rem;
  margin-right: 4px;
}

.ce-feedback {
  margin: -0.55rem 0 0.75rem;
  border: 1px solid rgba(48,209,88,0.32);
  background: rgba(48,209,88,0.08);
  color: var(--neon-green);
  border-radius: var(--radius-md);
  padding: 0.45rem 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.ce-feedback.error {
  border-color: rgba(255,55,95,0.35);
  background: rgba(255,55,95,0.08);
  color: var(--neon-pink);
}

.board-col {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 0.85rem;
  display: flex; flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.board-col::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
.board-col::before { background: var(--board-accent); }
.board-col.tone-inbox { --board-accent: var(--semantic-inbox); }
.board-col.tone-due { --board-accent: var(--semantic-due); }
.board-col.tone-active { --board-accent: var(--semantic-active); }
.board-col.tone-someday { --board-accent: var(--semantic-someday); }
.board-col.drag-over {
  outline: 2px dashed var(--neon-cyan);
  outline-offset: -2px;
  background: rgba(0,255,242,0.05);
}
.board-col-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px; }
.board-col-name {
  font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;
  color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em;
}
.board-col.tone-inbox .board-col-name { color: var(--semantic-inbox); }
.board-col.tone-due .board-col-name { color: var(--semantic-due); }
.board-col.tone-active .board-col-name { color: var(--semantic-active); }
.board-col.tone-someday .board-col-name { color: var(--semantic-someday); }
.board-col-count {
  margin-left: auto;
  font-family: var(--font-mono); font-size: 0.7rem; color: var(--semantic-muted-readable);
  background: var(--bg-elevated); padding: 1px 7px; border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}
.board-col-hint {
  font-family: var(--font-body); font-size: 0.72rem; color: var(--semantic-muted-readable);
  margin-bottom: 0.7rem;
}
.board-col-body { display: flex; flex-direction: column; gap: 0.4rem; overflow-y: auto; flex: 1; padding-right: 2px; }
.board-col-empty {
  text-align: center;
  font-family: var(--font-mono); font-size: 0.72rem;
  color: var(--text-muted); padding: 1rem 0; opacity: 0.5;
}
.todo-add {
  background: transparent; border: 1px dashed var(--border-subtle);
  color: var(--text-muted); padding: 0.45rem 0.6rem; border-radius: var(--radius-md);
  font-family: var(--font-mono); font-size: 0.72rem; cursor: pointer;
  transition: all 0.2s; text-align: left;
}
.todo-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); background: rgba(0,255,242,0.04); }

.done-drop-zone {
  border: 1px solid rgba(48,209,88,0.28);
  background: rgba(48,209,88,0.06);
  border-radius: var(--radius-lg);
  padding: 0.85rem;
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}
.done-drop-zone.drag-over {
  border-color: var(--neon-green);
  background: rgba(48,209,88,0.12);
  box-shadow: 0 0 0 1px rgba(48,209,88,0.12), 0 14px 32px rgba(48,209,88,0.1);
}
.done-drop-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-family: var(--font-mono);
  color: var(--neon-green);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.78rem;
  font-weight: 700;
}
.done-drop-copy {
  margin-top: 0.35rem;
  color: var(--text-muted);
  font-size: 0.74rem;
  line-height: 1.45;
}
.done-drop-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.7rem;
  max-height: 170px;
  overflow-y: auto;
}

.new-proj-btn {
  background: var(--gradient-primary);
  color: var(--bg-void); border: none;
  padding: 0.4rem 0.9rem; border-radius: var(--radius-pill);
  font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 0 15px rgba(0,255,242,0.3);
}
.new-proj-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,255,242,0.4); }

.live-session-link {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.live-session-link:hover { color: var(--text-secondary); }

.proj-chip {
  display: flex; align-items: flex-start; gap: 0.6rem;
  width: 100%;
  text-align: left;
  padding: 0.55rem 0.7rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  cursor: pointer; transition: all 0.2s;
}
.proj-chip:hover { border-color: var(--border-glow); transform: translateX(2px); }
`;
