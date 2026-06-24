export 
const conceptLStyles = `
.td-modal {
  width: min(900px, 100%);
  max-height: calc(100% - 2rem);
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl, 16px);
  box-shadow: var(--shadow-deep, 0 25px 50px rgba(0,0,0,0.6)), 0 0 50px rgba(191,90,242,0.15), inset 0 1px 0 rgba(255,255,255,0.06);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.3s var(--ease-smooth, ease);
}
.td-modal-head {
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid var(--border-subtle);
}
.td-close {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  width: 28px; height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.td-close:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.td-modal-title {
  width: 100%;
  background: transparent;
  border: none;
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  padding: 0;
  outline: none;
  text-shadow: 0 0 18px rgba(255,255,255,0.1);
}
.td-modal-title:focus { color: var(--neon-cyan); }
.td-modal-desc {
  width: 100%;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.85rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
  resize: none;
  outline: none;
  min-height: 100px;
  margin-top: 0.4rem;
}

.td-modal-body {
  display: grid;
  grid-template-columns: 1fr 280px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.td-modal-main {
  overflow-y: auto;
  padding: 1.1rem 1.25rem;
  display: flex; flex-direction: column; gap: 1.1rem;
  border-right: 1px solid var(--border-subtle);
}
.td-modal-meta {
  overflow-y: auto;
  padding: 1.1rem 1.1rem;
  display: flex; flex-direction: column; gap: 1rem;
}

.td-section { display: flex; flex-direction: column; gap: 0.5rem; }
.td-section-label {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  display: flex; justify-content: space-between;
}

.td-sub {
  display: flex; align-items: flex-start; gap: 0.55rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.td-sub:hover { border-color: var(--border-glow); }
.td-sub-check {
  width: 16px; height: 16px;
  border: 1.5px solid var(--text-muted);
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 10px;
  display: flex; align-items: center; justify-content: center;
  color: var(--bg-void);
  font-weight: 700;
}
.td-sub.done .td-sub-check {
  background: var(--gradient-success);
  border-color: transparent;
}
.td-sub-text {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-primary);
  line-height: 1.4;
}
.td-sub.done .td-sub-text { color: var(--text-muted); text-decoration: line-through; }
.td-subtask-add {
  background: transparent;
  border: 1px dashed var(--border-subtle);
  color: var(--text-muted);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast, 0.2s);
}
.td-subtask-add:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

.td-tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgba(191,90,242,0.08);
  color: var(--neon-purple);
  border: 1px solid rgba(191,90,242,0.2);
  cursor: pointer;
}
.td-tag-add { background: transparent; color: var(--text-muted); border-style: dashed; border-color: var(--border-subtle); }
.td-lesson { padding: 0.55rem 0.7rem; background: rgba(191,90,242,0.04); border: 1px solid rgba(191,90,242,0.18); border-radius: var(--radius-md); }

.td-linked-sess {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  background: rgba(0,255,242,0.03);
  border: 1px solid rgba(0,255,242,0.15);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.td-linked-sess:hover { border-color: var(--border-glow); }

.td-journal { display: flex; flex-direction: column; gap: 0.4rem; }
.td-journal-entry {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 0.55rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-left: 2px solid var(--neon-purple);
  border-radius: var(--radius-sm);
}
.td-journal-date {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--neon-purple);
  margin-right: 0.6rem;
  font-weight: 600;
}

.td-promote, .td-meta-block, .td-run {
  display: flex; flex-direction: column; gap: 0.4rem;
  padding: 0.85rem 0.9rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.td-promote-btn {
  display: flex; align-items: center; gap: 0.55rem;
  width: 100%;
  padding: 0.55rem 0.7rem;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  text-align: left;
}
.td-promote-btn:hover {
  border-color: var(--border-glow);
  background: rgba(0,255,242,0.05);
  transform: translateX(2px);
}
.td-promote-title { font-family: var(--font-mono); font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }
.td-promote-sub { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); margin-top: 1px; }
.td-promote-chev { font-family: var(--font-mono); font-size: 0.9rem; color: var(--text-muted); }
.td-promote-btn:hover .td-promote-chev { color: var(--neon-cyan); }

.td-meta-row {
  display: grid; grid-template-columns: 75px 1fr auto;
  gap: 0.5rem; align-items: center;
  padding: 0.35rem 0;
  font-family: var(--font-mono);
  font-size: 0.74rem;
}
.td-meta-k { color: var(--text-muted); text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em; }
.td-meta-v { color: var(--text-primary); }
.td-meta-edit { color: var(--text-muted); cursor: pointer; opacity: 0.4; }
.td-meta-row:hover .td-meta-edit { opacity: 1; }

.td-run-btn {
  display: flex; align-items: center; gap: 0.55rem;
  width: 100%;
  padding: 0.7rem 0.85rem;
  background: var(--gradient-primary);
  color: var(--bg-void);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 0 20px rgba(0,255,242,0.3);
  transition: all var(--transition-fast, 0.2s);
}
.td-run-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 30px rgba(0,255,242,0.45); }
.td-run-kbd {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  background: rgba(0,0,0,0.2);
  padding: 1px 6px;
  border-radius: 3px;
}

.td-coach {
  border-color: rgba(0,255,242,0.18);
}
.td-coach .td-section-label select {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--border-hair);
  color: var(--text-secondary);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
}
.td-coach-messages {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: 260px;
  overflow: auto;
}
.td-coach-empty,
.td-coach-error {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
}
.td-coach-error { color: var(--neon-pink); }
.td-coach-message {
  display: grid;
  gap: 0.25rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.025);
}
.td-coach-message > span {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.td-coach-message.assistant { border-left: 2px solid var(--neon-cyan); }
.td-coach-message.summary { border-left: 2px solid var(--neon-purple); }
.td-coach-message p {
  margin: 0;
  white-space: pre-wrap;
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.5;
}
.td-coach-message button,
.td-coach-actions button {
  justify-self: start;
  border: 1px solid var(--border-hair);
  border-radius: 5px;
  background: rgba(0,255,242,0.06);
  color: var(--neon-cyan);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  padding: 4px 8px;
  cursor: pointer;
}
.td-coach textarea {
  min-height: 58px;
  resize: vertical;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  background: rgba(0,0,0,0.16);
  color: var(--text-primary);
  padding: 0.55rem 0.65rem;
  font-family: var(--font-body);
}
.td-coach-actions {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.td-coach-actions button:disabled {
  opacity: 0.45;
  cursor: default;
}

.td-modal-foot {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--border-subtle);
  background: rgba(0,0,0,0.15);
}
.np-btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  border: 1px solid var(--border-subtle);
}
.np-btn.ghost { background: transparent; color: var(--text-secondary); }
.np-btn.ghost:hover { border-color: var(--border-glow); color: var(--neon-cyan); }
.np-btn.ghost.danger:hover { border-color: var(--neon-pink); color: var(--neon-pink); }
.np-btn.primary {
  background: var(--gradient-primary);
  color: var(--bg-void);
  border-color: transparent;
  font-weight: 700;
  box-shadow: 0 0 18px rgba(0,255,242,0.3);
}
.np-btn.primary:hover { transform: translateY(-1px); box-shadow: 0 4px 24px rgba(0,255,242,0.45); }
`;
