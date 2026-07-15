import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WBData } from '../data';
import { ProjectCardFull, Topbar } from '../shared';

export function ProjectsPage({ data }: { data: WBData; reload: () => void }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const projects = useMemo(
    () => data.projects.filter((project) => !normalizedQuery
      || project.name.toLowerCase().includes(normalizedQuery)
      || project.doing.toLowerCase().includes(normalizedQuery)),
    [data.projects, normalizedQuery],
  );

  return (
    <div className="dashboard-canvas projects-page">
      <div className="inner">
        <Topbar data={data} />

        <header className="projects-page-header">
          <div>
            <p className="page-eyebrow">Projects</p>
            <h1>Choose the context you want to move forward.</h1>
            <p>{data.projects.length} projects connect tasks, decisions, lessons, skills, and agent sessions.</p>
          </div>
          <Link className="page-primary-action" to="/projects/new" data-testid="create-project">
            Create project
          </Link>
        </header>

        <div className="projects-page-tools">
          <label htmlFor="project-filter">Find a project</label>
          <input
            id="project-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or current focus"
          />
          <span>{projects.length} shown</span>
        </div>

        {data.projects.length === 0 ? (
          <section className="projects-empty">
            <h2>No projects yet</h2>
            <p>Create a project to keep tasks, sessions, decisions, and lessons in one place.</p>
            <Link className="page-primary-action" to="/projects/new">Create your first project</Link>
          </section>
        ) : projects.length === 0 ? (
          <section className="projects-empty">
            <h2>No matching projects</h2>
            <p>Try a different name or clear the search.</p>
            <button type="button" onClick={() => setQuery('')}>Clear search</button>
          </section>
        ) : (
          <section className="projects-grid" aria-label="Projects">
            {projects.map((project) => <ProjectCardFull key={project.id} p={project} />)}
          </section>
        )}
      </div>
      <style>{projectsPageStyles}</style>
    </div>
  );
}

const projectsPageStyles = `
.projects-page .inner { overflow: visible; }
.projects-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding: 1rem 0 1.5rem;
}
.page-eyebrow {
  margin: 0 0 0.35rem;
  color: var(--neon-cyan);
  font: 700 0.72rem/1.2 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.projects-page-header h1 {
  max-width: 28ch;
  margin: 0;
  color: var(--text-primary);
  font-size: 1.6rem;
  line-height: 1.25;
}
.projects-page-header p:not(.page-eyebrow) {
  max-width: 65ch;
  margin: 0.65rem 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.page-primary-action {
  min-height: 2.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--neon-cyan);
  border-radius: var(--radius-md);
  background: var(--neon-cyan);
  color: var(--bg-void);
  font: 700 0.78rem/1 var(--font-mono);
  text-decoration: none;
}
.page-primary-action:focus-visible,
.projects-page-tools input:focus-visible,
.projects-empty button:focus-visible {
  outline: 2px solid var(--neon-cyan);
  outline-offset: 3px;
}
.projects-page-tools {
  display: grid;
  grid-template-columns: auto minmax(12rem, 24rem) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-block: 1px solid var(--border-hair);
}
.projects-page-tools label,
.projects-page-tools span {
  color: var(--text-muted);
  font: 0.72rem/1.2 var(--font-mono);
}
.projects-page-tools input {
  min-height: 2.5rem;
  width: 100%;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font: 0.82rem/1.3 var(--font-mono);
}
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(19rem, 100%), 1fr));
  gap: 1rem;
  padding-top: 1.25rem;
}
.projects-empty {
  max-width: 36rem;
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  padding: 3rem 0;
}
.projects-empty h2,
.projects-empty p { margin: 0; }
.projects-empty p { color: var(--text-muted); }
.projects-empty button {
  min-height: 2.5rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
}
@media (max-width: 720px) {
  .projects-page-header { align-items: stretch; flex-direction: column; gap: 1rem; }
  .projects-page-header h1 { font-size: 1.35rem; }
  .projects-page-tools { grid-template-columns: 1fr auto; }
  .projects-page-tools label { grid-column: 1 / -1; }
}
`;
