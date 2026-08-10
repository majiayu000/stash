import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Skill, SkillSource } from '@stash/shared';
import {
  createSkill,
  deleteSkill,
  listProjectSkills,
  listSkills,
  toggleProjectSkill,
  updateSkill,
} from '../../api/skills';
import { fmt, type WBData, type WBProject } from '../data';
import { LoadErrorPanel, StatTile, Topbar, toError } from '../shared';
import { slugify } from './todo-detail.utils';
import { SkillCard, SkillDetail } from './skills-settings.detail';
import {
  SkillCreateDialog,
  SkillDeleteDialog,
  SkillNotice,
  type SkillCreateForm,
} from './skills-settings.dialogs';
import { skillsSettingsStyles } from './skills-settings.styles';

/**
 * Skills library. Search + tabs + 2-col grid of skill cards on
 * the left, detail panel (header, project bindings, recent uses) on the right.
 *
 * Data: real /api/skills + per-project bindings via /api/projects/:id/skills.
 */
export function SkillsSettingsPage({ data }: { data: WBData; reload: () => void }) {
  const { projects } = data;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('projectId');
  const focusedProject = requestedProjectId
    ? projects.find((project) => project.id === requestedProjectId)
    : undefined;
  const bindingProjects = useMemo(
    () => focusedProject
      ? [focusedProject, ...projects.filter((project) => project.id !== focusedProject.id)]
      : projects,
    [focusedProject, projects],
  );
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projectSkills, setProjectSkills] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', id: '', emoji: '🧩', description: '', idTouched: false });
  const [deleteCandidate, setDeleteCandidate] = useState<Skill | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState<{ message: string; tone: 'ok' | 'error' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      const fetched = await listSkills();
      if (cancelled) return;
      setSkills(fetched);
      if (!selectedId && fetched[0]) setSelectedId(fetched[0].id);

      const entries = await Promise.all(
        projects.map(async (p) => {
          const bindings = await listProjectSkills(p.id);
          return [p.id, bindings.filter((b) => b.enabled).map((b) => b.skillId)] as const;
        }),
      );
      if (cancelled) return;
      setProjectSkills(Object.fromEntries(entries));
      setLoading(false);
    }
    load().catch((e: unknown) => {
      if (!cancelled) {
        setLoadError(toError(e));
        setNotice({ message: toError(e).message, tone: 'error' });
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    // projects is loaded once with WBData; selectedId start only on first paint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length, retryTick]);

  async function handleToggleBinding(projectId: string, skillId: string, enabled: boolean) {
    try {
      await toggleProjectSkill(projectId, skillId, enabled);
      setProjectSkills((cur) => {
        const set = new Set(cur[projectId] ?? []);
        if (enabled) set.add(skillId); else set.delete(skillId);
        return { ...cur, [projectId]: Array.from(set) };
      });
    } catch (e) {
      setNotice({ message: e instanceof Error ? e.message : String(e), tone: 'error' });
    }
  }

  async function handleInstallToggle(skill: Skill) {
    try {
      const next = await updateSkill(skill.id, { installed: !skill.installed });
      setSkills((cur) => cur.map((s) => (s.id === next.id ? next : s)));
      setNotice({ message: `${next.installed ? 'Installed' : 'Uninstalled'} ${next.name}`, tone: 'ok' });
    } catch (e) {
      setNotice({ message: e instanceof Error ? e.message : String(e), tone: 'error' });
    }
  }

  type Tab = 'all' | 'installed' | 'bound' | 'official' | 'community';
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  const boundSkillIds = useMemo(() => {
    const s = new Set<string>();
    for (const ids of Object.values(projectSkills)) ids.forEach((id) => s.add(id));
    return s;
  }, [projectSkills]);

  function openCreateSkill() {
    setCreateForm({ name: '', id: '', emoji: '🧩', description: '', idTouched: false });
    setCreateError('');
    setCreateOpen(true);
  }

  function updateCreateName(name: string) {
    setCreateForm((cur) => ({
      ...cur,
      name,
      id: cur.idTouched ? cur.id : slugify(name),
    }));
  }

  async function handleCreateSkill(event: FormEvent) {
    event.preventDefault();
    const name = createForm.name.trim();
    const id = createForm.id.trim();
    if (!name) {
      setCreateError('Skill name is required.');
      return;
    }
    if (!id) {
      setCreateError('Skill id is required.');
      return;
    }
    try {
      const created = await createSkill({
        id,
        name,
        emoji: createForm.emoji.trim() || '🧩',
        description: createForm.description.trim() || undefined,
        source: 'community',
        installed: true,
      });
      setSkills((cur) => [...cur, created]);
      setSelectedId(created.id);
      setCreateOpen(false);
      setNotice({ message: `Created ${created.name}`, tone: 'ok' });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    }
  }

  function requestDeleteSkill(skill: Skill) {
    setDeleteCandidate(skill);
    setDeleteError('');
  }

  async function confirmDeleteSkill() {
    if (!deleteCandidate) return;
    try {
      await deleteSkill(deleteCandidate.id);
      setSkills((cur) => cur.filter((s) => s.id !== deleteCandidate.id));
      setProjectSkills((cur) => {
        const next: Record<string, string[]> = {};
        for (const [pid, ids] of Object.entries(cur)) next[pid] = ids.filter((id) => id !== deleteCandidate.id);
        return next;
      });
      if (selectedId === deleteCandidate.id) setSelectedId('');
      setNotice({ message: `Deleted ${deleteCandidate.name}`, tone: 'ok' });
      setDeleteCandidate(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !(s.description ?? '').toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
      switch (tab) {
        case 'installed':  return s.installed;
        case 'bound':      return boundSkillIds.has(s.id);
        case 'official':   return s.source === 'official';
        case 'community':  return s.source === 'community';
        default:           return true;
      }
    });
  }, [skills, search, tab, boundSkillIds]);

  const selected = filtered.find((s) => s.id === selectedId)
    ?? skills.find((s) => s.id === selectedId)
    ?? filtered[0]
    ?? skills[0];
  const bindingsFor = (skillId: string): WBProject[] =>
    projects.filter((p) => projectSkills[p.id]?.includes(skillId));

  const installedCount = skills.filter((s) => s.installed).length;
  const boundSkillCount = boundSkillIds.size;
  const activeBindings = Object.values(projectSkills).reduce((sum, ids) => sum + ids.length, 0);

  if (!loading && loadError) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
          <Topbar data={data} />
          <LoadErrorPanel
            title="skills failed to load"
            endpoint="/api/skills + /api/projects/:id/skills"
            error={loadError}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        </div>
        <style>{skillsSettingsStyles}</style>
      </div>
    );
  }

  if (!loading && skills.length === 0) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
          <Topbar data={data} />
          <SkillsProjectContext
            focusedProject={focusedProject}
            requestedProjectId={requestedProjectId}
            onOpenProject={(project) => navigate(`/projects/${encodeURIComponent(project.id)}`)}
          />
          <div className="sk-bar">
            <div className="sk-search">
              <span style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter by name, id, or description"
                data-testid="cm-search"
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-primary)', background: 'transparent', border: 0, outline: 'none' }}
              />
            </div>
            <div className="sk-tabs">
              {([
                ['all',       'all',       skills.length],
                ['installed', 'installed', installedCount],
                ['bound',     'bound',     boundSkillCount],
                ['official',  'official ✓', undefined],
                ['community', 'community', undefined],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key as Tab)}
                  className={`sk-tab ${tab === key ? 'active' : ''}`}
                  data-testid={`cm-tab-${key}`}
                >{label}{count !== undefined && <span>{count}</span>}</button>
              ))}
            </div>
            <button
              className="np-btn primary"
              type="button"
              onClick={openCreateSkill}
              data-testid="cm-create"
              style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem' }}
            >+ new skill</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '4rem 2rem', textAlign: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '2rem', opacity: 0.5 }}>🧩</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)' }}>no skills registered</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 420 }}>
              create a skill here, then bind it to projects from the detail panel.
            </div>
            <button
              className="np-btn primary"
              type="button"
              onClick={openCreateSkill}
              data-testid="cm-empty-create"
              style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.78rem' }}
            >+ new skill</button>
          </div>
        </div>
        {notice && <SkillNotice notice={notice} onDismiss={() => setNotice(null)} />}
        {createOpen && (
          <SkillCreateDialog
            form={createForm}
            error={createError}
            onChangeName={updateCreateName}
            onChange={(patch) => setCreateForm((cur) => ({ ...cur, ...patch }))}
            onClose={() => setCreateOpen(false)}
            onSubmit={handleCreateSkill}
          />
        )}
        <style>{skillsSettingsStyles}</style>
      </div>
    );
  }
  if (!selected) return null;

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        <SkillsProjectContext
          focusedProject={focusedProject}
          requestedProjectId={requestedProjectId}
          onOpenProject={(project) => navigate(`/projects/${encodeURIComponent(project.id)}`)}
        />

        {/* Search + tabs */}
        <div className="sk-bar">
          <div className="sk-search">
            <span style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter by name, id, or description"
              data-testid="cm-search"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-primary)', background: 'transparent', border: 0, outline: 'none' }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                title="clear"
              >×</button>
            )}
          </div>
          <div className="sk-tabs">
            {([
              ['all',       'all',       skills.length],
              ['installed', 'installed', installedCount],
              ['bound',     'bound',     boundSkillCount],
              ['official',  'official ✓', undefined],
              ['community', 'community', undefined],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key as Tab)}
                className={`sk-tab ${tab === key ? 'active' : ''}`}
                data-testid={`cm-tab-${key}`}
              >{label}{count !== undefined && <span>{count}</span>}</button>
            ))}
          </div>
          <button
            className="np-btn primary"
            type="button"
            onClick={openCreateSkill}
            data-testid="cm-create"
            style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem' }}
          >+ new skill</button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
          <StatTile label="installed"        value={installedCount} foot={<span>of {skills.length} known</span>} />
          <StatTile label="project bindings" tone="purple" value={activeBindings} foot={<span>across {Object.keys(projectSkills).length} projects</span>} />
          <StatTile label="cross-bound"      tone="green"  value={skills.filter((s) => bindingsFor(s.id).length > 1).length} foot={<span>used by 2+ projects</span>} />
        </div>

        {/* Main */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          {/* Grid */}
          <div style={{ minWidth: 0, overflowY: 'auto', paddingRight: '0.25rem' }}>
            <div className="sec-head">
              <span className="prompt">&gt;</span> skills
              <span className="count">— {filtered.length} of {skills.length}{search || tab !== 'all' ? ' (filtered)' : ''}</span>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                no skills match. {search && <button type="button" onClick={() => setSearch('')} style={{ background: 'transparent', border: 0, color: 'var(--neon-cyan)', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>clear search</button>}
              </div>
            ) : (
              <div className="sk-grid">
                {filtered.map((s) => (
                  <SkillCard
                    key={s.id}
                    s={s}
                    selected={s.id === selected.id}
                    onClick={() => setSelectedId(s.id)}
                    bindings={bindingsFor(s.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0, overflowY: 'auto' }}>
            <SkillDetail
              s={selected}
              bindings={bindingsFor(selected.id)}
              allProjects={bindingProjects}
              focusProjectId={focusedProject?.id}
              projectSkills={projectSkills}
              onToggleBinding={handleToggleBinding}
              onInstallToggle={handleInstallToggle}
              onDelete={requestDeleteSkill}
              onNotice={setNotice}
            />
          </div>
        </div>
      </div>

      {notice && <SkillNotice notice={notice} onDismiss={() => setNotice(null)} />}
      {createOpen && (
        <SkillCreateDialog
          form={createForm}
          error={createError}
          onChangeName={updateCreateName}
          onChange={(patch) => setCreateForm((cur) => ({ ...cur, ...patch }))}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateSkill}
        />
      )}
      {deleteCandidate && (
        <SkillDeleteDialog
          skill={deleteCandidate}
          error={deleteError}
          onClose={() => setDeleteCandidate(null)}
          onConfirm={confirmDeleteSkill}
        />
      )}

      <style>{skillsSettingsStyles}</style>
    </div>
  );
}

function SkillsProjectContext({ focusedProject, requestedProjectId, onOpenProject }: {
  focusedProject?: WBProject;
  requestedProjectId: string | null;
  onOpenProject: (project: WBProject) => void;
}) {
  if (focusedProject) {
    return (
      <div className="sk-project-context" data-testid="skills-project-context" data-project-id={focusedProject.id}>
        <span>Binding skills for</span>
        <strong>{focusedProject.emoji} {focusedProject.name}</strong>
        <button type="button" onClick={() => onOpenProject(focusedProject)}>back to project</button>
      </div>
    );
  }
  if (requestedProjectId) {
    return <div className="sk-project-context error" role="alert">Project context not found. Showing the full skills library.</div>;
  }
  return null;
}
