import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Decision, DecisionCandidateRecord, Lesson, Milestone, Skill } from '@stash/shared';
import {
  acceptDecisionCandidate,
  getDecisionCandidates,
  ignoreDecisionCandidate,
} from '../../api/agent-sessions';
import {
  createDecision,
  getProjectIntent,
  getProjectNotes,
  listDecisions,
  listLessons,
  listMilestones,
} from '../../api/project-knowledge';
import {
  KnowledgeDecisionsEditor,
  KnowledgeIntentEditor,
  KnowledgeLessonsEditor,
  KnowledgeMilestonesEditor,
  KnowledgeNotesEditor,
} from './project-detail.knowledge';
import { listProjectSkills, listSkills } from '../../api/skills';
import { CountUp } from '../../components/effects';
import { fmt, type WBData, type WBProject } from '../data';
import { reportAsyncError } from '../reportAsyncError';
import { LoadErrorPanel, ModelBadge, ProgressBar, SessionRow, StatusPill, Tile, Topbar, TodoItem, toError } from '../shared';
import { projectDetailStyles } from './project-detail.styles';

interface ProjectKnowledgeView {
  intent: string;
  milestones: Milestone[];
  decisions: Decision[];
  notes: string;
  lessons: Lesson[];
}

/**
 * The canonical home for one project.
 * Hero: project header + 3 KPI tiles + doing.
 * Main:  intent · milestones · decision log · notes · lessons (markdown).
 * Side:  skills (bound, toggleable) · features · todos · recent sessions.
 *
 * Data: real /api/projects/:id/{intent,milestones,decisions,notes,lessons} +
 * /api/projects/:id/skills.
 */
