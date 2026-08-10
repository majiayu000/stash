import type { FeatureAdvancedRow, WorkItem } from '@stash/shared';
import { fmt, type WBProject } from '../data';
import { CountUp } from '../../components/effects';
import type { IsoWeekRange, WeekdaySlot } from './weekly-review.week';
import { daysSince, itemsForDate, pctDelta, sortPlanItems } from './weekly-review.helpers';

/** Presentational sections of the weekly review page. */

export function KpiTile({ label, value, wow, unit, color, warn }: { label: string; value: number | string; wow?: number; unit?: string; color: string; warn?: boolean }) {
  const up = typeof wow === 'number' && wow > 0;
  const wowStr = wow == null ? '' : `${up ? '↑' : '↓'} ${Math.abs(wow)}${unit ?? ''}`;
  return (
    <div className="wr-kpi">
      <div className="wr-kpi-label">{label}</div>
      <div className="wr-kpi-value" style={{ color }}>
        {typeof value === 'number' ? <CountUp to={value} duration={1000} /> : value}
      </div>
      {wow != null && (
        <div className="wr-kpi-wow" style={{ color: warn ? 'var(--neon-orange)' : up ? 'var(--neon-green)' : 'var(--neon-pink)' }}>
          {wowStr} <span style={{ color: 'var(--text-muted)' }}>vs prev</span>
        </div>
      )}
    </div>
  );
}

export function DoneGroup({ project, items, onOpen }: { project: WBProject; items: WorkItem[]; onOpen: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="wr-done-group">
      <div className="wr-done-head">
        <span style={{ fontSize: '1.05rem' }}>{project.emoji}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--neon-cyan)', fontWeight: 600 }}>{project.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--neon-green)', marginLeft: 'auto', background: 'rgba(48,209,88,0.1)', padding: '1px 7px', borderRadius: 'var(--radius-pill)' }}>✓ {items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
        {items.map((item) => (
          <button key={item.id} type="button" className="wr-done-item" onClick={() => onOpen(item.id)}>
            <span className="wr-done-check">✓</span>
            <span className="wr-done-text">{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function FeatureDeltaRow({ f }: { f: FeatureAdvancedRow }) {
  return (
    <div className="wr-feat">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>{f.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{f.from}</span>
        <span style={{ color: 'var(--text-muted)' }}>→</span>
        <span style={{ color: 'var(--neon-green)', fontWeight: 600 }}>{f.to}</span>
      </div>
    </div>
  );
}

export function WowCompare({ label, cur, prev, fmt: fmtNum, warn }: { label: string; cur: number; prev: number; fmt: (n: number) => string; warn?: boolean }) {
  const delta = pctDelta(cur, prev);
  const up = delta > 0;
  return (
    <div className="wr-wow-row">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: warn ? 'var(--neon-orange)' : up ? 'var(--neon-green)' : 'var(--neon-pink)', fontWeight: 600 }}>
          {up ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', width: 22 }}>prev</span>
          <div className="pbar thin" style={{ flex: 1 }}>
            <div className="pbar-fill" style={{ width: '100%', background: 'var(--text-muted)', opacity: 0.4, boxShadow: 'none', animation: 'none' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', width: 22 }}>now</span>
          <div className="pbar thin" style={{ flex: 1 }}>
            <div className="pbar-fill" style={{ width: Math.min(100, prev === 0 ? 100 : (cur / prev) * 100) + '%', background: warn ? 'var(--neon-orange)' : 'var(--gradient-primary)' }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{fmtNum(prev)}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmtNum(cur)}</span>
      </div>
    </div>
  );
}

export function StaleReviewRow({
  item,
  days,
  nextWeek,
  disabled,
  onOpen,
  onKeep,
  onToday,
  onNextWeek,
  onSomeday,
  onDrop,
}: {
  item: WorkItem;
  days: number;
  nextWeek: IsoWeekRange;
  disabled: boolean;
  onOpen: () => void;
  onKeep: () => void;
  onToday: () => void;
  onNextWeek: () => void;
  onSomeday: () => void;
  onDrop: () => void;
}) {
  const nextDate = nextWeek.days[0]?.isoDate ?? nextWeek.startDate;
  return (
    <div className="wr-stale-row">
      <button className="wr-stale-title" type="button" onClick={onOpen}>
        {item.title}
      </button>
      <span className="wr-stale-age">{days}d</span>
      <div className="wr-stale-actions">
        <button type="button" disabled={disabled} onClick={onKeep}>keep</button>
        <button type="button" disabled={disabled} onClick={onToday}>today</button>
        <button type="button" disabled={disabled} onClick={onNextWeek}>{nextDate}</button>
        <button type="button" disabled={disabled} onClick={onSomeday}>someday</button>
        <button type="button" disabled={disabled} onClick={onDrop}>drop</button>
      </div>
    </div>
  );
}

export function NextWeekDay({ day, items, onOpen }: { day: WeekdaySlot; items: WorkItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="wr-nwd">
      <div className="wr-nwd-head">{day.label}<span>{day.isoDate.slice(5)}</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {items.length === 0 ? (
          <div className="wr-nwd-empty">no planned work</div>
        ) : items.map((item) => (
          <button key={item.id} className="wr-nwd-todo" type="button" onClick={() => onOpen(item.id)}>
            <span className="wr-nwd-priority">{item.priority}</span>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
