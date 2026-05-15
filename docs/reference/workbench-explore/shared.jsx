// shared.jsx — small UI primitives used across concept artboards.

function Topbar({ subtitle, right }) {
  const { stats } = window.AppData;
  return (
    <div className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">🎯</span>
        <span className="topbar-title">workbench</span>
        <span className="topbar-tag">
          <Typewriter
            phrases={[
              '> 6 projects · 2 live sessions',
              '> 184k tokens spent today',
              '> $4.16 burn · $0.52/h',
              '> claude-code + codex monitor',
            ]}
            speed={45}
            pause={2200}
          />
        </span>
      </div>
      {right || (
        <div className="topbar-stats">
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              <CountUp to={stats.activeSessions} duration={1000} />
            </span>
            <span className="tb-stat-label"><LiveDot /> &nbsp; live</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              <CountUp to={stats.totalTokens24h} duration={1500} format={(n)=>window.fmt.k(Math.round(n))} />
            </span>
            <span className="tb-stat-label">tokens · 24h</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val gradient">
              <CountUp to={stats.totalCost24h} duration={1500} format={(n)=>'$'+n.toFixed(2)} />
            </span>
            <span className="tb-stat-label">cost · 24h</span>
          </div>
          <div className="tb-stat">
            <span className="tb-stat-val">{stats.todosOpen}<span style={{color:'var(--text-muted)',fontSize:'0.8rem',marginLeft:4}}>/{stats.todosOpen + stats.todosDone}</span></span>
            <span className="tb-stat-label">open todos</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, thin, fat }) {
  const cls = ['pbar', thin && 'thin', fat && 'fat'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="pbar-fill" style={{ width: value + '%' }} />
    </div>
  );
}

function ModelBadge({ model }) {
  const kind = model.startsWith('sonnet') ? 'sonnet'
            : model.startsWith('codex')  ? 'codex'
            : model.startsWith('haiku')  ? 'haiku'
            : model.startsWith('opus')   ? 'opus' : 'sonnet';
  return <span className={`model-badge ${kind}`}>● {model}</span>;
}

function ToolBadge({ tool }) {
  const label = tool === 'codex' ? 'CODEX' : 'CLAUDE-CODE';
  return <span className="tool-badge">{label}</span>;
}

function StatusPill({ status }) {
  const map = {
    active:   { txt: 'active',   dot: 'var(--neon-green)' },
    shipping: { txt: 'shipping', dot: 'var(--neon-orange)' },
    paused:   { txt: 'paused',   dot: 'var(--text-muted)' },
    fresh:    { txt: 'fresh',    dot: 'var(--neon-purple)' },
  };
  const s = map[status] || map.active;
  return (
    <span className={`pcard-status ${status}`}>
      <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:s.dot,boxShadow:`0 0 6px ${s.dot}`}}/>
      {s.txt}
    </span>
  );
}

function SessionRow({ s, compact }) {
  const proj = window.AppData.projects.find(p => p.id === s.project);
  const icon = s.tool === 'codex' ? '$' : '>';
  return (
    <div className={`sess ${s.state}`}>
      <div className="sess-icon" style={{color: s.tool === 'codex' ? 'var(--neon-purple)' : 'var(--neon-cyan)', fontFamily:'var(--font-mono)', fontWeight:700}}>{icon}</div>
      <div className="sess-body">
        <div className="sess-meta">
          <span className="sess-state {s.state}" style={{
            background: s.state === 'live' ? 'rgba(48,209,88,0.15)'
                      : s.state === 'idle' ? 'rgba(160,160,176,0.1)'
                      : s.state === 'error'? 'rgba(255,55,95,0.12)'
                      : 'rgba(0,255,242,0.08)',
            color: s.state === 'live' ? 'var(--neon-green)'
                 : s.state === 'idle' ? 'var(--text-muted)'
                 : s.state === 'error'? 'var(--neon-pink)'
                 : 'var(--neon-cyan)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '1px 6px',
            borderRadius: '4px'
          }}>
            {s.state === 'live' && <LiveDot color="var(--neon-green)" />} {s.state === 'live' ? ' live' : s.state}
          </span>
          <span>{proj?.emoji} {proj?.name}</span>
          <ModelBadge model={s.model} />
          <span style={{color:'var(--text-muted)'}}>· {window.fmt.ago(s.at)}</span>
        </div>
        <div className="sess-title">{s.title}</div>
        {!compact && <div className="sess-preview">{s.preview}</div>}
      </div>
      <div className="sess-right">
        <div className="sess-tokens">{window.fmt.k(s.tokens)}</div>
        <div className="sess-cost">${s.cost.toFixed(2)} · {window.fmt.dur(s.duration)}</div>
      </div>
    </div>
  );
}

