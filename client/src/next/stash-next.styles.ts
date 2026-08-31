export const stashNextStyles = `
.sn-app {
  --sn-navy: #17395c;
  --sn-navy-2: #28577d;
  --sn-blue: #4f87b0;
  --sn-sky: #c9ddea;
  --sn-sky-soft: #e8f1f5;
  --sn-paper: #f7f9fa;
  --sn-white: #ffffff;
  --sn-ink: #23313d;
  --sn-muted: #657582;
  --sn-faint: #98a5ae;
  --sn-line: #dce4e8;
  --sn-red: #c94d4d;
  --sn-yellow: #d79a27;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  color: var(--sn-ink);
  background: var(--sn-paper);
  color-scheme: light;
  font-family: "Avenir Next", Avenir, "Gill Sans", sans-serif;
}
.sn-app *, .sn-app *::before, .sn-app *::after { box-sizing: border-box; }
.sn-app button, .sn-app input { font-family: inherit; }
.sn-sidebar {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 2rem 1.1rem 1.2rem;
  border-right: 1px solid #cbdce5;
  background:
    radial-gradient(circle at 10% 4%, rgba(255,255,255,0.9), transparent 13rem),
    var(--sn-sky-soft);
}
.sn-brand { display: inline-flex; align-items: center; gap: 0.65rem; width: fit-content; color: var(--sn-navy); text-decoration: none; font-size: 1.2rem; font-weight: 750; letter-spacing: -0.035em; }
.sn-brand-mark { width: 2.2rem; height: 2.2rem; display: grid; place-items: center; border-radius: 0.72rem 0.72rem 0.72rem 0.15rem; color: white; background: var(--sn-navy); font: italic 600 1.25rem/1 "Iowan Old Style", Palatino, serif; box-shadow: 0 0.35rem 0.8rem rgba(23,57,92,0.2); }
.sn-nav { display: grid; gap: 0.35rem; margin-top: 2.8rem; }
.sn-nav a { min-height: 3rem; display: grid; grid-template-columns: 1.7rem minmax(0, 1fr) auto; align-items: center; gap: 0.55rem; padding: 0 0.8rem; border-radius: 0.7rem; color: #506675; text-decoration: none; font-size: 0.86rem; font-weight: 650; }
.sn-nav a i { color: #6d8797; font-family: "Iowan Old Style", Palatino, serif; font-size: 1.12rem; font-style: normal; text-align: center; }
.sn-nav a small { color: #879aa6; font-size: 0.68rem; }
.sn-nav a:hover { color: var(--sn-navy); background: rgba(255,255,255,0.56); }
.sn-nav a.active { color: white; background: var(--sn-navy); box-shadow: 0 0.45rem 1rem rgba(23,57,92,0.17); }
.sn-nav a.active i, .sn-nav a.active small { color: #dcebf3; }
.sn-sidebar-note { margin-top: auto; padding: 1rem; border: 1px solid #d0e0e7; border-radius: 0.8rem; background: rgba(255,255,255,0.48); }
.sn-sidebar-note span { color: var(--sn-navy); font-size: 0.72rem; font-weight: 750; }
.sn-sidebar-note p { margin: 0.25rem 0 0; color: var(--sn-muted); font-size: 0.68rem; line-height: 1.45; }
.sn-old-link { margin: 1rem 0 0.2rem; color: #788d99; font-size: 0.68rem; text-align: center; text-decoration: none; }
.sn-content { position: relative; min-width: 0; min-height: 100vh; overflow: hidden; background: linear-gradient(180deg, var(--sn-sky) 0 18.5rem, var(--sn-paper) 18.5rem); }
.sn-content:not(.view-my-day) { background: linear-gradient(180deg, #dce9ef 0 12rem, var(--sn-paper) 12rem); }
.sn-sky { position: absolute; inset: 0 0 auto; height: 18.5rem; overflow: hidden; pointer-events: none; }
.sn-sky::before { content: ''; position: absolute; width: 36rem; height: 36rem; right: -12rem; top: -24rem; border: 5rem solid rgba(255,255,255,0.24); border-radius: 50%; }
.sn-sky span:first-child { position: absolute; width: 7rem; height: 7rem; right: 10%; top: 4.5rem; border-radius: 50%; background: rgba(255,244,204,0.75); box-shadow: 0 0 4rem rgba(255,245,204,0.48); }
.sn-sky span:last-child { position: absolute; left: 6%; top: 8rem; width: 13rem; height: 2.8rem; border-radius: 50%; background: rgba(255,255,255,0.18); filter: blur(1px); }
.sn-page { position: relative; z-index: 1; width: min(58rem, calc(100% - 3rem)); margin: 0 auto; padding: 3.2rem 0 5rem; }
.sn-page-head { min-height: 7rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 2rem; margin-bottom: 1.4rem; color: var(--sn-navy); }
.sn-page-head > div > span { display: block; margin-bottom: 0.35rem; color: #52748c; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
.sn-page-head h1 { margin: 0; font: 600 clamp(2.65rem, 5vw, 4.3rem)/0.95 "Iowan Old Style", Palatino, serif; letter-spacing: -0.055em; }
.sn-page-head p { margin: 0.65rem 0 0; color: #557086; font-size: 0.84rem; }
.sn-page-head > strong { color: rgba(23,57,92,0.42); font: 500 3.5rem/1 "Iowan Old Style", Palatino, serif; }
.sn-suggest-button { min-height: 2.65rem; display: inline-flex; align-items: center; gap: 0.55rem; margin-top: 1.2rem; padding: 0 0.8rem; border: 1px solid rgba(23,57,92,0.16); border-radius: 1.5rem; color: var(--sn-navy); background: rgba(255,255,255,0.42); cursor: pointer; font-size: 0.72rem; font-weight: 720; backdrop-filter: blur(10px); }
.sn-suggest-button > span { color: var(--sn-yellow); font-size: 1rem; }
.sn-suggest-button strong { min-width: 1.3rem; height: 1.3rem; display: grid; place-items: center; border-radius: 50%; color: white; background: var(--sn-navy); font-size: 0.62rem; }
.sn-suggest-button:hover { background: rgba(255,255,255,0.72); }
.sn-current { width: 100%; display: grid; grid-template-columns: auto auto minmax(0,1fr) auto; align-items: center; gap: 0.7rem; margin: -0.15rem 0 0.85rem; padding: 0.8rem 1rem; border: 0; border-radius: 0.85rem; color: white; background: rgba(23,57,92,0.92); cursor: pointer; text-align: left; box-shadow: 0 0.55rem 1.2rem rgba(23,57,92,0.16); }
.sn-current-dot { width: 0.55rem; height: 0.55rem; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 0 0.25rem rgba(255,255,255,0.12); }
.sn-current small { color: #b9d3e3; font-size: 0.66rem; text-transform: uppercase; }
.sn-current strong { overflow: hidden; font-size: 0.82rem; text-overflow: ellipsis; white-space: nowrap; }
.sn-current i { color: #dcebf3; font-size: 0.68rem; font-style: normal; }
.sn-capture { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 0.65rem; min-height: 3.7rem; margin-bottom: 0.85rem; padding: 0 0.7rem 0 1rem; border: 1px solid rgba(23,57,92,0.08); border-radius: 0.8rem; background: rgba(255,255,255,0.95); box-shadow: 0 0.45rem 1.2rem rgba(46,75,95,0.09); }
.sn-capture > span { color: var(--sn-blue); font-size: 1.3rem; }
.sn-capture label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.sn-capture input { min-width: 0; height: 3.4rem; border: 0; outline: 0; color: var(--sn-ink); background: transparent; font-size: 0.9rem; }
.sn-capture input::placeholder { color: #8b9ba6; }
.sn-capture button { min-width: 4.2rem; min-height: 2.45rem; border: 0; border-radius: 0.55rem; color: white; background: var(--sn-navy); cursor: pointer; font-size: 0.7rem; font-weight: 720; }
.sn-capture button:disabled { color: #9daab2; background: #edf1f3; cursor: not-allowed; }
.sn-list { overflow: hidden; border: 1px solid var(--sn-line); border-radius: 0.9rem; background: rgba(255,255,255,0.94); box-shadow: 0 0.55rem 1.4rem rgba(46,75,95,0.07); }
.sn-task { min-height: 4.25rem; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 0.9rem; padding: 0.55rem 1rem; border-bottom: 1px solid #e8edef; transition: background 120ms ease; }
.sn-task:last-child { border-bottom: 0; }
.sn-task:hover { background: #f8fbfc; }
.sn-task.active { background: #f4f9fb; }
.sn-check { position: relative; width: 2.25rem; height: 2.25rem; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; color: var(--sn-navy); background: transparent; cursor: pointer; font-size: 0; }
.sn-check::before { content: ''; width: 1.25rem; height: 1.25rem; border: 1.5px solid #7992a3; border-radius: 50%; background: white; }
.sn-check:hover::before { border-color: var(--sn-navy); box-shadow: inset 0 0 0 0.22rem #dce9f0; }
.sn-task-body { min-width: 0; display: grid; gap: 0.27rem; padding: 0; border: 0; color: var(--sn-ink); background: transparent; cursor: pointer; text-align: left; }
.sn-task-body strong { overflow: hidden; font-size: 0.9rem; font-weight: 630; text-overflow: ellipsis; white-space: nowrap; }
.sn-task-body > span { display: flex; flex-wrap: wrap; gap: 0.6rem; color: var(--sn-muted); }
.sn-task-body i { font-size: 0.66rem; font-style: normal; }
.sn-task-body i + i::before { content: '·'; margin-right: 0.6rem; color: #b2bcc2; }
.sn-task-body i.overdue { color: var(--sn-red); }
.sn-important { color: var(--sn-yellow); font-size: 0.92rem; }
.sn-list-foot { margin: 0.75rem 0 0; color: #7d8d97; font-size: 0.68rem; text-align: center; }
.sn-empty { min-height: 18rem; display: grid; place-items: center; align-content: center; padding: 2rem; text-align: center; }
.sn-empty > span { color: #82a9c1; font: 400 3.8rem/1 "Iowan Old Style", Palatino, serif; }
.sn-empty h2 { margin: 0.8rem 0 0.35rem; color: var(--sn-navy); font: 600 1.6rem/1.1 "Iowan Old Style", Palatino, serif; }
.sn-empty p { margin: 0 0 1rem; color: var(--sn-muted); font-size: 0.78rem; }
.sn-empty button { min-height: 2.55rem; padding: 0 0.9rem; border: 0; border-radius: 0.6rem; color: white; background: var(--sn-navy); cursor: pointer; font-size: 0.72rem; font-weight: 700; }
.sn-empty.compact { min-height: 14rem; }
.sn-projects { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0.85rem; }
.sn-projects article { min-height: 9.5rem; display: grid; grid-template-columns: auto minmax(0,1fr); gap: 0.8rem; align-content: start; padding: 1.15rem; border: 1px solid var(--sn-line); border-radius: 0.9rem; background: rgba(255,255,255,0.9); box-shadow: 0 0.45rem 1rem rgba(46,75,95,0.06); }
.sn-projects article > span { font-size: 1.2rem; }
.sn-projects h2 { margin: 0; color: var(--sn-navy); font: 600 1.15rem/1.2 "Iowan Old Style", Palatino, serif; }
.sn-projects p { margin: 0.25rem 0 0; color: var(--sn-muted); font-size: 0.68rem; }
.sn-projects button { grid-column: 1/-1; display: flex; justify-content: space-between; gap: 0.6rem; margin-top: auto; padding: 0.7rem 0 0; border: solid var(--sn-line); border-width: 1px 0 0; color: #516a79; background: transparent; cursor: pointer; overflow: hidden; font-size: 0.7rem; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.sn-projects button i { color: var(--sn-blue); font-style: normal; }
.sn-scrim { position: fixed; inset: 0; z-index: 40; border: 0; background: rgba(19,42,61,0.26); backdrop-filter: blur(2px); }
.sn-panel { position: fixed; z-index: 50; top: 0; right: 0; width: min(28rem, 100%); height: 100vh; display: flex; flex-direction: column; padding: 1.6rem; color: var(--sn-ink); background: #fbfcfc; box-shadow: -1rem 0 3rem rgba(24,52,73,0.18); animation: sn-panel-in 180ms ease-out; }
.sn-panel > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding-bottom: 1.2rem; border-bottom: 1px solid var(--sn-line); }
.sn-panel > header span { color: var(--sn-blue); font-size: 0.68rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
.sn-panel > header h2 { margin: 0.45rem 0 0; color: var(--sn-navy); font: 600 1.75rem/1.12 "Iowan Old Style", Palatino, serif; }
.sn-panel > header p { margin: 0.55rem 0 0; color: var(--sn-muted); font-size: 0.72rem; line-height: 1.5; }
.sn-panel > header > button { width: 2rem; height: 2rem; flex: 0 0 auto; border: 0; border-radius: 50%; color: #6f808b; background: #edf2f4; cursor: pointer; font-size: 1rem; }
.sn-plan-summary { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 0.25rem 0.5rem; align-items: baseline; padding: 1.15rem 0; }
.sn-plan-summary strong { color: var(--sn-navy); font: 600 1.45rem/1 "Iowan Old Style", Palatino, serif; }
.sn-plan-summary span { color: var(--sn-muted); font-size: 0.64rem; }
.sn-plan-list { flex: 1; min-height: 0; overflow-y: auto; border-top: 1px solid var(--sn-line); }
.sn-plan-list label { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 0.75rem; align-items: start; padding: 1rem 0; border-bottom: 1px solid var(--sn-line); cursor: pointer; }
.sn-plan-list input { position: absolute; opacity: 0; }
.sn-plan-check { width: 1.2rem; height: 1.2rem; display: grid; place-items: center; border: 1.5px solid #91a5b1; border-radius: 0.3rem; color: transparent; background: white; font-size: 0.65rem; }
.sn-plan-list input:checked + .sn-plan-check { border-color: var(--sn-navy); color: white; background: var(--sn-navy); }
.sn-plan-list label > span:last-child { min-width: 0; display: grid; grid-template-columns: 1.6rem minmax(0,1fr); gap: 0.25rem 0.5rem; }
.sn-plan-list small { grid-row: span 2; color: #9aa8b0; font-size: 0.6rem; }
.sn-plan-list strong { color: var(--sn-ink); font-size: 0.8rem; }
.sn-plan-list em { color: var(--sn-blue); font-size: 0.64rem; font-style: normal; }
.sn-panel-empty { padding: 2rem 0; color: var(--sn-muted); font-size: 0.75rem; }
.sn-panel > footer { display: flex; gap: 0.6rem; padding-top: 1rem; border-top: 1px solid var(--sn-line); }
.sn-panel > footer button, .sn-detail-actions button { min-height: 2.65rem; padding: 0 0.85rem; border: 1px solid var(--sn-line); border-radius: 0.55rem; color: #526773; background: white; cursor: pointer; font-size: 0.7rem; font-weight: 700; }
.sn-panel > footer button.primary, .sn-detail-actions button.primary { border-color: var(--sn-navy); color: white; background: var(--sn-navy); }
.sn-panel button:disabled { cursor: wait; opacity: 0.48; }
.sn-detail-actions { display: flex; flex-wrap: wrap; gap: 0.55rem; padding: 1.1rem 0; border-bottom: 1px solid var(--sn-line); }
.sn-detail-state { padding: 1rem 0; color: var(--sn-muted); font-size: 0.72rem; }
.sn-detail-state.error { color: var(--sn-red); }
.sn-detail-section { padding: 1.1rem 0; border-bottom: 1px solid var(--sn-line); }
.sn-detail-section h3 { margin: 0 0 0.65rem; color: #81909a; font-size: 0.63rem; letter-spacing: 0.08em; text-transform: uppercase; }
.sn-detail-section > p { margin: 0; color: #4d5f6a; font-size: 0.78rem; line-height: 1.6; white-space: pre-wrap; }
.sn-step { display: grid; grid-template-columns: auto 1fr; gap: 0.55rem; padding: 0.45rem 0; }
.sn-step span { width: 1rem; height: 1rem; display: grid; place-items: center; border: 1px solid #9aabb5; border-radius: 50%; color: var(--sn-blue); font-size: 0.55rem; }
.sn-step p { margin: 0; color: #4d5f6a; font-size: 0.75rem; }
.sn-properties dl { margin: 0; }
.sn-properties dl > div { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; }
.sn-properties dt { color: var(--sn-muted); font-size: 0.7rem; }
.sn-properties dd { margin: 0; color: var(--sn-ink); font-size: 0.7rem; text-transform: capitalize; }
.sn-labels { display: flex; flex-wrap: wrap; gap: 0.4rem; padding-top: 1rem; }
.sn-labels span { padding: 0.32rem 0.5rem; border-radius: 0.45rem; color: #4c6d80; background: #e7f0f4; font-size: 0.63rem; }
.sn-toast { position: fixed; z-index: 70; left: 50%; bottom: 1.5rem; max-width: min(34rem, calc(100% - 2rem)); display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 0.8rem; border-radius: 0.7rem; color: white; background: var(--sn-navy); box-shadow: 0 0.8rem 2rem rgba(23,57,92,0.22); font-size: 0.74rem; transform: translateX(-50%); }
.sn-toast.error { background: #9d3d3d; }
.sn-toast > span { font-weight: 800; }
.sn-toast button { margin-left: auto; border: 0; color: white; background: transparent; cursor: pointer; }
.sn-mobile-header { display: none; }
.sn-app a:focus-visible, .sn-app button:focus-visible, .sn-app input:focus-visible, .sn-plan-list label:focus-within { outline: 2px solid #2e6f9d; outline-offset: 2px; }
@keyframes sn-panel-in { from { transform: translateX(2rem); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@media (max-width: 760px) {
  .sn-app { display: block; }
  .sn-sidebar { display: none; }
  .sn-content, .sn-content:not(.view-my-day) { background: linear-gradient(180deg, var(--sn-sky) 0 15rem, var(--sn-paper) 15rem); }
  .sn-sky { height: 15rem; }
  .sn-mobile-header { position: relative; z-index: 4; min-height: 4.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0 1rem; }
  .sn-mobile-header .sn-brand-mark { width: 1.9rem; height: 1.9rem; }
  .sn-mobile-header nav { display: flex; gap: 0.65rem; }
  .sn-mobile-header nav a { color: var(--sn-navy); font-size: 0.65rem; font-weight: 700; text-decoration: none; }
  .sn-page { width: min(100% - 1.25rem, 58rem); padding: 1.1rem 0 4rem; }
  .sn-page-head { min-height: 6.7rem; }
  .sn-page-head h1 { font-size: 3rem; }
  .sn-page-head p { max-width: 15rem; }
  .sn-suggest-button { padding-inline: 0.65rem; }
  .sn-suggest-button { font-size: 0; }
  .sn-suggest-button span, .sn-suggest-button strong { font-size: 0.68rem; }
  .sn-current { grid-template-columns: auto minmax(0,1fr) auto; }
  .sn-current small { display: none; }
  .sn-capture { min-height: 3.5rem; }
  .sn-task { min-height: 4.45rem; padding-inline: 0.8rem; }
  .sn-task-body strong { font-size: 0.86rem; }
  .sn-projects { grid-template-columns: 1fr; }
  .sn-panel { padding: 1.25rem; }
}
@media (prefers-reduced-motion: reduce) { .sn-panel { animation: none; } }
`;
