import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Area, ReviewCadence } from '@stash/shared';
import { CountUp, ShinyText } from '../../components/effects';
import { createArea, deleteArea, listAreas, updateArea } from '../../api/areas';
import { fmt, type WBData, type WBProject } from '../data';
import { reportAsyncError } from '../reportAsyncError';
import { ProgressBar, Topbar } from '../shared';
import { slugify } from './conceptL.stubs';

/**
 * Concept F — New Project + Edit. Side-by-side: left = scaffold-new flow,
 * right = edit-existing settings.
 *
 * Backend coverage:
 *   - Real CRUD against /api/areas (name / description / reviewCadence).
 *   - Visual fields without persistence (features, tags, session sources,
 *     budgets) are labelled `(preview)` so the user knows they don't save.
 */
export function ConceptF({ data, reload }: { data: WBData; reload: () => void }) {
  const { projects } = data;
  const [searchParams] = useSearchParams();
  const requestedProjectId = searchParams.get('projectId');
  const [editingId, setEditingId] = useState<string>(projects[0]?.id ?? '');
  const [areas, setAreas] = useState<Area[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    listAreas().then(setAreas).catch((error) => {
      setAreas([]);
      reportAsyncError('load project areas', error);
    });
  }, [projects.length]);

  useEffect(() => {
    if (requestedProjectId && projects.some((p) => p.id === requestedProjectId)) {
      setEditingId(requestedProjectId);
    }
  }, [requestedProjectId, projects]);

  function flashMsg(m: string) {
    setFlash(m);
    setTimeout(() => setFlash(null), 1600);
  }

  const editTarget = projects.find((p) => p.id === editingId) ?? projects[0];
  const editArea = areas.find((a) => a.id === (editTarget?.id ?? ''));

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />
        {flash && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--neon-green)', marginBottom: 8 }}>
            {flash}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          <NewProjectPanel
            onCreated={(a) => {
              reload();
              setAreas((cur) => [...cur, a]);
              setEditingId(a.id);
              flashMsg(`✓ created #${a.name}`);
            }}
            onError={(msg) => flashMsg(`✕ ${msg}`)}
          />
          {editTarget && editArea ? (
            <EditProjectPanel
              key={editArea.id}
              p={editTarget}
              area={editArea}
              allProjects={projects}
              onPick={setEditingId}
              onSaved={(a) => {
                setAreas((cur) => cur.map((x) => (x.id === a.id ? a : x)));
                reload();
                flashMsg('✓ saved');
              }}
              onDeleted={(id) => {
                setAreas((cur) => cur.filter((x) => x.id !== id));
                const next = projects.find((p) => p.id !== id);
                setEditingId(next?.id ?? '');
                reload();
                flashMsg('✕ deleted');
              }}
              onError={(msg) => flashMsg(`✕ ${msg}`)}
            />
          ) : (
            <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
              no existing projects to edit — scaffold one from the left.
            </div>
          )}
        </div>
      </div>
      <style>{conceptFStyles}</style>
    </div>
  );
}

