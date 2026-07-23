import { Link, Route, Routes } from 'react-router-dom';
import { WorkbenchDialogProvider } from './components/ui/workbench-dialogs';
import { Workbench, type WorkbenchPage } from './workbench/Workbench';

function Page({ page }: { page: WorkbenchPage }) {
  return <Workbench page={page} />;
}

export function App() {
  return (
    <WorkbenchDialogProvider>
      <Routes>
        <Route path="/" element={<Page page="work" />} />
        <Route path="/todos/:workItemId" element={<Page page="todo-detail" />} />

        <Route path="/projects" element={<Page page="projects" />} />
        <Route path="/projects/new" element={<Page page="project-form" />} />
        <Route path="/projects/:projectId/settings" element={<Page page="project-form" />} />
        <Route path="/projects/:projectId" element={<Page page="project-detail" />} />

        <Route path="/sessions" element={<Page page="sessions" />} />
        <Route path="/sessions/new" element={<Page page="session-start" />} />
        <Route path="/sessions/:provider/:sessionId" element={<Page page="session-detail" />} />
        <Route path="/sessions/:sessionId" element={<Page page="session-detail" />} />

        <Route path="/review" element={<Page page="review" />} />
        <Route path="/review/usage" element={<Page page="review-usage" />} />

        <Route path="/settings" element={<Page page="settings" />} />
        <Route path="/settings/skills" element={<Page page="settings-skills" />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </WorkbenchDialogProvider>
  );
}

function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
      <section data-testid="not-found" style={{ width: 'min(32rem, 100%)', display: 'grid', justifyItems: 'start', gap: '0.75rem', padding: '1.5rem', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-xl)', background: 'var(--bg-primary)' }}>
        <p style={{ margin: 0, color: 'var(--neon-orange)', font: '700 0.72rem/1 var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Page not found</p>
        <h1 style={{ margin: 0, fontSize: '1.35rem' }}>This route is no longer part of stash.</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Use the current product navigation to continue your work.</p>
        <Link to="/" style={{ minHeight: '2.75rem', display: 'inline-flex', alignItems: 'center', padding: '0.55rem 0.85rem', borderRadius: 'var(--radius-md)', background: 'var(--neon-cyan)', color: 'var(--bg-void)', fontWeight: 700, textDecoration: 'none' }}>Return to Work</Link>
      </section>
    </main>
  );
}