function TodoItem({ t, showProject = true }) {
  const proj = window.AppData.projects.find(p => p.id === t.project);
  const isIdea = t.kind === 'idea';
  return (
    <div className={`todo ${t.done ? 'done' : ''} ${isIdea ? 'idea' : ''}`}>
      <div className="todo-check">
        {isIdea && !t.done && <span style={{fontSize:9,color:'var(--neon-purple)'}}>💡</span>}
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div className="todo-text">{t.text}</div>
        <div className="todo-tags">
          {showProject && proj && <span className="todo-tag proj">#{proj.name}</span>}
          {!proj && !t.done && <span className="todo-tag inbox">#inbox</span>}
          {t.tags.map(tag => <span key={tag} className="todo-tag">{tag}</span>)}
        </div>
      </div>
      {!t.done && <span className={`todo-prio ${t.priority}`}>{t.priority === 'high' ? '!!' : t.priority === 'med' ? '!' : '·'}</span>}
    </div>
  );
}

function FeatureRow({ f }) {
  return (
    <div className="feat-row">
      <div className="feat-name"><span className={`feat-dot ${f.status}`} /> {f.name}</div>
      <div className="feat-pct">{f.progress}%</div>
    </div>
  );
}

function ProjectCardFull({ p, onClick }) {
  return (
    <div className="pcard" onClick={onClick}>
      <div className="pcard-head">
        <div className="pcard-emoji">{p.emoji}</div>
        <div className="pcard-titles">
          <div className="pcard-name">{p.name}</div>
          <div className="pcard-branch">{p.branch}</div>
        </div>
        <StatusPill status={p.status} />
      </div>

      <div className="pcard-doing">{p.doing}</div>

      <div style={{marginBottom:'0.8rem'}}>
        <div className="pbar-row">
          <div className="pbar-label">overall</div>
          <div className="pbar-pct">{p.progress}%</div>
        </div>
        <ProgressBar value={p.progress} />
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {p.features.map(f => <FeatureRow key={f.name} f={f} />)}
      </div>

      <div className="pcard-foot">
        <span className="pcard-chip"><span className="chip-em">💬</span> <strong>{p.sessions}</strong> sessions</span>
        <span className="pcard-chip"><span className="chip-em">✓</span> <strong>{p.todoDone}</strong>/{p.todoCount + p.todoDone}</span>
        <span className="pcard-chip" style={{marginLeft:'auto'}}><ModelBadge model={p.lastModel} /></span>
      </div>
    </div>
  );
}

function StatTile({ label, value, foot, tone, format }) {
  const cls = `stat-tile ${tone || ''}`;
  return (
    <div className={cls}>
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">
        {typeof value === 'number'
          ? <CountUp to={value} duration={1200} format={format || ((n) => Math.round(n).toLocaleString())} />
          : value}
      </div>
      {foot && <div className="stat-tile-foot">{foot}</div>}
    </div>
  );
}

function Sparkline({ data }) {
  const max = Math.max(...data);
  return (
    <div className="spark">
      {data.map((v, i) => (
        <div
          key={i}
          className={`spark-bar ${i === data.length - 1 ? 'last' : ''}`}
          style={{ height: (v / max * 100) + '%' }}
        />
      ))}
    </div>
  );
}

Object.assign(window, {
  Topbar, ProgressBar, ModelBadge, ToolBadge, StatusPill,
  SessionRow, TodoItem, FeatureRow, ProjectCardFull, StatTile, Sparkline,
});