function NewProjectPanel({ onCreated, onError }: {
  onCreated: (a: Area) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('🚀');
  const [cadence, setCadence] = useState<ReviewCadence>('weekly');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const n = name.trim();
    if (!n) { onError('name is required'); return; }
    setSubmitting(true);
    try {
      const a = await createArea({
        name: n,
        description: description.trim() || undefined,
        emoji: emoji.trim() || undefined,
        reviewCadence: cadence,
      });
      setName('');
      setDescription('');
      setEmoji('🚀');
      setCadence('weekly');
      onCreated(a);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function clear() {
    setName('');
    setDescription('');
    setEmoji('🚀');
    setCadence('weekly');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div className="sec-head" style={{ marginBottom: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span className="prompt">&gt;</span> new project flow
        <span className="right" style={{ whiteSpace: 'nowrap' }}>persists to /api/areas</span>
      </div>

      <div className="np-modal">
        <div className="np-header">
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>new project</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 18px rgba(0,255,242,0.4)', marginTop: 2, whiteSpace: 'nowrap' }}>
              <ShinyText>scaffold a project</ShinyText>
            </div>
          </div>
          <button className="np-close" type="button" onClick={clear} title="clear form">✕</button>
        </div>

        <div className="np-field">
          <label>name</label>
          <div className="np-input">
            <EmojiPicker value={emoji} onPick={setEmoji} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
              placeholder="spectre-sdk"
              data-testid="cf-name"
              style={{ flex: 1, background: 'transparent', border: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', outline: 'none' }}
            />
          </div>
          <div className="np-hint">used as <code>#{slugify(name) || 'project'}</code> in todos · stored verbatim in the areas table</div>
        </div>

        <div className="np-field">
          <label>description <span className="np-hint inline">— optional one-liner</span></label>
          <div className="np-input">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="what is this project trying to do?"
              data-testid="cf-desc"
              style={{ flex: 1, background: 'transparent', border: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', outline: 'none' }}
            />
          </div>
        </div>

        <div className="np-field">
          <label>review cadence</label>
          <div className="np-tools-row">
            {(['daily', 'weekly', 'monthly', 'ad_hoc'] as ReviewCadence[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCadence(c)}
                className={`np-tool ${cadence === c ? 'on' : ''}`}
                data-testid={`cf-cadence-${c}`}
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                <span>{cadence === c ? '●' : '○'}</span> {c.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="np-field" style={{ opacity: 0.55 }}>
          <label>seed features <span className="np-hint inline">— preview, not persisted yet</span></label>
          <div className="np-feat-list">
            {['type generation', 'event bus', 'docs'].map((n) => (
              <div key={n} className="np-feat-row">
                <span className="feat-dot todo" />
                <span className="np-feat-name">{n}</span>
                <button className="np-feat-x" type="button" disabled>×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="np-field" style={{ opacity: 0.55 }}>
          <label>watch sessions from <span className="np-hint inline">— auto-discovered, not editable here</span></label>
          <div className="np-tools-row">
            <span className="np-tool on"><span>●</span> claude code</span>
            <span className="np-tool on"><span>●</span> codex</span>
          </div>
        </div>

        <div className="np-actions">
          <button className="np-btn ghost" type="button" onClick={clear}>cancel <kbd>esc</kbd></button>
          <button
            className="np-btn primary"
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim()}
            data-testid="cf-scaffold"
            style={{ opacity: submitting || !name.trim() ? 0.6 : 1, cursor: submitting || !name.trim() ? 'default' : 'pointer' }}
          >{submitting ? 'scaffolding…' : 'scaffold'} <kbd>⌘↵</kbd></button>
        </div>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.6rem 0.8rem', background: 'var(--bg-glass)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
        <span style={{ color: 'var(--neon-cyan)' }}>$</span>{' '}
        <span style={{ color: 'var(--neon-green)' }}>stash new {slugify(name) || 'spectre-sdk'} {description ? `--desc "${description.slice(0, 30)}"` : ''}</span>
        <span style={{ color: 'var(--text-muted)' }}> # CLI equivalent</span>
      </div>
    </div>
  );
}

function EditProjectPanel({ p, area, allProjects, onPick, onSaved, onDeleted, onError }: {
  p: WBProject;
  area: Area;
  allProjects: WBProject[];
  onPick: (id: string) => void;
  onSaved: (a: Area) => void;
  onDeleted: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(area.name);
  const [description, setDescription] = useState(area.description ?? '');
  const [emoji, setEmoji] = useState(area.emoji ?? '');
  const [cadence, setCadence] = useState<ReviewCadence>(area.reviewCadence);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== area.name ||
    (description || undefined) !== (area.description || undefined) ||
    (emoji || undefined) !== (area.emoji || undefined) ||
    cadence !== area.reviewCadence;

  const featPct = p.features.length === 0 ? [{ name: '(no features)', status: 'todo' as const, progress: 0 }] : p.features;
  const tokenCap = Math.max(500_000, p.tokens24h * 5);
  const costCap = Math.max(10, p.cost24h * 5);

  async function save() {
    if (!dirty) return;
    const trimmed = name.trim();
    if (!trimmed) { onError('name is required'); return; }
    setSaving(true);
    try {
      const updated = await updateArea(area.id, {
        name: trimmed,
        description: description.trim() || undefined,
        emoji: emoji.trim() || undefined,
        reviewCadence: cadence,
      });
      onSaved(updated);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`delete project #${area.name}? todos inside will be unlinked (not removed).`)) return;
    try {
      await deleteArea(area.id);
      onDeleted(area.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  function reset() {
    setName(area.name);
    setDescription(area.description ?? '');
    setEmoji(area.emoji ?? '');
    setCadence(area.reviewCadence);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
      <div className="sec-head" style={{ marginBottom: 0, display: 'flex', gap: '0.5rem', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span className="prompt">&gt;</span> edit project ·
        <select
          value={area.id}
          onChange={(e) => onPick(e.target.value)}
          data-testid="cf-pick"
          style={{ background: 'transparent', border: 0, color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', cursor: 'pointer', flex: 1, minWidth: 0, textOverflow: 'ellipsis' }}
        >
          {allProjects.map((proj) => (
            <option key={proj.id} value={proj.id}>#{proj.name}</option>
          ))}
        </select>
      </div>

      <div className="surface">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '2rem', filter: 'drop-shadow(0 0 14px var(--neon-cyan))' }}>{emoji || p.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--neon-cyan)' }}>{area.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{area.id.slice(0, 12)}… · created {area.createdAt.slice(0, 10)}</div>
          </div>
          <button className="np-btn ghost small danger" type="button" onClick={remove} data-testid="cf-delete">delete</button>
        </div>

        <div className="ep-section">
          <label>emoji</label>
          <div className="np-input" style={{ gap: 8 }}>
            <EmojiPicker value={emoji || area.emoji || p.emoji} onPick={setEmoji} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {emoji ? 'custom' : area.emoji ? 'persisted' : 'auto (from id hash) — pick to persist'}
            </span>
          </div>
        </div>

        <div className="ep-section">
          <label>name</label>
          <div className="np-input">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="cf-edit-name"
              style={{ flex: 1, background: 'transparent', border: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', outline: 'none' }}
            />
          </div>
        </div>

        <div className="ep-section">
          <label>description</label>
          <div className="np-input">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="what is this project trying to do?"
              data-testid="cf-edit-desc"
              style={{ flex: 1, background: 'transparent', border: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', outline: 'none' }}
            />
          </div>
        </div>

        <div className="ep-section">
          <label>review cadence</label>
          <div className="np-tools-row">
            {(['daily', 'weekly', 'monthly', 'ad_hoc'] as ReviewCadence[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCadence(c)}
                className={`np-tool ${cadence === c ? 'on' : ''}`}
                data-testid={`cf-edit-cadence-${c}`}
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                <span>{cadence === c ? '●' : '○'}</span> {c.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="ep-section" style={{ opacity: 0.55 }}>
          <label>features <span className="np-hint inline">— preview, edited via ConceptK</span></label>
          <div className="np-feat-list">
            {featPct.map((f) => (
              <div key={f.name} className="np-feat-row editable">
                <span className={`feat-dot ${f.status}`} />
                <span className="np-feat-name">{f.name}</span>
                <div style={{ flex: 1 }}>
                  <ProgressBar value={f.progress} thin />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>{f.progress}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ep-section" style={{ opacity: 0.55 }}>
          <label>session sources <span className="np-hint inline">— auto-discovered</span></label>
          <div className="np-tools-row">
            <span className="np-tool on"><span>●</span> claude code <span style={{ color: 'var(--text-muted)' }}>· {Math.max(0, p.sessions - 2)} sessions</span></span>
            <span className="np-tool on"><span>●</span> codex <span style={{ color: 'var(--text-muted)' }}>· {Math.min(p.sessions, 2)} sessions</span></span>
          </div>
        </div>

        <div className="ep-section" style={{ opacity: 0.55 }}>
          <label>budget · 24h <span className="np-hint inline">— set in ConceptH</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div className="ep-budget">
              <span className="ep-budget-label">token cap</span>
              <span className="ep-budget-val"><CountUp to={tokenCap} format={(n: number) => fmt.k(Math.round(n))} /></span>
            </div>
            <div className="ep-budget">
              <span className="ep-budget-label">cost cap</span>
              <span className="ep-budget-val">${costCap.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="np-actions" style={{ marginTop: '1rem' }}>
          <button className="np-btn ghost" type="button" onClick={reset} disabled={!dirty || saving}>cancel</button>
          <button
            className="np-btn primary"
            type="button"
            onClick={save}
            disabled={!dirty || saving || !name.trim()}
            data-testid="cf-save"
            style={{ opacity: !dirty || saving ? 0.6 : 1, cursor: !dirty || saving ? 'default' : 'pointer' }}
          >{saving ? 'saving…' : 'save changes'}</button>
        </div>
      </div>
    </div>
  );
}

const PROJECT_EMOJI_OPTIONS = ['🌌', '🎨', '🤖', '🧭', '📚', '👻', '🔮', '⚡', '🚀', '🛸', '🎯', '📦', '🧪', '🔥', '💎', '🪄'];

function EmojiPicker({ value, onPick }: { value: string; onPick: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="np-emoji-pick"
        style={{ border: 0, cursor: 'pointer' }}
        data-testid="cf-emoji-trigger"
        aria-label="pick emoji"
      >{value || '·'}</button>
      {open && (
        <div
          role="dialog"
          aria-label="emoji picker"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius-md)',
            padding: '0.4rem', zIndex: 20,
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', gap: 6,
            minWidth: 220,
          }}
          onMouseLeave={() => setOpen(false)}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
            {PROJECT_EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { onPick(e); setOpen(false); }}
                style={{
                  background: value === e ? 'rgba(0,255,242,0.15)' : 'transparent',
                  border: '1px solid ' + (value === e ? 'var(--neon-cyan)' : 'transparent'),
                  borderRadius: 4, padding: 4, fontSize: '1.1rem', cursor: 'pointer',
                }}
                data-testid={`cf-emoji-${e}`}
              >{e}</button>
            ))}
          </div>
          <input
            value={value}
            onChange={(ev) => onPick(ev.target.value.slice(0, 4))}
            placeholder="custom (paste any emoji)"
            data-testid="cf-emoji-custom"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              padding: '4px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}

const conceptFStyles = `
.np-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl, 16px);
  padding: 1.5rem;
  box-shadow: var(--shadow-deep, 0 25px 50px rgba(0,0,0,0.6)), 0 0 50px rgba(0,255,242,0.15), inset 0 1px 0 rgba(255,255,255,0.08);
  display: flex; flex-direction: column; gap: 1rem;
  position: relative;
}
.np-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.np-close {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  width: 30px; height: 30px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
}
.np-close:hover { border-color: var(--neon-pink); color: var(--neon-pink); }

.np-field { display: flex; flex-direction: column; gap: 0.5rem; }
.np-field > label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.np-hint {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}
.np-hint.inline { margin-left: 0.4rem; }
.np-hint code {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
  padding: 1px 5px;
  border-radius: 3px;
}

.np-input {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.75rem 0.9rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 20px rgba(0,255,242,0.04);
}
.np-emoji-pick { font-size: 1.2rem; cursor: pointer; padding: 2px 6px; border-radius: 4px; background: var(--bg-elevated); }
.np-input-text { flex: 1; font-family: var(--font-mono); font-size: 0.95rem; color: var(--text-primary); }

.np-feat-list { display: flex; flex-direction: column; gap: 0.35rem; }
.np-feat-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
}
.np-feat-row.editable { padding-right: 0.4rem; }
.np-feat-name { flex: 1; font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-primary); }
.np-feat-x { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.95rem; padding: 0 4px; }
.np-feat-x:hover { color: var(--neon-pink); }

.np-tools-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.np-tool {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  color: var(--text-muted);
  background: var(--bg-glass);
  transition: all var(--transition-fast, 0.2s);
}
.np-tool.on { border-color: var(--border-glow); color: var(--neon-cyan); background: rgba(0,255,242,0.05); }
.np-tool span { font-size: 0.65rem; }

.np-actions {
  display: flex; gap: 0.5rem; justify-content: flex-end;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-hair);
}
.np-btn.small { padding: 0.35rem 0.7rem; font-size: 0.7rem; }
.np-btn kbd {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  padding: 1px 5px;
  background: rgba(0,0,0,0.25);
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.1);
}
.np-btn.ghost kbd { background: var(--bg-elevated); color: var(--text-muted); border-color: var(--border-subtle); }

.ep-section { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.ep-section > label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.ep-budget {
  padding: 0.55rem 0.7rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-sm);
  display: flex; flex-direction: column;
}
.ep-budget-label {
  font-family: var(--font-mono); font-size: 0.65rem;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;
}
.ep-budget-val {
  font-family: var(--font-mono); font-size: 1.1rem;
  color: var(--neon-cyan); font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
`;
