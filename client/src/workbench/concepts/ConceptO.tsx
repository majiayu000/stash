import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DispatchRun, Skill, WorkItem } from '@stash/shared';
import { DEFAULT_MODEL_RATES } from '@stash/shared';
import { listProjectSkills, listSkills } from '../../api/skills';
import { closeDispatchRun, composeSession, listDispatchRuns, startSession, type DispatchResult } from '../../api/sessions';
import { getWorkItem } from '../../api/work-items';
import { ShinyText } from '../../components/effects';
import { useWorkbenchDialog } from '../../components/ui/workbench-dialogs';
import type { WBData } from '../data';
import { reportAsyncError } from '../reportAsyncError';
import { Topbar } from '../shared';

/**
 * Concept O — Start Session Dispatcher.
 * Modal over a dimmed canvas. Prompt textarea, project/tool/model pickers,
 * auto-loaded skills, context toggles, budget caps, footer with estimate.
 *
 * Data: real skills + project bindings via /api/skills + /api/projects/:id/skills.
 */
export function ConceptO({ data }: { data: WBData; reload: () => void }) {
  const { projects } = data;
  const navigate = useNavigate();
  const dialog = useWorkbenchDialog();
  const [searchParams] = useSearchParams();
  const todoId = searchParams.get('todoId');

  // If we arrived from ConceptL "▶ run with", pre-load the todo so we can use
  // its project + title as the starting prompt.
  const [todo, setTodo] = useState<WorkItem | null>(null);
  useEffect(() => {
    if (!todoId) { setTodo(null); return; }
    let cancelled = false;
    getWorkItem(todoId)
      .then((it) => { if (!cancelled) setTodo(it); })
      .catch((error) => {
        if (!cancelled) {
          setTodo(null);
          reportAsyncError('load dispatch todo', error);
        }
      });
    return () => { cancelled = true; };
  }, [todoId]);

  const selectedProject = (todo?.projectId && projects.find((p) => p.id === todo.projectId))
    || projects[0];
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [boundSkills, setBoundSkills] = useState<Skill[]>([]);
  const [tool, setTool] = useState<'claude' | 'codex'>('claude');
  const [dispatching, setDispatching] = useState(false);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [runs, setRuns] = useState<DispatchRun[]>([]);
  const [composedPrompt, setComposedPrompt] = useState<string>('');
  const [composing, setComposing] = useState(false);

  // Live preview — refetch composed prompt whenever the todo or tool changes.
  useEffect(() => {
    if (!todo) { setComposedPrompt(''); return; }
    let cancelled = false;
    setComposing(true);
    composeSession({ workItemId: todo.id, tool })
      .then((res) => { if (!cancelled) setComposedPrompt(res.prompt); })
      .catch((error) => {
        if (!cancelled) {
          setComposedPrompt('');
          reportAsyncError('compose dispatch prompt', error);
        }
      })
      .finally(() => { if (!cancelled) setComposing(false); });
    return () => { cancelled = true; };
  }, [todo?.id, tool]);

  useEffect(() => {
    if (!todo) { setRuns([]); return; }
    let cancelled = false;
    listDispatchRuns(todo.id)
      .then((next) => { if (!cancelled) setRuns(next); })
      .catch((error) => { if (!cancelled) reportAsyncError('load dispatch runs', error); });
    return () => { cancelled = true; };
  }, [todo?.id]);

  // Token estimate ≈ char/4. Cost ≈ tokens × input rate of the picked model
  // (assistant output adds ~1-2× more, but we don't predict that).
  const modelKey = tool === 'claude' ? 'claude-sonnet-4-6' : 'gpt-5';
  const inputRate = DEFAULT_MODEL_RATES.find((r) => r.model === modelKey)?.inputPerM ?? 0;
  const estTokens = Math.round(composedPrompt.length / 4);
  const estCostUsd = (estTokens / 1_000_000) * inputRate;

  async function dispatchNow() {
    if (!todo) {
      await dialog.alert({
        title: 'open this from a todo',
        description: 'Use "run with" from a todo, or launch through the stash CLI.',
      });
      return;
    }
    setDispatching(true);
    try {
      const res = await startSession({ workItemId: todo.id, tool });
      setResult(res);
      setRuns((cur) => [res.run, ...cur.filter((r) => r.id !== res.run.id)]);
    } catch (e) {
      await dialog.alert({ title: 'could not start session', description: e instanceof Error ? e.message : String(e), tone: 'danger' });
    } finally {
      setDispatching(false);
    }
  }

  async function copySuggestedCommand() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.suggestedCommand); } catch { /* fallback below */ }
  }

  useEffect(() => {
    let cancelled = false;
    listSkills().then((all) => { if (!cancelled) setAllSkills(all); }).catch((error) => {
      if (!cancelled) reportAsyncError('load skills', error);
    });
    if (!selectedProject) return;
    listProjectSkills(selectedProject.id)
      .then((bindings) => {
        if (cancelled) return;
        const enabledIds = new Set(bindings.filter((b) => b.enabled).map((b) => b.skillId));
        listSkills().then((all) => {
          if (cancelled) return;
          setBoundSkills(all.filter((s) => enabledIds.has(s.id)));
        }).catch((error) => { if (!cancelled) reportAsyncError('load bound skills', error); });
      })
      .catch((error) => { if (!cancelled) reportAsyncError('load project skill bindings', error); });
    return () => { cancelled = true; };
  }, [selectedProject?.id]);

  async function closeRun(run: DispatchRun) {
    try {
      const closed = await closeDispatchRun(run.id);
      setRuns((cur) => cur.map((r) => (r.id === closed.id ? closed : r)));
    } catch (error) {
      reportAsyncError('close dispatch run', error);
    }
  }

  return (
    <div className="dashboard-canvas" style={{ position: 'relative' }}>
      <div className="td-topbar-layer"><Topbar data={data} /></div>
      <div className="inner td-backdrop-preview" style={{ overflow: 'hidden', filter: 'blur(2px) brightness(0.5)', pointerEvents: 'none' }} />

      <div className="td-overlay">
        <div className="ss-modal">
          <div className="ss-modal-head">
            <span style={{ fontSize: '1.6rem', filter: 'drop-shadow(0 0 14px var(--neon-cyan))' }}>▶</span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>start session</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700 }}>
                <ShinyText>dispatch to agent</ShinyText>
              </div>
            </div>
            <button className="td-close" type="button" style={{ marginLeft: 'auto' }} onClick={() => navigate('/')}>✕</button>
          </div>

          <div className="ss-section">
            <label className="ss-label">
              prompt
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>· live preview of what the agent will receive</span>
            </label>
            <div className="ss-prompt" style={{ alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: 2 }}>$</span>
              <pre style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                lineHeight: 1.55,
                minHeight: 80,
                maxHeight: 280,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                margin: 0,
              }} data-testid="ss-prompt">
                {!todo
                  ? 'pick a project to start  ▎ open this page via "▶ run with" on a todo'
                  : composing && !composedPrompt
                    ? 'composing…'
                    : composedPrompt || '(empty)'}
              </pre>
            </div>
            <div className="ss-hint">
              <span style={{ color: 'var(--text-muted)' }}>
                {composedPrompt
                  ? `${composedPrompt.length} chars · ~${estTokens.toLocaleString()} tokens (≈ char/4)`
                  : 'no prompt yet'}
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                tool: <span style={{ color: 'var(--neon-cyan)' }}>{tool}</span>
              </span>
            </div>
          </div>

          <div className="ss-grid">
            <div className="ss-section">
              <label className="ss-label">project</label>
              <button className="ss-picker" type="button">
                <span style={{ fontSize: '1.1rem' }}>{selectedProject?.emoji ?? '·'}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="ss-picker-name">{selectedProject?.name ?? '(none)'}</div>
                  <div className="ss-picker-sub">{selectedProject?.id.slice(0, 12) ?? '—'}</div>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>▾</span>
              </button>
            </div>

            <div className="ss-section">
              <label className="ss-label">tool</label>
              <div className="ss-toolrow">
                <ToolBtn name="claude code" active={tool === 'claude'} glyph=">" color="var(--neon-cyan)"   onClick={() => setTool('claude')} />
                <ToolBtn name="codex"        active={tool === 'codex'}  glyph="$" color="var(--neon-purple)" onClick={() => setTool('codex')} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4 }}>
                runs <code>{tool}</code> with the prompt piped to stdin. model = CLI default.
              </div>
            </div>
          </div>

          <div className="ss-section">
            <label className="ss-label">
              auto-loaded skills
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>· bound to #{selectedProject?.name ?? 'inbox'} — edit in Concept M</span>
            </label>
            {boundSkills.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                no skills bound to this project. they'd surface in the prompt's <code>**Loaded skills**</code> section.
              </div>
            ) : (
              <div className="ss-skills">
                {boundSkills.map((s) => <SkillToggle key={s.id} s={s} on />)}
              </div>
            )}
          </div>

          {runs.length > 0 && (
            <div className="ss-section">
              <label className="ss-label">dispatch runs</label>
              <div className="ss-runs" data-testid="dispatch-runs">
                {runs.slice(0, 5).map((run) => (
                  <div key={run.id} className="ss-run">
                    <RunBadge status={run.status} />
                    <div className="ss-run-main">
                      <span>{run.provider}</span>
                      <code>{run.promptHash.slice(0, 10)}</code>
                      {run.pid !== undefined && <span>pid {run.pid}</span>}
                      {run.matchedSessionId && <span>matched {run.matchedSessionId.slice(-8)}</span>}
                      {run.error && <em>{run.error}</em>}
                    </div>
                    {run.status !== 'closed' && (
                      <button type="button" onClick={() => closeRun(run)}>close</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ss-foot">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {composedPrompt ? (
                <>
                  estimated input: <span style={{ color: 'var(--text-primary)' }}>~{estTokens.toLocaleString()} tokens · ${estCostUsd.toFixed(4)}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({modelKey})</span>
                </>
              ) : <>estimated: <span style={{ color: 'var(--text-muted)' }}>— pick a todo —</span></>}
              <span style={{ margin: '0 0.4rem' }}>·</span>
              auto-skill load: <span style={{ color: 'var(--neon-cyan)' }}>{boundSkills.length} of {allSkills.length}</span>
            </span>
            <span style={{ flex: 1 }} />
            <button className="np-btn ghost" type="button" onClick={() => navigate('/')}>cancel <kbd>esc</kbd></button>
            <button
              className="np-btn primary"
              type="button"
              onClick={dispatchNow}
              disabled={dispatching || !todo}
              data-testid="dispatch-now"
            >
              {dispatching ? 'dispatching…' : '▶ dispatch'} <kbd>⌘↵</kbd>
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="td-overlay" onClick={() => setResult(null)} role="presentation" style={{ zIndex: 1005 }}>
          <div className="ss-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="ss-modal-head">
              <span style={{ fontSize: '1.6rem', filter: 'drop-shadow(0 0 14px ' + (result.spawned ? 'var(--neon-green)' : 'var(--neon-orange)') + ')' }}>
                {result.spawned ? '✓' : '⚠'}
              </span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {result.spawned ? 'session started' : 'prompt composed (cli not spawned)'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700 }}>
                  {result.spawned ? <>pid <code>{result.pid}</code> · run <code>{result.run.status}</code></> : <>run <code>{result.run.status}</code> · copy + run manually</>}
                </div>
              </div>
              <button className="td-close" type="button" style={{ marginLeft: 'auto' }} onClick={() => setResult(null)}>✕</button>
            </div>
            <div className="ss-section">
              <label className="ss-label">composed prompt</label>
              <pre style={{
                background: 'var(--bg-void)', border: '1px solid var(--border-hair)', borderRadius: 8,
                padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                color: 'var(--text-primary)', maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap',
              }} data-testid="ss-result-prompt">{result.prompt}</pre>
            </div>
            <div className="ss-section">
              <label className="ss-label">run manually</label>
              <div className="ss-prompt" style={{ alignItems: 'center' }}>
                <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: 'var(--neon-cyan)' }}>{result.suggestedCommand}</code>
                <button
                  type="button"
                  onClick={copySuggestedCommand}
                  style={{ background: 'rgba(0,255,242,0.08)', border: '1px solid rgba(0,255,242,0.3)', color: 'var(--neon-cyan)', fontFamily: 'inherit', fontSize: '0.74rem', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}
                >📋 copy</button>
              </div>
              {result.spawnError && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--neon-orange)', marginTop: 6 }}>
                  spawn error: {result.spawnError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{conceptOStyles}</style>
    </div>
  );
}

function ToolBtn({ name, active, glyph, color, onClick, disabled }: {
  name: string;
  active?: boolean;
  glyph: string;
  color: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`ss-tool ${active ? 'active' : ''}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
    >
      <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem' }}>{glyph}</span>
      <span>{name}</span>
    </button>
  );
}

function SkillToggle({ s, on }: { s: Skill; on: boolean }) {
  return (
    <button className={`ss-skill ${on ? 'on' : ''}`} type="button">
      <span style={{ fontSize: '0.95rem', filter: on ? 'drop-shadow(0 0 6px var(--neon-cyan))' : 'grayscale(1) opacity(0.6)' }}>{s.emoji}</span>
      <span>{s.name}</span>
    </button>
  );
}

function RunBadge({ status }: { status: DispatchRun['status'] }) {
  const color =
    status === 'spawned' ? 'var(--neon-green)' :
    status === 'failed' ? 'var(--neon-orange)' :
    status === 'matched' ? 'var(--neon-cyan)' :
    status === 'closed' ? 'var(--text-muted)' :
    'var(--neon-purple)';
  return <span className="ss-run-badge" style={{ color, borderColor: color }}>{status}</span>;
}

const conceptOStyles = `
.ss-modal {
  width: min(820px, 100%);
  max-height: calc(100% - 2rem);
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-xl, 16px);
  box-shadow: var(--shadow-deep, 0 25px 50px rgba(0,0,0,0.6)), 0 0 50px rgba(0,255,242,0.2), inset 0 1px 0 rgba(255,255,255,0.06);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.3s var(--ease-smooth, ease);
}
.ss-modal-head {
  display: flex; align-items: center; gap: 0.85rem;
  padding: 1.1rem 1.3rem;
  border-bottom: 1px solid var(--border-subtle);
}
.ss-modal > * + * { padding-left: 1.3rem; padding-right: 1.3rem; }
.ss-section {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.ss-section + .ss-section, .ss-section + .ss-grid, .ss-grid + .ss-section, .ss-grid + .ss-grid {
  border-top: 1px solid var(--border-hair);
}
.ss-label {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.ss-prompt {
  display: flex; gap: 0.65rem; align-items: flex-start;
  padding: 0.85rem 1rem;
  background: var(--bg-void);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 25px rgba(0,255,242,0.04);
}
.ss-hint {
  display: flex; gap: 1rem; align-items: center;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.ss-hint kbd {
  font-family: var(--font-mono);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
  border: 1px solid rgba(0,255,242,0.2);
  padding: 0 5px;
  border-radius: 3px;
  margin-right: 4px;
}

.ss-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}
.ss-grid .ss-section { padding: 0; border: 0; }

.ss-picker, .ss-tool {
  display: flex; align-items: center; gap: 0.55rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  transition: all var(--transition-fast, 0.2s);
  text-align: left;
}
.ss-picker:hover, .ss-tool:hover { border-color: var(--border-glow); }
.ss-tool.active {
  background: rgba(0,255,242,0.06);
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
  box-shadow: 0 0 14px rgba(0,255,242,0.12);
}
.ss-picker-name { font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.ss-picker-sub  { font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-muted); margin-top: 1px; }
.ss-toolrow { display: grid; grid-template-columns: 1fr; gap: 0.4rem; }

.ss-skills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.ss-skill {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
}
.ss-skill.on {
  border-color: var(--neon-cyan);
  color: var(--neon-cyan);
  background: rgba(0,255,242,0.06);
}

.ss-runs {
  display: grid;
  gap: 0.45rem;
}
.ss-run {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border-hair);
  border-radius: 8px;
  background: rgba(255,255,255,0.025);
  font-family: var(--font-mono);
  font-size: 0.68rem;
}
.ss-run-badge {
  border: 1px solid;
  border-radius: 999px;
  padding: 1px 7px;
  text-transform: uppercase;
  font-weight: 700;
}
.ss-run-main {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-width: 0;
  color: var(--text-muted);
}
.ss-run-main code { color: var(--text-primary); }
.ss-run-main em {
  color: var(--neon-orange);
  font-style: normal;
  overflow-wrap: anywhere;
}
.ss-run button {
  border: 1px solid var(--border-hair);
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  padding: 2px 7px;
  font: inherit;
  cursor: pointer;
}

.ss-ctx-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.ss-ctx {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-hair);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
}
.ss-ctx:hover { border-color: var(--border-glow); }
.ss-ctx.on { border-color: rgba(0,255,242,0.25); background: rgba(0,255,242,0.03); }

.ss-budget {
  display: flex; align-items: baseline; gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
}
.ss-budget-prefix { color: var(--neon-green); font-weight: 700; font-size: 1.1rem; }
.ss-budget-value  { color: var(--text-primary); font-weight: 700; font-size: 1.1rem; flex: 1; }
.ss-budget-suffix { font-size: 0.66rem; color: var(--text-muted); }

.ss-foot {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.85rem 1.3rem;
  border-top: 1px solid var(--border-subtle);
  background: rgba(0,0,0,0.15);
  margin: 0 !important;
}
.ss-foot kbd {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  background: rgba(0,0,0,0.2);
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 4px;
}
`;
