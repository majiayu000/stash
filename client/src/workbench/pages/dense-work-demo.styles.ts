export const denseWorkDemoStyles = `
.now-first {
  --nf-paper: #f1efe8;
  --nf-sheet: #fbfaf6;
  --nf-ink: #18201d;
  --nf-ink-soft: #35413c;
  --nf-muted: #68716d;
  --nf-faint: #969c98;
  --nf-line: #d8d6ce;
  --nf-line-dark: #bdbbb3;
  --nf-accent: #dd4a2f;
  --nf-accent-dark: #ad321f;
  --nf-accent-soft: #fae8df;
  --nf-green: #315e4a;
  --nf-green-soft: #e4eee7;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  color: var(--nf-ink);
  background: var(--nf-paper);
  color-scheme: light;
  font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
}
.now-first *, .now-first *::before, .now-first *::after { box-sizing: border-box; }
.now-first button, .now-first input { font-family: inherit; }
.nf-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.42;
  background:
    radial-gradient(circle at 18% 8%, rgba(255,255,255,0.9), transparent 31rem),
    radial-gradient(circle at 92% 24%, rgba(202,194,173,0.28), transparent 28rem),
    repeating-linear-gradient(93deg, rgba(24,32,29,0.012) 0 1px, transparent 1px 5px);
}
.nf-header, .nf-main, .nf-footer { position: relative; z-index: 1; width: min(1280px, calc(100% - 3rem)); margin-inline: auto; }
.nf-header {
  min-height: 6.5rem;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1.5rem;
  border-bottom: 1px solid var(--nf-line-dark);
}
.nf-wordmark {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--nf-ink);
  text-decoration: none;
  font-weight: 720;
  letter-spacing: -0.025em;
}
.nf-mark {
  width: 2.15rem;
  height: 2.15rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--nf-sheet);
  background: var(--nf-accent);
  font: italic 700 1.25rem/1 "Iowan Old Style", Palatino, serif;
  transform: rotate(-8deg);
  box-shadow: 0.2rem 0.2rem 0 var(--nf-ink);
}
.nf-wordmark > span:nth-child(2) { font-size: 1.15rem; }
.nf-wordmark small {
  padding-left: 0.65rem;
  border-left: 1px solid var(--nf-line-dark);
  color: var(--nf-muted);
  font: 700 0.68rem/1.2 "SFMono-Regular", Consolas, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.nf-date { display: grid; justify-items: center; gap: 0.18rem; }
.nf-date span { color: var(--nf-muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.nf-date strong { font-family: "Iowan Old Style", Palatino, serif; font-size: 1.1rem; font-weight: 600; }
.nf-current-link {
  justify-self: end;
  color: var(--nf-muted);
  font-size: 0.78rem;
  font-weight: 650;
  text-decoration: none;
}
.nf-current-link span { margin-left: 0.3rem; color: var(--nf-accent); }
.nf-current-link:hover { color: var(--nf-ink); }
.nf-main { padding: 2rem 0 3.5rem; }
.nf-capture {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem 1rem;
  padding: 0.85rem 0.9rem 0.8rem 1.15rem;
  border: 1px solid var(--nf-line-dark);
  background: rgba(251,250,246,0.82);
  box-shadow: 0 0.65rem 1.8rem rgba(40,45,40,0.05);
}
.nf-capture-plus { color: var(--nf-accent); font: 400 2rem/1 "Iowan Old Style", Palatino, serif; }
.nf-capture label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.nf-capture input {
  min-width: 0;
  min-height: 3rem;
  border: 0;
  outline: 0;
  color: var(--nf-ink);
  background: transparent;
  font-family: "Iowan Old Style", Palatino, serif;
  font-size: clamp(1.08rem, 1.5vw, 1.35rem);
}
.nf-capture input::placeholder { color: #8d918b; }
.nf-capture button {
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 1px solid var(--nf-ink);
  color: var(--nf-sheet);
  background: var(--nf-ink);
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 750;
}
.nf-capture button:hover:not(:disabled) { background: var(--nf-accent); border-color: var(--nf-accent); }
.nf-capture button:disabled { cursor: not-allowed; opacity: 0.38; }
.nf-capture small {
  grid-column: 2 / -1;
  margin-top: -0.45rem;
  color: var(--nf-faint);
  font-size: 0.68rem;
}
.nf-capture code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.64rem; }
.nf-feedback {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.75rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid #9eb6a8;
  color: var(--nf-green);
  background: var(--nf-green-soft);
  font-size: 0.78rem;
  font-weight: 650;
  animation: nf-rise 180ms ease-out;
}
.nf-feedback > span { font-weight: 800; }
.nf-feedback.error { border-color: #dba99e; color: var(--nf-accent-dark); background: var(--nf-accent-soft); }
.nf-primary-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(19rem, 0.75fr); gap: 1.5rem; margin-top: 2rem; }
.nf-now, .nf-today { min-width: 0; }
.nf-section-label { display: flex; align-items: flex-start; gap: 0.85rem; margin-bottom: 1rem; }
.nf-section-label > span, .nf-today-head > div > span, .nf-preview header > span {
  padding-top: 0.45rem;
  color: var(--nf-accent);
  font: 800 0.63rem/1 "SFMono-Regular", Consolas, monospace;
  letter-spacing: 0.08em;
}
.nf-section-label h1 { margin: 0; font: 600 clamp(2.5rem, 4vw, 4.2rem)/0.9 "Iowan Old Style", Palatino, serif; letter-spacing: -0.055em; }
.nf-section-label p { margin: 0.5rem 0 0; color: var(--nf-muted); font-size: 0.85rem; }
.nf-focus-card {
  position: relative;
  min-height: 26rem;
  display: flex;
  flex-direction: column;
  padding: clamp(1.5rem, 3vw, 2.7rem);
  overflow: hidden;
  color: #f5f2e9;
  background: var(--nf-ink);
  box-shadow: 0.9rem 0.9rem 0 #d5d0c4;
}
.nf-focus-card::after {
  content: '';
  position: absolute;
  width: 18rem;
  height: 18rem;
  right: -10rem;
  bottom: -10rem;
  border: 3.5rem solid rgba(221,74,47,0.75);
  border-radius: 50%;
}
.nf-focus-card > * { position: relative; z-index: 1; }
.nf-focus-topline { display: flex; flex-wrap: wrap; align-items: center; gap: 0.7rem; color: #b8c0bb; font: 700 0.68rem/1 "SFMono-Regular", Consolas, monospace; text-transform: uppercase; }
.nf-focus-topline span + span::before { content: '/'; margin-right: 0.7rem; color: #626d68; }
.nf-priority { padding: 0.25rem 0.4rem; color: #fff; background: var(--nf-accent); }
.nf-priority.priority-p2, .nf-priority.priority-p3 { color: var(--nf-ink); background: #d7d9c8; }
.nf-focus-title {
  max-width: 47rem;
  margin: auto 0 0;
  padding: 3rem 0 0;
  border: 0;
  color: #fffdfa;
  background: transparent;
  cursor: pointer;
  font: 500 clamp(2.25rem, 4.4vw, 4.6rem)/1.01 "Iowan Old Style", Palatino, serif;
  letter-spacing: -0.045em;
  text-align: left;
}
.nf-focus-title:hover { color: #ffd7c8; }
.nf-focus-note { max-width: 39rem; margin: 1.2rem 0 1.6rem; color: #abb4af; font-size: 0.88rem; line-height: 1.65; }
.nf-agent-context {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 1rem;
  padding: 0.75rem 0;
  border: solid #4b5752;
  border-width: 1px 0;
  color: #ccd3cf;
  background: transparent;
  cursor: pointer;
  font-size: 0.72rem;
  text-align: left;
}
.nf-agent-context strong { margin-left: auto; color: #fff; }
.nf-agent-pulse { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #7bc79f; box-shadow: 0 0 0 0.3rem rgba(123,199,159,0.1); }
.nf-focus-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; margin-top: auto; }
.nf-focus-actions button, .nf-focus-empty button {
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 1px solid #68736e;
  color: #eff2ef;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 750;
}
.nf-focus-actions button:hover:not(:disabled) { border-color: #fff; }
.nf-focus-actions .primary { border-color: var(--nf-accent); background: var(--nf-accent); }
.nf-focus-actions .primary:hover:not(:disabled) { background: #ee6045; }
.nf-focus-actions .complete { border-color: #8caaa0; color: #dff0e7; }
.nf-focus-actions .text { margin-left: auto; padding-inline: 0; border-color: transparent; color: #b8c0bb; }
.nf-focus-actions button:disabled { cursor: wait; opacity: 0.48; }
.nf-focus-empty { min-height: 26rem; display: grid; place-items: center; align-content: center; padding: 2rem; border: 1px dashed var(--nf-line-dark); background: rgba(251,250,246,0.58); text-align: center; }
.nf-focus-empty > span { color: var(--nf-accent); font: 400 4rem/1 serif; }
.nf-focus-empty h2 { margin: 1rem 0 0.35rem; font: 500 2rem/1.1 "Iowan Old Style", Palatino, serif; }
.nf-focus-empty p { margin: 0 0 1.2rem; color: var(--nf-muted); }
.nf-focus-empty button { border-color: var(--nf-ink); color: var(--nf-sheet); background: var(--nf-ink); }
.nf-today { align-self: end; border-top: 3px solid var(--nf-ink); background: rgba(251,250,246,0.62); }
.nf-today-head { display: flex; align-items: flex-end; justify-content: space-between; padding: 1.35rem 1.2rem 0; }
.nf-today-head > div { display: flex; align-items: flex-start; gap: 0.65rem; }
.nf-today-head h2 { margin: 0; font: 600 2rem/1 "Iowan Old Style", Palatino, serif; }
.nf-today-head > strong { color: var(--nf-accent); font: 500 2.7rem/0.8 "Iowan Old Style", Palatino, serif; }
.nf-today-intro { margin: 0.55rem 1.2rem 1rem 2.5rem; color: var(--nf-muted); font-size: 0.75rem; }
.nf-today-list { border-top: 1px solid var(--nf-line); }
.nf-today-row {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  gap: 0.15rem 0.7rem;
  align-items: center;
  min-height: 4.8rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--nf-line);
  animation: nf-rise 300ms both;
}
.nf-row-index { grid-row: span 2; align-self: start; padding-top: 0.2rem; color: var(--nf-faint); font: 700 0.61rem/1 "SFMono-Regular", Consolas, monospace; }
.nf-row-title { min-width: 0; padding: 0; border: 0; color: var(--nf-ink); background: transparent; cursor: pointer; overflow: hidden; font-size: 0.86rem; font-weight: 680; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.nf-row-title:hover { color: var(--nf-accent-dark); }
.nf-row-meta { grid-column: 2; color: var(--nf-muted); font-size: 0.68rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nf-make-now { grid-column: 3; grid-row: 1 / span 2; padding: 0.4rem 0.55rem; border: 1px solid var(--nf-line-dark); color: var(--nf-muted); background: transparent; cursor: pointer; font: 750 0.62rem/1 "SFMono-Regular", Consolas, monospace; text-transform: uppercase; }
.nf-make-now:hover:not(:disabled) { border-color: var(--nf-accent); color: var(--nf-accent-dark); background: var(--nf-accent-soft); }
.nf-make-now:disabled { cursor: wait; opacity: 0.45; }
.nf-list-empty { padding: 2rem 1.2rem; color: var(--nf-muted); font-family: "Iowan Old Style", Palatino, serif; font-style: italic; }
.nf-overflow-note { margin: 0; padding: 0.8rem 1.2rem; color: var(--nf-faint); font-size: 0.68rem; text-align: right; }
.nf-support { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; margin-top: 3.3rem; padding-top: 1.5rem; border-top: 1px solid var(--nf-line-dark); }
.nf-preview { min-width: 0; }
.nf-preview header { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; gap: 0.6rem; align-items: start; margin-bottom: 1rem; }
.nf-preview h2 { margin: 0; font: 600 1.55rem/1 "Iowan Old Style", Palatino, serif; }
.nf-preview header p { max-width: 28rem; margin: 0.35rem 0 0; color: var(--nf-muted); font-size: 0.73rem; line-height: 1.45; }
.nf-preview header strong { color: var(--nf-ink); font: 500 2rem/1 "Iowan Old Style", Palatino, serif; }
.nf-preview-list { border-top: 1px solid var(--nf-ink); }
.nf-preview-list button { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto 1rem; gap: 0.7rem; align-items: center; min-height: 3.35rem; padding: 0.7rem 0; border: solid var(--nf-line); border-width: 0 0 1px; color: var(--nf-ink); background: transparent; cursor: pointer; text-align: left; }
.nf-preview-list button > span { overflow: hidden; font-size: 0.84rem; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.nf-preview-list button small { color: var(--nf-muted); font-size: 0.65rem; }
.nf-preview-list button i { color: var(--nf-accent); font-style: normal; transition: transform 140ms ease; }
.nf-preview-list button:hover i { transform: translate(0.15rem, -0.15rem); }
.nf-preview-empty { padding: 1.5rem 0; border-bottom: 1px solid var(--nf-line); color: var(--nf-muted); font-family: "Iowan Old Style", Palatino, serif; font-style: italic; }
.nf-preview-more { margin: 0.7rem 0 0; color: var(--nf-faint); font-size: 0.67rem; text-align: right; }
.nf-footer { display: flex; justify-content: space-between; gap: 1rem; padding: 1.2rem 0 2rem; border-top: 1px solid var(--nf-line-dark); color: var(--nf-muted); font-size: 0.7rem; }
.nf-footer span:first-child { color: var(--nf-ink); font-family: "Iowan Old Style", Palatino, serif; font-size: 0.83rem; font-style: italic; }
.now-first a:focus-visible, .now-first button:focus-visible, .now-first input:focus-visible { outline: 2px solid var(--nf-accent); outline-offset: 3px; }
@keyframes nf-rise { from { opacity: 0; transform: translateY(0.45rem); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 920px) {
  .nf-primary-grid { grid-template-columns: 1fr; }
  .nf-today { align-self: auto; }
  .nf-support { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .nf-header, .nf-main, .nf-footer { width: min(100% - 1.5rem, 1280px); }
  .nf-header { min-height: 5.5rem; grid-template-columns: 1fr auto; }
  .nf-date { display: none; }
  .nf-main { padding-top: 1rem; }
  .nf-capture { grid-template-columns: auto minmax(0, 1fr); padding-bottom: 0.9rem; }
  .nf-capture input { font-size: 1rem; }
  .nf-capture button { grid-column: 2; justify-self: start; }
  .nf-capture small { display: none; }
  .nf-primary-grid { margin-top: 1.5rem; }
  .nf-focus-card { min-height: 23rem; padding: 1.35rem; box-shadow: 0.45rem 0.45rem 0 #d5d0c4; }
  .nf-focus-title { padding-top: 2.5rem; font-size: clamp(2.15rem, 12vw, 3.3rem); }
  .nf-focus-actions .text { width: 100%; margin-left: 0; text-align: left; }
  .nf-support { margin-top: 2.4rem; }
  .nf-preview-list button { grid-template-columns: minmax(0, 1fr) 1rem; }
  .nf-preview-list button small { display: none; }
  .nf-footer { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  .nf-feedback, .nf-today-row { animation: none; }
  .nf-preview-list button i { transition: none; }
}
`;
