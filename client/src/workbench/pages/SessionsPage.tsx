import { Link } from 'react-router-dom';
import type { WBData } from '../data';
import { SessionRow, Topbar } from '../shared';

export function SessionsPage({ data }: { data: WBData; reload: () => void }) {
  const liveSessions = data.sessions.filter((session) => session.state === 'live');
  const recentSessions = data.sessions.filter((session) => session.state !== 'live');

  return (
    <div className="dashboard-canvas sessions-page">
      <div className="inner">
        <Topbar data={data} />

        <header className="sessions-page-header">
          <div>
            <p className="page-eyebrow">Sessions</p>
            <h1>See what your agents are doing and what they changed.</h1>
            <p>Start a session from a task so its prompt, project, skills, and result stay connected.</p>
          </div>
          <Link className="sessions-work-link" to="/">Choose a task to start</Link>
        </header>

        <section className="sessions-section" aria-labelledby="live-sessions-heading">
          <div className="sessions-section-heading">
            <h2 id="live-sessions-heading">Live now</h2>
            <span>{liveSessions.length}</span>
          </div>
          {liveSessions.length === 0 ? (
            <div className="sessions-empty">
              <strong>No agents are running</strong>
              <span>Open a task and choose Start session when you are ready to work.</span>
            </div>
          ) : (
            <div className="sessions-list">
              {liveSessions.map((session) => <SessionRow key={session.id} s={session} projects={data.projects} />)}
            </div>
          )}
        </section>

        <section className="sessions-section" aria-labelledby="recent-sessions-heading">
          <div className="sessions-section-heading">
            <h2 id="recent-sessions-heading">Recent history</h2>
            <span>{recentSessions.length}</span>
          </div>
          {recentSessions.length === 0 ? (
            <div className="sessions-empty">
              <strong>No session history yet</strong>
              <span>Completed and interrupted sessions will remain here as evidence.</span>
            </div>
          ) : (
            <div className="sessions-list">
              {recentSessions.map((session) => <SessionRow key={session.id} s={session} projects={data.projects} />)}
            </div>
          )}
        </section>
      </div>
      <style>{sessionsPageStyles}</style>
    </div>
  );
}

const sessionsPageStyles = `
.sessions-page .inner { overflow: visible; }
.sessions-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding: 1rem 0 1.5rem;
}
.sessions-page-header h1 {
  max-width: 32ch;
  margin: 0;
  color: var(--text-primary);
  font-size: 1.6rem;
  line-height: 1.25;
}
.sessions-page-header p:not(.page-eyebrow) {
  max-width: 65ch;
  margin: 0.65rem 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.sessions-work-link {
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font: 700 0.78rem/1 var(--font-mono);
  text-decoration: none;
}
.sessions-work-link:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 3px; }
.sessions-section { padding: 1.25rem 0; border-top: 1px solid var(--border-hair); }
.sessions-section-heading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}
.sessions-section-heading h2 { margin: 0; font-size: 1rem; }
.sessions-section-heading span {
  color: var(--text-muted);
  font: 0.7rem/1 var(--font-mono);
}
.sessions-list { display: grid; gap: 0.5rem; }
.sessions-empty {
  display: grid;
  gap: 0.2rem;
  padding: 1.25rem 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.sessions-empty strong { color: var(--text-secondary); }
@media (max-width: 720px) {
  .sessions-page-header { align-items: stretch; flex-direction: column; gap: 1rem; }
  .sessions-page-header h1 { font-size: 1.35rem; }
}
`;
