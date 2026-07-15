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

interface SkillCreateForm {
  name: string;
  id: string;
  emoji: string;
  description: string;
  idTouched: boolean;
}

function SkillNotice({ notice, onDismiss }: { notice: { message: string; tone: 'ok' | 'error' }; onDismiss: () => void }) {
  return (
    <div className={`sk-notice ${notice.tone}`} role="status" data-testid="cm-notice">
      <span>{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="dismiss notice">×</button>
    </div>
  );
}

function SkillCreateDialog({
  form,
  error,
  onChange,
  onChangeName,
  onClose,
  onSubmit,
}: {
  form: SkillCreateForm;
  error: string;
  onChange: (patch: Partial<SkillCreateForm>) => void;
  onChangeName: (name: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  return (
    <div className="sk-dialog-backdrop" role="presentation">
      <form className="sk-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-create-title" onSubmit={onSubmit}>
        <div className="sk-dialog-head">
          <div>
            <div id="cm-create-title" className="sk-dialog-title">New skill</div>
            <div className="sk-dialog-sub">Create a local skill entry for project binding.</div>
          </div>
          <button type="button" className="sk-icon-btn" onClick={onClose} aria-label="close">×</button>
        </div>

        <label className="sk-field">
          <span>Name</span>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="Inbox Cleaner"
            data-testid="cm-skill-name"
          />
        </label>

        <div className="sk-field-row">
          <label className="sk-field">
            <span>ID</span>
            <input
              value={form.id}
              onChange={(e) => onChange({ id: e.target.value, idTouched: true })}
              placeholder="inbox-cleaner"
              data-testid="cm-skill-id"
            />
          </label>
          <label className="sk-field sk-emoji-field">
            <span>Icon</span>
            <input
              value={form.emoji}
              onChange={(e) => onChange({ emoji: e.target.value })}
              data-testid="cm-skill-emoji"
              maxLength={8}
            />
          </label>
        </div>

        <label className="sk-field">
          <span>Description</span>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Clean incoming notes"
            data-testid="cm-skill-description"
          />
        </label>

        {error && <div className="sk-dialog-error" role="alert">{error}</div>}

        <div className="sk-dialog-actions">
          <button className="np-btn ghost" type="button" onClick={onClose}>cancel</button>
          <button className="np-btn primary" type="submit" data-testid="cm-create-submit">create skill</button>
        </div>
      </form>
    </div>
  );
}

function SkillDeleteDialog({ skill, error, onClose, onConfirm }: {
  skill: Skill;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="sk-dialog-backdrop" role="presentation">
      <div className="sk-dialog sk-confirm" role="dialog" aria-modal="true" aria-labelledby="cm-delete-title">
        <div className="sk-dialog-head">
          <div>
            <div id="cm-delete-title" className="sk-dialog-title">Delete skill?</div>
            <div className="sk-dialog-sub">All project bindings for this skill will be removed.</div>
          </div>
          <button type="button" className="sk-icon-btn" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="sk-confirm-card">
          <span>{skill.emoji}</span>
          <div>
            <div>{skill.name}</div>
            <code>{skill.id}</code>
          </div>
        </div>
        {error && <div className="sk-dialog-error" role="alert">{error}</div>}
        <div className="sk-dialog-actions">
          <button className="np-btn ghost" type="button" onClick={onClose}>cancel</button>
          <button className="np-btn ghost danger" type="button" onClick={() => { void onConfirm(); }} data-testid="cm-delete-confirm">delete</button>
        </div>
      </div>
    </div>
  );
}

function sourceColorFor(source: Skill['source']): string {
  return source === 'official' ? 'var(--neon-green)' : 'var(--neon-purple)';
}

function SkillCard({ s, selected, onClick, bindings }: { s: Skill; selected: boolean; onClick: () => void; bindings: WBProject[] }) {
  const color = sourceColorFor(s.source);
  return (
    <button className={`sk-card ${selected ? 'sel' : ''} ${!s.installed ? 'uninstalled' : ''}`} onClick={onClick} type="button">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.5rem', filter: s.installed ? `drop-shadow(0 0 10px ${color})` : 'grayscale(1) brightness(0.6)', flexShrink: 0, lineHeight: 1 }}>{s.emoji}</span>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="sk-card-name">{s.name}</span>
            {s.source === 'official' && <span className="sk-official">✓</span>}
          </div>
          <div className="sk-card-source" style={{ color }}>{s.source}</div>
        </div>
        <span className="sk-card-stars">⭐ {s.stars >= 1000 ? (s.stars / 1000).toFixed(1) + 'k' : s.stars}</span>
      </div>
      <div className="sk-card-desc">{s.description ?? ''}</div>
      <div className="sk-card-foot">
        {s.installed
          ? <span className="sk-installed">● installed</span>
          : <span className="sk-uninstalled">○ not installed</span>}
        {bindings.length > 0 && (
          <span className="sk-bindings">
            {bindings.slice(0, 4).map((p) => <span key={p.id} className="sk-binding-emoji" title={p.name}>{p.emoji}</span>)}
            {bindings.length > 4 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)', marginLeft: 3 }}>+{bindings.length - 4}</span>}
          </span>
        )}
      </div>
    </button>
  );
}

function SkillDetail({ s, bindings, allProjects, focusProjectId, projectSkills, onToggleBinding, onInstallToggle, onDelete, onNotice }: {
  s: Skill;
  bindings: WBProject[];
  allProjects: WBProject[];
  focusProjectId?: string;
  projectSkills: Record<string, string[]>;
  onToggleBinding: (projectId: string, skillId: string, enabled: boolean) => Promise<void>;
  onInstallToggle: (skill: Skill) => Promise<void>;
  onDelete: (skill: Skill) => void;
  onNotice: (notice: { message: string; tone: 'ok' | 'error' }) => void;
}) {
  const color = sourceColorFor(s.source);
  const navigate = useNavigate();
  function copyInstall() {
    const cmd = `sk install ${s.source === 'official' ? '' : s.source + '/'}${s.id}`;
    if (!navigator.clipboard?.writeText) {
      onNotice({ message: 'Clipboard is not available.', tone: 'error' });
      return;
    }
    void navigator.clipboard.writeText(cmd)
      .then(() => onNotice({ message: 'Install command copied', tone: 'ok' }))
      .catch((e) => onNotice({ message: e instanceof Error ? e.message : String(e), tone: 'error' }));
  }
  return (
    <>
      <div className="sk-detail-head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <span style={{ fontSize: '2.6rem', filter: `drop-shadow(0 0 18px ${color})`, lineHeight: 1, flexShrink: 0 }}>{s.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 16px rgba(0,255,242,0.4)', lineHeight: 1.2, margin: 0 }}>{s.name}</h3>
              {s.source === 'official' && <span className="sk-official">✓</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
              <span style={{ color, fontWeight: 600 }}>{s.source}</span> · ⭐ {s.stars.toLocaleString()} · {bindings.length} bindings
            </div>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.85rem' }}>{s.description ?? ''}</div>
        <SkillStatusSummary s={s} bindings={bindings} />
        <div className="install-cmd">
          <span className="install-prefix">$</span>
          <span className="install-text">sk install {s.source === 'official' ? '' : s.source + '/'}{s.id}</span>
          <button className="copy-btn" type="button" onClick={copyInstall} title="copy">📋</button>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
          {s.installed
            ? <button className="np-btn ghost"   type="button" onClick={() => { void onInstallToggle(s); }} style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}>uninstall</button>
            : <button className="np-btn primary" type="button" onClick={() => { void onInstallToggle(s); }} style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}>install</button>}
          <button
            className="np-btn ghost"
            type="button"
            onClick={() => { onDelete(s); }}
            data-testid="cm-delete"
            style={{ padding: '0.45rem 1rem', fontSize: '0.75rem', color: 'var(--neon-pink)', marginLeft: 'auto' }}
          >🗑 delete</button>
        </div>
      </div>

      <div className="surface" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.7rem' }}>
          <span className="prompt">&gt;</span> project bindings <span className="count">— {bindings.length}/{allProjects.length}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.7rem' }}>
          toggle to auto-load this skill when starting a session on that project.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {allProjects.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no projects yet</div>
          ) : allProjects.map((p) => {
            const bound = projectSkills[p.id]?.includes(s.id) ?? false;
            return (
              <button
                key={p.id}
                className={`sk-binding-row${p.id === focusProjectId ? ' focused' : ''}`}
                type="button"
                onClick={() => { void onToggleBinding(p.id, s.id, !bound); }}
                style={{ background: 'transparent', textAlign: 'left' }}
                data-testid={`skill-binding-${p.id}`}
                data-focused={p.id === focusProjectId ? 'true' : undefined}
              >
                <span style={{ fontSize: '1.05rem' }}>{p.emoji}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: bound ? 'var(--neon-cyan)' : 'var(--text-secondary)', fontWeight: bound ? 600 : 400 }}>{p.name}</span>
                {bound && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>last used {fmt.ago(p.lastTouched)}</span>}
                <span className={`kw-skill-toggle ${bound ? 'on' : ''}`}>
                  <span className="kw-skill-toggle-knob" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="surface" style={{ padding: '1rem' }}>
        <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
          <span className="prompt">&gt;</span> bound projects <span className="count">— {bindings.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bindings.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              not bound to any project. toggle a row above to bind.
            </div>
          ) : (
            bindings.map((p) => (
              <button key={p.id} type="button" onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 6, padding: '5px 8px', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: '0.95rem' }}>{p.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>last touched {fmt.ago(p.lastTouched)}</div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }}>open</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function SkillStatusSummary({ s, bindings }: { s: Skill; bindings: WBProject[] }) {
  return (
    <div className="sk-status-grid" data-testid="cm-status-summary">
      <div className="sk-status-card">
        <span>Availability</span>
        <strong>{s.installed ? 'installed' : 'not installed'}</strong>
        <em>available in local stash library</em>
      </div>
      <div className="sk-status-card">
        <span>Activation</span>
        <strong>{bindings.length} project{bindings.length === 1 ? '' : 's'}</strong>
        <em>bindings control session auto-load</em>
      </div>
      <div className="sk-status-card">
        <span>Source</span>
        <strong>{s.source}</strong>
        <em>{s.source === 'official' ? 'trusted starter content' : 'local community skill'}</em>
      </div>
    </div>
  );
}
