export const skillsSettingsStyles = `
.sk-bar {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl, 16px);
  margin-bottom: 1.25rem;
}
.sk-search {
  display: flex; align-items: center; gap: 0.65rem;
  padding: 0.55rem 0.9rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 20px rgba(0,255,242,0.04);
}
.sk-tabs { display: flex; gap: 0.35rem; }
.sk-tab {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
  white-space: nowrap;
}
.sk-tab span {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}
.sk-tab:hover { border-color: var(--border-glow); color: var(--text-primary); }
.sk-tab.active { background: var(--gradient-primary); color: var(--bg-void); border-color: transparent; font-weight: 600; }
.sk-tab.active span { background: rgba(0,0,0,0.2); color: var(--bg-void); }

.sk-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.85rem; }
.sk-card {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1rem;
  cursor: pointer;
  text-align: left;
  display: flex; flex-direction: column;
  transition: all var(--transition-base, 0.25s);
  position: relative;
  overflow: hidden;
}
.sk-card:hover { border-color: var(--border-glow); transform: translateY(-3px); box-shadow: var(--shadow-card, 0 20px 40px rgba(0,0,0,0.4)); }
.sk-card.sel {
  border-color: var(--neon-cyan);
  background: linear-gradient(135deg, rgba(0,255,242,0.06), var(--bg-glass) 30%);
  box-shadow: 0 0 25px rgba(0,255,242,0.15);
}
.sk-card.uninstalled { opacity: 0.6; }
.sk-card.uninstalled:hover { opacity: 1; }

.sk-card-name { font-family: var(--font-mono); font-size: 0.95rem; font-weight: 600; color: var(--neon-cyan); text-shadow: 0 0 14px rgba(0,255,242,0.3); }
.sk-card-source { font-family: var(--font-mono); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; font-weight: 600; }
.sk-card-stars {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--neon-orange);
  font-weight: 600;
  padding: 2px 7px;
  background: rgba(255,159,10,0.1);
  border: 1px solid rgba(255,159,10,0.2);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.sk-card-desc {
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.55;
  margin-bottom: 0.7rem;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sk-card-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border-hair);
}
.sk-installed { font-family: var(--font-mono); font-size: 0.7rem; color: var(--neon-green); font-weight: 600; }
.sk-uninstalled { font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); }
.sk-bindings { display: flex; align-items: center; gap: 3px; }
.sk-binding-emoji { font-size: 0.95rem; opacity: 0.9; }

.sk-official {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--neon-green), var(--neon-cyan));
  color: var(--bg-void);
  font-size: 0.6rem;
  font-weight: 700;
  box-shadow: 0 0 8px rgba(48,209,88,0.5);
}

.sk-detail-head {
  background: linear-gradient(135deg, rgba(0,255,242,0.06), rgba(191,90,242,0.03));
  border: 1px solid rgba(0,255,242,0.2);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  position: relative;
  overflow: hidden;
}
.sk-detail-head::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--gradient-primary); }

.sk-binding-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.6rem;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast, 0.2s);
}
.sk-binding-row:hover { border-color: var(--border-glow); }

.install-cmd {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
.install-prefix { color: var(--neon-cyan); font-weight: 700; }
.install-text { color: var(--text-primary); flex: 1; }
.copy-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border-hair);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.copy-btn:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }

.sk-status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}
.sk-status-card {
  min-width: 0;
  padding: 0.55rem 0.6rem;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
}
.sk-status-card span {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sk-status-card strong {
  display: block;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sk-status-card em {
  display: block;
  margin-top: 0.2rem;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 0.68rem;
  font-style: normal;
  line-height: 1.35;
}

.sk-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(0,0,0,0.58);
  backdrop-filter: blur(10px);
}
.sk-dialog {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card, 0 24px 60px rgba(0,0,0,0.45));
}
.sk-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.sk-dialog-title {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  color: var(--neon-cyan);
}
.sk-dialog-sub {
  margin-top: 0.2rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
}
.sk-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.sk-icon-btn:hover { border-color: var(--neon-cyan); color: var(--neon-cyan); }
.sk-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}
.sk-field span {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sk-field input,
.sk-field textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  outline: none;
  padding: 0.58rem 0.7rem;
}
.sk-field textarea {
  min-height: 86px;
  resize: vertical;
  line-height: 1.5;
}
.sk-field input:focus,
.sk-field textarea:focus {
  border-color: var(--neon-cyan);
  box-shadow: 0 0 0 2px rgba(0,255,242,0.12);
}
.sk-field-row {
  display: grid;
  grid-template-columns: 1fr 88px;
  gap: 0.75rem;
}
.sk-emoji-field input {
  text-align: center;
  font-size: 1.1rem;
}
.sk-dialog-error {
  padding: 0.6rem 0.7rem;
  background: rgba(255,45,85,0.1);
  border: 1px solid rgba(255,45,85,0.35);
  border-radius: var(--radius-sm);
  color: var(--neon-pink);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}
.sk-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.np-btn.danger {
  border-color: rgba(255,45,85,0.55);
  color: var(--neon-pink);
}
.sk-confirm-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-void);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  color: var(--text-primary);
}
.sk-confirm-card > span {
  font-size: 1.55rem;
  line-height: 1;
}
.sk-confirm-card code {
  display: block;
  margin-top: 0.2rem;
  color: var(--text-muted);
  font-size: 0.72rem;
}
.sk-notice {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: min(380px, calc(100vw - 2.5rem));
  padding: 0.75rem 0.9rem;
  background: var(--bg-elevated);
  border: 1px solid rgba(48,209,88,0.45);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  box-shadow: var(--shadow-card, 0 20px 50px rgba(0,0,0,0.35));
  font-family: var(--font-mono);
  font-size: 0.78rem;
}
.sk-notice.error { border-color: rgba(255,45,85,0.55); color: var(--neon-pink); }
.sk-notice button {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

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
.kw-skill-toggle.on .kw-skill-toggle-knob { background: var(--bg-void); left: 13px; }
`;
