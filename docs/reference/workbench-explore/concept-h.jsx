// concept-h.jsx — Cost & burn analytics. Deep dive on token + $ spend.
// Trends, per-model donut, per-project leaderboard, hourly heatmap, budgets.

function ConceptH() {
  const { projects, modelMix } = window.AppData;

  // Mock daily spend last 30 days
  const dailySpend = [
    1.2, 0.8, 1.5, 0.4, 2.1, 1.7, 1.3, 0.9, 2.8, 3.2, 2.6, 1.9, 0.6, 1.4, 2.0,
    1.8, 2.4, 3.1, 2.7, 1.5, 0.9, 2.2, 3.5, 4.0, 3.7, 2.9, 4.2, 4.1, 3.8, 4.16,
  ];
  const monthTotal = dailySpend.reduce((a, b) => a + b, 0);
  const lastWeek = dailySpend.slice(-7).reduce((a, b) => a + b, 0);
  const prevWeek = dailySpend.slice(-14, -7).reduce((a, b) => a + b, 0);
  const wow = ((lastWeek - prevWeek) / prevWeek * 100);

  // Hourly heatmap 7d × 24h
  const hours = Array.from({ length: 7 * 24 }, (_, i) => {
    const h = i % 24;
    // workdays daytime busy
    const day = Math.floor(i / 24);
    const work = h >= 9 && h <= 22;
    const weekend = day >= 5;
    const base = work ? (weekend ? 0.3 : 0.8) : 0.1;
    return Math.max(0, base + (Math.random() - 0.5) * 0.4);
  });

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{overflow:'hidden', height:'100%'}}>
        <Topbar />

        {/* Top kpis */}
        <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr 1fr', gap:'1rem', marginBottom:'1.25rem'}}>
          <div className="surface" style={{padding:'1.2rem 1.4rem'}}>
            <div className="stat-tile-label">this month · spend</div>
            <div style={{display:'flex',alignItems:'baseline',gap:'0.6rem',marginTop:'0.4rem'}}>
              <div style={{fontFamily:'var(--font-mono)',fontSize:'2.6rem',fontWeight:700,background:'var(--gradient-primary)',WebkitBackgroundClip:'text',backgroundClip:'text',WebkitTextFillColor:'transparent',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>
                <CountUp to={monthTotal} duration={1400} format={n=>'$'+n.toFixed(2)} />
              </div>
              <span style={{fontFamily:'var(--font-mono)',fontSize:'0.85rem',color: wow > 0 ? 'var(--neon-pink)' : 'var(--neon-green)'}}>
                {wow > 0 ? '↑' : '↓'} {Math.abs(wow).toFixed(0)}% w/w
              </span>
            </div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'0.4rem'}}>
              projected month: <span style={{color:'var(--neon-orange)'}}>$84.20</span> · budget <span style={{color:'var(--text-secondary)'}}>$100.00</span>
            </div>
            {/* monthly burn vs budget */}
            <div style={{height:6,background:'var(--bg-elevated)',borderRadius:3,overflow:'hidden',marginTop:'0.5rem',position:'relative'}}>
              <div style={{width: (monthTotal/100*100)+'%', height:'100%', background:'var(--gradient-primary)', boxShadow:'0 0 12px var(--neon-cyan)'}}/>
              <div style={{position:'absolute',top:-4,left:'84%',width:1,height:14,background:'var(--neon-orange)'}}/>
            </div>
          </div>

          <StatTile label="tokens · 7d" tone="purple" value={1_240_310} format={n=>window.fmt.k(Math.round(n))} foot={<span><span className="up">↑ 18%</span> vs prior 7d</span>} />
          <StatTile label="cost · 24h" tone="green" value={4.16} format={n=>'$'+n.toFixed(2)} foot={<span>burn rate <span className="up">$0.52/hr</span></span>} />
          <StatTile label="avg session" tone="orange" value={14_230} format={n=>window.fmt.k(Math.round(n))+' tok'} foot={<span>median <span className="up">$0.19</span></span>} />
        </div>

        {/* Charts grid */}
        <div style={{display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:'1.25rem', flex:1, minHeight:0}}>
          <div style={{display:'flex',flexDirection:'column',gap:'1rem',minHeight:0,overflowY:'auto'}}>
            {/* Daily spend chart */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.8rem'}}>
                <span className="prompt">&gt;</span> daily spend <span className="count">— last 30 days</span>
                <span className="right">$ usd</span>
              </div>
              <DailySpendChart data={dailySpend} />
            </div>

            {/* Per-project leaderboard */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.8rem'}}>
                <span className="prompt">&gt;</span> per-project · 24h
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                {[...projects].sort((a, b) => b.tokens24h - a.tokens24h).map((p, i) => {
                  const maxT = Math.max(...projects.map(p => p.tokens24h));
                  return (
                    <div key={p.id} style={{display:'grid',gridTemplateColumns:'24px 130px 1fr 80px 60px',alignItems:'center',gap:'0.6rem'}}>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'0.74rem',color: i===0?'var(--neon-orange)':i===1?'var(--text-secondary)':i===2?'#cd7f32':'var(--text-muted)',fontWeight:700,textAlign:'center'}}>
                        {i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}
                      </span>
                      <span style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:'0.8rem',color:'var(--neon-cyan)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        <span>{p.emoji}</span>{p.name}
                      </span>
                      <div className="pbar"><div className="pbar-fill" style={{width: (p.tokens24h/maxT*100)+'%'}}/></div>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--text-primary)',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{window.fmt.k(p.tokens24h)}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'0.74rem',color:'var(--neon-green)',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>${p.cost24h.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hourly heatmap */}
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.8rem'}}>
                <span className="prompt">&gt;</span> activity heatmap <span className="count">— last 7 days, hourly</span>
              </div>
              <Heatmap data={hours} />
            </div>
          </div>

          {/* Right column: donut + budgets + alerts */}
          <div style={{display:'flex',flexDirection:'column',gap:'1rem',minHeight:0,overflowY:'auto'}}>
            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.8rem'}}>
                <span className="prompt">&gt;</span> by model · 7d
              </div>
              <ModelDonut />
              <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:'1rem'}}>
                {[
                  { name: 'sonnet-4.5', pct: 58, cost: '$22.40', tokens: '720k', color: 'var(--neon-cyan)' },
                  { name: 'codex-1', pct: 26, cost: '$10.05', tokens: '320k', color: 'var(--neon-purple)' },
                  { name: 'haiku-4.5', pct: 16, cost: '$2.10', tokens: '200k', color: 'var(--neon-green)' },
                ].map(m => (
                  <div key={m.name} style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto',alignItems:'center',gap:'0.5rem',fontFamily:'var(--font-mono)',fontSize:'0.76rem'}}>
                    <span style={{color:m.color}}>●</span>
                    <span style={{color:'var(--text-primary)'}}>{m.name}</span>
                    <span style={{color:'var(--text-muted)'}}>{m.tokens}</span>
                    <span style={{color:m.color,fontWeight:600}}>{m.cost}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.8rem'}}>
                <span className="prompt">&gt;</span> budgets
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.7rem'}}>
                <BudgetRow scope="aurora-api" used={2.41} cap={5} color="var(--neon-cyan)" />
                <BudgetRow scope="pixel-studio" used={1.32} cap={3} color="var(--neon-purple)" />
                <BudgetRow scope="terra-cli" used={0.94} cap={3} color="var(--neon-green)" />
                <BudgetRow scope="monthly · all" used={monthTotal} cap={100} color="var(--neon-orange)" />
              </div>
            </div>

            <div className="surface">
              <div className="sec-head" style={{marginBottom:'0.6rem'}}>
                <span className="prompt">&gt;</span> alerts <span className="count">— 2</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <AlertItem tone="orange" text="aurora · 24h budget at 48% — projected to hit cap by 7pm" />
                <AlertItem tone="pink"   text="pixel · session crashed on layer #312 (recursive svg mask)" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{conceptHStyles}</style>
    </div>
  );
}

function DailySpendChart({ data }) {
  const w = 100;
  const max = Math.max(...data);
  return (
    <div className="dsc">
      <div className="dsc-bars">
        {data.map((v, i) => {
          const isToday = i === data.length - 1;
          const isWeekend = false; // simplification
          return (
            <div key={i} className={`dsc-bar ${isToday?'today':''}`} style={{height: (v/max*100)+'%'}} title={'$'+v.toFixed(2)}>
              <span className="dsc-bar-label">${v.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
      <div className="dsc-axis">
        <span>−30d</span><span>−20d</span><span>−10d</span><span style={{color:'var(--neon-cyan)'}}>today</span>
      </div>
    </div>
  );
}

function ModelDonut() {
  const segs = [
    { label: 'sonnet', pct: 58, color: '#00fff2' },
    { label: 'codex', pct: 26, color: '#bf5af2' },
    { label: 'haiku', pct: 16, color: '#30d158' },
  ];
  const R = 56, C = 70;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{display:'flex',justifyContent:'center',position:'relative'}}>
      <svg width={C*2} height={C*2}>
        {segs.map((s, i) => {
          const len = circ * s.pct / 100;
          const seg = <circle key={i} cx={C} cy={C} r={R} fill="none"
            stroke={s.color} strokeWidth="16"
            strokeDasharray={`${len} ${circ}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${C} ${C})`}
            style={{filter: `drop-shadow(0 0 8px ${s.color})`}}
          />;
          offset += len;
          return seg;
        })}
      </svg>
      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center'}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'1.3rem',fontWeight:700,color:'var(--text-primary)',lineHeight:1}}>1.24M</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',color:'var(--text-muted)',marginTop:2,textTransform:'uppercase',letterSpacing:'0.06em'}}>tokens · 7d</div>
      </div>
    </div>
  );
}

function Heatmap({ data }) {
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  return (
    <div className="hm">
      <div className="hm-rows">
        {days.map((d, di) => (
          <div key={d} className="hm-row">
            <span className="hm-day">{d}</span>
            <div className="hm-cells">
              {Array.from({length:24}).map((_, hi) => {
                const v = data[di*24 + hi];
                const op = Math.min(1, v);
                return <div key={hi} className="hm-cell" style={{background: `rgba(0,255,242,${op})`, boxShadow: op > 0.6 ? '0 0 8px rgba(0,255,242,0.4)' : 'none'}} title={`${d} ${hi}:00 — ${(v*120).toFixed(0)} tok`}/>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="hm-axis">
        <span></span>
        <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
      </div>
    </div>
  );
}

function BudgetRow({ scope, used, cap, color }) {
  const pct = used / cap * 100;
  const over = pct > 100;
  const warn = pct > 75;
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontFamily:'var(--font-mono)',fontSize:'0.74rem'}}>
        <span style={{color:'var(--text-secondary)'}}>{scope}</span>
        <span style={{color: over?'var(--neon-pink)':warn?'var(--neon-orange)':'var(--text-muted)'}}>
          <span style={{color: 'var(--text-primary)', fontWeight: 600}}>${used.toFixed(2)}</span> / ${cap.toFixed(2)} <span>· {pct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="pbar thin">
        <div className="pbar-fill" style={{
          width: Math.min(100, pct)+'%',
          background: over ? 'var(--neon-pink)' : warn ? 'var(--neon-orange)' : color,
          boxShadow: `0 0 8px ${over?'var(--neon-pink)':warn?'var(--neon-orange)':color}`,
        }}/>
      </div>
    </div>
  );
}

function AlertItem({ tone, text }) {
  const color = tone === 'orange' ? 'var(--neon-orange)' : tone === 'pink' ? 'var(--neon-pink)' : 'var(--neon-cyan)';
  return (
    <div style={{display:'flex',gap:8,padding:'0.55rem 0.7rem',background:`color-mix(in srgb, ${color} 6%, transparent)`,border:`1px solid color-mix(in srgb, ${color} 25%, transparent)`,borderLeft:`3px solid ${color}`,borderRadius:'var(--radius-md)',fontFamily:'var(--font-mono)',fontSize:'0.74rem',color:'var(--text-secondary)'}}>
      <span style={{color}}>{tone === 'orange' ? '⚠' : tone === 'pink' ? '✕' : 'ⓘ'}</span>
      <span>{text}</span>
    </div>
  );
}

const conceptHStyles = `
.dsc { display: flex; flex-direction: column; gap: 0.4rem; }
.dsc-bars {
  display: flex; align-items: flex-end; gap: 3px;
  height: 140px;
  padding-top: 1.2rem;
}
.dsc-bar {
  flex: 1; min-width: 3px;
  background: linear-gradient(to top, var(--neon-cyan), var(--neon-purple));
  border-radius: 2px 2px 0 0;
  opacity: 0.55;
  transition: opacity 0.2s var(--ease-smooth);
  position: relative;
  cursor: pointer;
}
.dsc-bar:hover { opacity: 1; }
.dsc-bar:hover .dsc-bar-label { opacity: 1; }
.dsc-bar.today {
  opacity: 1;
  background: linear-gradient(to top, var(--neon-orange), var(--neon-pink));
  box-shadow: 0 0 12px var(--neon-orange);
}
.dsc-bar-label {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-primary);
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s var(--ease-smooth);
  padding: 2px 5px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-glow);
  border-radius: 3px;
  margin-bottom: 4px;
}
.dsc-axis {
  display: flex; justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-muted);
  padding-top: 6px;
  border-top: 1px solid var(--border-hair);
}

.hm { display: flex; flex-direction: column; gap: 0.3rem; }
.hm-rows { display: flex; flex-direction: column; gap: 3px; }
.hm-row { display: grid; grid-template-columns: 36px 1fr; align-items: center; gap: 0.5rem; }
.hm-day { font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-muted); text-transform: uppercase; }
.hm-cells { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; }
.hm-cell {
  height: 16px;
  border-radius: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-hair);
  transition: transform 0.15s var(--ease-smooth);
  cursor: pointer;
}
.hm-cell:hover { transform: scale(1.3); z-index: 2; }
.hm-axis { display: grid; grid-template-columns: 36px 1fr 1fr 1fr 1fr 1fr; font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-muted); padding-top: 4px; }
.hm-axis span:not(:first-child) { text-align: left; padding-left: 4px; }
`;

window.ConceptH = ConceptH;
