export const conceptEDragStyles = `
.board-stage {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 0;
}
.board-col.invalid-over {
  outline-color: var(--neon-pink);
  background: rgba(255, 45, 85, 0.05);
}
.done-drop-zone {
  min-height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.85rem;
  background: rgba(48, 209, 88, 0.045);
  border: 1px dashed rgba(48, 209, 88, 0.28);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  opacity: 0.72;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, opacity 0.2s;
}
.done-drop-zone.active {
  opacity: 1;
  border-color: rgba(48, 209, 88, 0.52);
  color: var(--text-primary);
}
.done-drop-zone.drag-over {
  background: rgba(48, 209, 88, 0.12);
  border-color: var(--neon-green);
  box-shadow: 0 0 18px rgba(48, 209, 88, 0.18), inset 0 0 18px rgba(48, 209, 88, 0.04);
}
.done-drop-zone.invalid-over {
  background: rgba(255, 45, 85, 0.08);
  border-color: var(--neon-pink);
  box-shadow: 0 0 18px rgba(255, 45, 85, 0.16);
}
.done-drop-icon {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(48, 209, 88, 0.16);
  color: var(--neon-green);
  font-weight: 700;
}
.done-drop-title {
  color: var(--neon-green);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.done-drop-hint {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 0.72rem;
}
.ce-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: min(460px, calc(100vw - 48px));
  padding: 0.75rem 0.9rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  line-height: 1.45;
}
.ce-toast.ok { border-color: rgba(48, 209, 88, 0.55); }
.ce-toast.error { border-color: rgba(255, 45, 85, 0.62); color: var(--neon-pink); }
.ce-toast button {
  margin-left: auto;
  background: rgba(0,255,242,0.08);
  border: 1px solid rgba(0,255,242,0.35);
  border-radius: var(--radius-sm);
  color: var(--neon-cyan);
  cursor: pointer;
  font: inherit;
  padding: 0.25rem 0.6rem;
}
`;