export function ProjectDetailPage({ data }: { data: WBData; reload: () => void }) {
  const { projects, todos, sessions } = data;
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const p = projectId ? projects.find((x) => x.id === projectId) : undefined;

  const [kb, setKb] = useState<ProjectKnowledgeView | null>(null);
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // SPEC v0.3 §3h — regex'd decision candidates from this project's recent sessions.
  const [candidates, setCandidates] = useState<DecisionCandidateRecord[]>([]);

  async function loadKb() {
    if (!p) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [intent, milestones, decisions, notes, lessons, bindings, allSkills] = await Promise.all([
        getProjectIntent(p.id),
        listMilestones(p.id),
        listDecisions(p.id),
        getProjectNotes(p.id),
        listLessons({ projectId: p.id }),
        listProjectSkills(p.id),
        listSkills(),
      ]);
      setKb({
        intent: intent?.text ?? '',
        milestones,
        decisions,
        notes: notes?.markdown ?? '',
        lessons,
      });
      const enabledIds = new Set(bindings.filter((b) => b.enabled).map((b) => b.skillId));
      setMySkills(allSkills.filter((s) => enabledIds.has(s.id)));
      setLoading(false);
    } catch (error) {
      reportAsyncError('load project knowledge', error);
      setLoadError(toError(error));
      setLoading(false);
    }
  }

  useEffect(() => { loadKb(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [p?.id, retryTick]);

  // Pull decision candidates from this project's most recent 3 sessions.
  useEffect(() => {
    if (!p) return;
    let cancelled = false;
    const projectSessions = sessions.filter((s) => s.project === p.id).slice(0, 3);
    if (projectSessions.length === 0) { setCandidates([]); return; }
    Promise.all(
      projectSessions.map((s) =>
        getDecisionCandidates(s.provider, s.id, p.id)
          .catch((error) => {
            reportAsyncError('load decision candidates', error);
            return [] as DecisionCandidateRecord[];
          }),
      ),
    ).then((all) => {
      if (cancelled) return;
      // Dedupe candidates by normalized title across sessions.
      const seen = new Set<string>();
      const flat = all.flat().filter((c) => {
        const key = c.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setCandidates(flat.slice(0, 5));
    });
    return () => { cancelled = true; };
  }, [p?.id, sessions]);

  async function acceptCandidate(c: DecisionCandidateRecord) {
    if (!p) return;
    try {
      const decision = await createDecision(p.id, {
        title: c.title,
        body: c.raw,
        sessionId: c.sessionId,
        date: c.timestamp.slice(0, 10),
      });
      await acceptDecisionCandidate(c.id, decision.id);
      setCandidates((cur) => cur.map((x) => (x.id === c.id ? { ...x, status: 'accepted', decisionId: decision.id } : x)));
      // Reload decisions so the new one appears in the log.
      const fresh = await listDecisions(p.id);
      setKb((cur) => (cur ? { ...cur, decisions: fresh } : cur));
    } catch (error) {
      reportAsyncError('accept decision candidate', error);
    }
  }

  async function rejectCandidate(c: DecisionCandidateRecord) {
    try {
      const ignored = await ignoreDecisionCandidate(c.id);
      setCandidates((cur) => cur.map((x) => (x.id === c.id ? ignored : x)));
    } catch (error) {
      reportAsyncError('ignore decision candidate', error);
    }
  }

  if (!p) {
    return (
      <div className="dashboard-canvas">
        <div className="inner" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="surface" style={{ padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Project not found. Return to Projects and choose an existing project.
          </div>
        </div>
      </div>
    );
  }

  const myTodos = todos.filter((t) => t.project === p.id);
  const mySessions = sessions.filter((s) => s.project === p.id);
  const primaryTodo = myTodos.find((t) => !t.done && t.status === 'active') ?? myTodos.find((t) => !t.done);

  if (loading) {
    return (
      <div className="dashboard-canvas">
        <div className="inner"><Topbar data={data} /><div style={{ padding: '3rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>loading project knowledge…</div></div>
      </div>
    );
  }
  if (loadError || !kb) {
    return (
      <div className="dashboard-canvas">
        <div className="inner">
          <Topbar data={data} />
          <LoadErrorPanel
            title="project knowledge failed to load"
            endpoint={`/api/projects/${p.id}/{intent,milestones,decisions,notes,lessons} + /api/projects/${p.id}/skills + /api/skills`}
            error={loadError ?? new Error('project knowledge returned no data')}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={data} />

        {/* Project hero */}
        <div className="kw-hero">
          <div className="kw-hero-row">
            <div className="kw-hero-identity">
              <span className="kw-hero-icon">{p.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="kw-crumb">
                  <button type="button" className="kw-crumb-link" onClick={() => navigate('/projects')}>projects</button>
                  &nbsp;/&nbsp; <span style={{ color: 'var(--neon-cyan)' }}>{p.name}</span>
                </div>
                <h2 className="kw-name">{p.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  <StatusPill status={p.status} />
                  <ModelBadge model={p.lastModel} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>last touched {fmt.ago(p.lastTouched)}</span>
                </div>
              </div>
            </div>
            <div className="kw-hero-actions">
              <button className="sd-action" type="button" onClick={() => navigate('/projects')} data-testid="kw-back-projects">← projects</button>
              <button className="sd-action" type="button" onClick={() => navigate(`/settings/skills?projectId=${encodeURIComponent(p.id)}`)} data-testid="kw-open-skills">🧩 skills</button>
              <button className="sd-action" type="button" onClick={() => primaryTodo && navigate(`/sessions/new?todoId=${encodeURIComponent(primaryTodo.id)}`)} disabled={!primaryTodo} data-testid="kw-start-session">▶ start session</button>
              <button className="sd-action" type="button" onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}/settings`)} data-testid="kw-project-settings">⚙ settings</button>
            </div>
          </div>

          <div className="kw-hero-stats">
            <div style={{ padding: '0.75rem 0.9rem', background: 'var(--bg-glass)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>overall progress</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
                  <CountUp to={p.progress} format={(n: number) => Math.round(n) + '%'} />
                </span>
              </div>
              <ProgressBar value={p.progress} fat />
            </div>
            <Tile k="estimated tokens" v={fmt.k(p.estimatedTokens)} c="var(--neon-cyan)" />
            <Tile k="estimated cost" v={'$' + p.estimatedCost.toFixed(2)} c="var(--neon-green)" />
          </div>

          <div className="pcard-doing" style={{ marginTop: '1rem', marginBottom: 0 }}>
            <span style={{ color: 'var(--text-primary)', marginRight: 6 }}>doing:</span>
            {p.doing}
          </div>
        </div>

        {/* Main body */}
        <div className="kw-main-grid">
          {/* LEFT — knowledge column */}
          <div className="kw-main-left">
            <KnowledgeIntentEditor      projectId={p.id} value={kb.intent}      onChange={loadKb} />
            <KnowledgeMilestonesEditor  projectId={p.id} value={kb.milestones}  onChange={loadKb} />
            <KnowledgeDecisionsEditor   projectId={p.id} value={kb.decisions}   onChange={loadKb} />
            <KnowledgeNotesEditor       projectId={p.id} value={kb.notes}       onChange={loadKb} />
            <KnowledgeLessonsEditor     projectId={p.id} value={kb.lessons}     onChange={loadKb} />
          </div>

          {/* RIGHT — sidebar */}
          <div className="kw-main-right">
            <div className="surface kw-skills">
              <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
                <span className="prompt">&gt;</span> 🧩 skills <span className="count">— {mySkills.length}</span>
                <button type="button" className="right link-button" onClick={() => navigate(`/settings/skills?projectId=${encodeURIComponent(p.id)}`)}>+ add</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {mySkills.map((s) => <SkillChip key={s.id} s={s} active />)}
              </div>
              <div style={{ marginTop: '0.6rem', padding: '0.55rem 0.7rem', background: 'rgba(0,255,242,0.04)', border: '1px dashed rgba(0,255,242,0.2)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--neon-cyan)' }}>ⓘ</span> when starting a session on this project, these skills auto-load.
              </div>
            </div>

            {/* SPEC v0.3 §3h — proposed decisions from recent sessions, accept/reject inline. */}
            {candidates.filter((c) => c.status === 'candidate').length > 0 && (
              <div className="surface">
                <div className="sec-head" style={{ marginBottom: '0.65rem' }}>
                  <span className="prompt">&gt;</span> 📜 proposed decisions
                  <span className="count">— from recent sessions</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {candidates.filter((c) => c.status === 'candidate').slice(0, 4).map((c) => (
                    <div key={c.id} style={{
                      padding: '0.55rem 0.7rem',
                      background: 'rgba(48,209,88,0.04)',
                      border: '1px solid rgba(48,209,88,0.18)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                        {c.title}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        {c.timestamp.slice(0, 10)} · {c.provider} session {c.sessionId.slice(-6)}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                        <button
                          type="button"
                          onClick={() => acceptCandidate(c)}
                          style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '2px 8px',
                            background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.4)',
                            color: 'var(--neon-green)', borderRadius: 4, cursor: 'pointer',
                          }}
                        >✓ accept</button>
                        <button
                          type="button"
                          onClick={() => rejectCandidate(c)}
                          style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '2px 8px',
                            background: 'transparent', border: '1px solid var(--border-hair)',
                            color: 'var(--text-muted)', borderRadius: 4, cursor: 'pointer',
                          }}
                        >✕ ignore</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <FeaturesSidebar p={p} />
            <TodosSidebar
              p={p}
              myTodos={myTodos}
              projects={projects}
              calendarDate={data.runtime.calendarDate}
            />
            <SessionsSidebar mySessions={mySessions} projects={projects} />
          </div>
        </div>
      </div>

      <style>{projectDetailStyles}</style>
    </div>
  );
}
// ─── Sidebar sub-sections ──────────────────────────────────────────────────

function FeaturesSidebar({ p }: { p: WBProject }) {
  return (
    <div className="surface">
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> features <span className="count">— {p.features.length}</span>
      </div>
      {p.features.length === 0
        ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>no features yet</div>
        : p.features.map((f) => (
          <div key={f.name} style={{ marginBottom: '0.5rem' }}>
            <div className="pbar-row" style={{ marginBottom: 3 }}>
              <div className="pbar-label"><span className={`feat-dot ${f.status}`} /> {f.name}</div>
              <div className="pbar-pct">{f.progress}%</div>
            </div>
            <ProgressBar value={f.progress} thin />
          </div>
        ))}
    </div>
  );
}

function TodosSidebar({
  myTodos,
  projects,
  calendarDate,
}: {
  p: WBProject;
  myTodos: WBData['todos'];
  projects: WBData['projects'];
  calendarDate: string;
}) {
  return (
    <div className="surface">
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> todos
        <span className="count">— {myTodos.filter((t) => !t.done).length} open</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {myTodos.length === 0
          ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none</div>
          : myTodos.map((t) => (
            <TodoItem
              key={t.id}
              t={t}
              projects={projects}
              calendarDate={calendarDate}
              showProject={false}
            />
          ))}
      </div>
    </div>
  );
}

function SessionsSidebar({ mySessions, projects }: { mySessions: WBData['sessions']; projects: WBData['projects'] }) {
  return (
    <div className="surface">
      <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
        <span className="prompt">&gt;</span> recent sessions <span className="count">— {mySessions.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {mySessions.length === 0
          ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>none</div>
          : mySessions.slice(0, 4).map((s) => <SessionRow key={s.id} s={s} projects={projects} compact />)}
      </div>
    </div>
  );
}

// ─── Knowledge primitives (Milestone / Decision / Lesson / SkillChip) ─────

function Milestone({ m, last }: { m: ProjectKnowledgeView['milestones'][number]; last: boolean }) {
  const color =
    m.status === 'done' ? 'var(--neon-green)' :
    m.status === 'wip' ? 'var(--neon-cyan)' :
    'var(--neon-purple)';
  return (
    <div className="kw-ms-row">
      <div className="kw-ms-dot" style={{ background: color, boxShadow: `0 0 12px ${color}` }}>
        {m.status === 'done' && <span style={{ color: 'var(--bg-void)', fontSize: '0.65rem', fontWeight: 700 }}>✓</span>}
      </div>
      {!last && <div className="kw-ms-line" />}
      <div className="kw-ms-body">
        <div className="kw-ms-head">
          <span className="kw-ms-name">{m.name}</span>
          <span className="kw-ms-date">{m.date}</span>
          <span className="kw-ms-pct" style={{ color }}>{m.progress}%</span>
        </div>
        <div className="pbar thin" style={{ marginTop: 5 }}>
          <div className="pbar-fill" style={{ width: m.progress + '%', background: color, boxShadow: `0 0 8px ${color}` }} />
        </div>
      </div>
    </div>
  );
}

function Decision({ d }: { d: ProjectKnowledgeView['decisions'][number] }) {
  return (
    <div className="kw-dec">
      <div className="kw-dec-head">
        <span className="kw-dec-date">{d.date}</span>
        <span className="kw-dec-title">{d.title}</span>
      </div>
      <div className="kw-dec-body">{d.body}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {d.tags.map((t) => <span key={t} className="kw-tag">#{t}</span>)}
      </div>
    </div>
  );
}

function Lesson({ l }: { l: ProjectKnowledgeView['lessons'][number] }) {
  return (
    <div className="kw-lesson">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <span style={{ color: 'var(--neon-purple)', fontSize: '0.9rem', filter: 'drop-shadow(0 0 8px var(--neon-purple))', flexShrink: 0, marginTop: 2 }}>💎</span>
        <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{l.title}</div>
        {l.cross && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--neon-cyan)', background: 'rgba(0,255,242,0.08)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap' }}>cross-proj</span>}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 6 }}>{l.body}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {l.tags.map((t) => <span key={t} className="kw-tag">#{t}</span>)}
      </div>
    </div>
  );
}

function SkillChip({ s, active }: { s: Skill; active: boolean }) {
  return (
    <div className="kw-skill">
      <span style={{ fontSize: '1.05rem', filter: active ? 'drop-shadow(0 0 6px var(--neon-cyan))' : 'grayscale(1) brightness(0.6)', transition: 'all 0.2s' }}>{s.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: active ? 'var(--neon-cyan)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.description ?? ''}</div>
      </div>
      <span className={`kw-skill-toggle ${active ? 'on' : ''}`} title={active ? 'active' : 'off'}>
        <span className="kw-skill-toggle-knob" />
      </span>
    </div>
  );
}

// ─── MarkdownLite (inline) ────────────────────────────────────────────────
// Ultra-light renderer: # h, ## h2, - list, `code`, paragraph.

function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let listBuf: React.ReactNode[] | null = null;
  const flushList = () => {
    if (listBuf) {
      out.push(<ul key={'l' + out.length} className="md-ul">{listBuf}</ul>);
      listBuf = null;
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) {
      flushList();
      out.push(<h3 key={i} className="md-h1">{renderInline(line.slice(2))}</h3>);
    } else if (line.startsWith('## ')) {
      flushList();
      out.push(<h4 key={i} className="md-h2">{renderInline(line.slice(3))}</h4>);
    } else if (line.startsWith('- ')) {
      listBuf = listBuf ?? [];
      listBuf.push(<li key={i}>{renderInline(line.slice(2))}</li>);
    } else if (line === '') {
      flushList();
    } else {
      flushList();
      out.push(<p key={i} className="md-p">{renderInline(line)}</p>);
    }
  });
  flushList();
  return <div className="md-body">{out}</div>;
}

function renderInline(s: string): React.ReactNode[] {
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith('`')
      ? <code key={i} className="md-code">{p.slice(1, -1)}</code>
      : <Fragment key={i}>{p}</Fragment>
  );
}
