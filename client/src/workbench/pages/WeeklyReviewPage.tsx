import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { add_calendar_days, type FeatureAdvancedRow, type UpdateWorkItemInput, type WeeklySnapshot, type WorkItem } from '@stash/shared';
import { getWeeklySnapshot } from '../../api/analytics';
import * as workItemsApi from '../../api/work-items';
import { CountUp, ParticleField, ShinyText } from '../../components/effects';
import { fmt, type WBData, type WBProject } from '../data';
import { LoadErrorPanel, Topbar, toError } from '../shared';
import { buildWeeklyReviewMarkdown } from './weekly-review.export';
import {
  daysSince,
  downloadMarkdown,
  groupDoneByProject,
  isShareCancellation,
  itemsForDate,
  pctDelta,
  reconcilePlannedItem,
  sortPlanItems,
} from './weekly-review.helpers';
import {
  DoneGroup,
  FeatureDeltaRow,
  KpiTile,
  NextWeekDay,
  StaleReviewRow,
  WowCompare,
} from './weekly-review.sections';
import { weeklyReviewStyles } from './weekly-review.styles';
import {
  useWeeklyReviewSessions,
  WeeklyReviewSessions,
} from './weekly-review.sessions';
import { dateInRange, isIsoWeekLabel, nextIsoWeekRange, shiftIsoWeek, type IsoWeekRange, type WeekdaySlot } from './weekly-review.week';

/**
 * Weekly review and next-week planning.
 * Hero AI narrative + KPI tiles, then 3 columns (done · features advanced ·
 * WoW comparison), then next-week planner strip.
 *
 * Data: real /api/analytics/weekly snapshot + /api/work-items?status=done for the
 * done-by-project grouping. Narrative is deterministic per SPEC §8 (LLM in v0.3).
 */
export function WeeklyReviewPage({ data }: { data: WBData; reload: () => void }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projects } = data;
  const session_state = useWeeklyReviewSessions(data);
  const requestedWeek = searchParams.get('week');
  const selectedWeek = isIsoWeekLabel(requestedWeek) ? requestedWeek : undefined;
  const [week, setWeek] = useState<WeeklySnapshot | null>(null);
  const [doneItems, setDoneItems] = useState<WorkItem[]>([]);
  const [stale, setStale] = useState<WorkItem[]>([]);
  const [nextWeekItems, setNextWeekItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    Promise.all([
      getWeeklySnapshot(selectedWeek),
      workItemsApi.listWorkItems({ status: ['done'] }),
      workItemsApi.listStale(30),
    ])
      .then(async ([w, items, staleItems]) => {
        const planRange = nextIsoWeekRange(w.week);
        const planItems = await workItemsApi.listWorkItems({
          status: ['planned'],
          scheduledFrom: planRange.startDate,
          scheduledTo: planRange.endDate,
        });
        if (cancelled) return;
        setWeek(w);
        const within = items.filter((it) => {
          if (!it.completedAt) return false;
          return it.completedAt >= w.rangeStart && it.completedAt < w.rangeEnd;
        });
        setDoneItems(within);
        setStale(staleItems);
        setNextWeekItems(sortPlanItems(planItems));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(toError(e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [retryTick, selectedWeek]);

  if (loading) {
    return (
      <div className="dashboard-canvas">
        <div className="inner"><Topbar data={session_state.displayData} /><div style={{ padding: '4rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>loading weekly review…</div></div>
      </div>
    );
  }
  if (loadError || !week) {
    return (
      <div className="dashboard-canvas">
        <div className="inner">
          <Topbar data={session_state.displayData} />
          <LoadErrorPanel
            title="weekly review failed to load"
            endpoint="/api/analytics/weekly + /api/work-items?status=done + /api/work-items/stale?days=30"
            error={loadError ?? new Error('weekly review returned no data')}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
        </div>
      </div>
    );
  }

  const wowTokensPct = pctDelta(week.wow.tokens.now, week.wow.tokens.prev);
  const wowCostPct = pctDelta(week.wow.cost.now, week.wow.cost.prev);
  // Unpriced models are excluded from both weeks, so the burn line and its
  // week-over-week delta are floors rather than measured spend.
  const costIsPartial = week.pricing.unknownModels.length > 0;
  const costPrefix = costIsPartial ? '≥ $' : '$';
  const wowSessionsDelta = week.wow.sessions.now - week.wow.sessions.prev;
  const featAdvanced = week.featuresAdvanced;
  const doneByProject = groupDoneByProject(doneItems, projects);
  const nextWeek = nextIsoWeekRange(week.week);

  const navigateWeek = (delta: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('week', shiftIsoWeek(week.week, delta));
    setSearchParams(next);
  };

  const applyStaleAction = async (item: WorkItem, input: UpdateWorkItemInput, label: string) => {
    setMutatingId(item.id);
    setActionError(null);
    setActionNotice(null);
    try {
      const updated = await workItemsApi.updateWorkItem(item.id, input);
      setStale((items) => items.filter((candidate) => candidate.id !== item.id));
      setNextWeekItems((items) => reconcilePlannedItem(items, updated, nextWeek));
      setActionNotice(label);
    } catch (error) {
      setActionError(toError(error).message);
    } finally {
      setMutatingId(null);
    }
  };

  const reviewMarkdown = () =>
    buildWeeklyReviewMarkdown({
      week,
      doneItems,
      staleItems: stale,
      nextWeekItems,
      projects,
    });

  const exportMarkdown = () => {
    const markdown = reviewMarkdown();
    downloadMarkdown(`stash-weekly-review-${week.week}.md`, markdown);
    setActionError(null);
    setActionNotice('markdown exported');
  };

  const shareReview = async () => {
    setSharing(true);
    setActionError(null);
    setActionNotice(null);
    const markdown = reviewMarkdown();
    try {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `Stash Weekly Review ${week.week}`,
            text: markdown,
          });
          setActionNotice('weekly review shared');
          return;
        } catch (error) {
          if (isShareCancellation(error)) {
            setActionNotice('share cancelled');
            return;
          }
          if (!navigator.clipboard?.writeText) throw error;
        }
      }

      if (!navigator.clipboard?.writeText) {
        throw new Error('sharing is unavailable in this browser');
      }
      await navigator.clipboard.writeText(markdown);
      setActionNotice('weekly review copied to clipboard');
    } catch (error) {
      setActionError(toError(error).message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="dashboard-canvas">
      <div className="inner" style={{ overflow: 'hidden', height: '100%' }}>
        <Topbar data={session_state.displayData} />

        <div className="wr-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="wr-nav" type="button" aria-label="previous week" onClick={() => navigateWeek(-1)}>‹</button>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>this week · review</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, marginTop: 2 }}>
                <ShinyText>{week.week} — stash workbench</ShinyText>
              </div>
              <div data-testid="weekly-calendar-range" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {week.calendar.range.startDate}–{add_calendar_days(week.calendar.range.endDateExclusive, -1)} · {week.calendar.timeZone}
              </div>
            </div>
            <button className="wr-nav" type="button" aria-label="next week" onClick={() => navigateWeek(1)}>›</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="sd-action" type="button" onClick={shareReview} disabled={sharing} aria-busy={sharing}>📤 {sharing ? 'sharing…' : 'share with team'}</button>
            <button className="sd-action" type="button" onClick={exportMarkdown}>📋 export markdown</button>
          </div>
        </div>

        {(actionError || actionNotice) && (
          <div className={`wr-action-msg ${actionError ? 'error' : ''}`}>
            {actionError ?? actionNotice}
          </div>
        )}

        {/* Row 1: deterministic narrative + KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div className="wr-summary">
            <ParticleField density={0.00007} color="191, 90, 242" maxLink={80} />
            <div className="wr-summary-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 12px var(--neon-purple))' }}>🧠</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-purple)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>week summary</span>
                <span className="wr-summary-tag">deterministic · LLM in v0.3</span>
              </div>
              <div className="wr-narrative">
                <p>You closed <strong>{week.doneCount}</strong> todos and logged <strong>{week.focusHours}</strong> focus hours across {doneByProject.length} active projects. Sessions {wowSessionsDelta >= 0 ? 'up' : 'down'} from {week.wow.sessions.prev} → {week.wow.sessions.now}.</p>
                {doneByProject[0] && (
                  <p>
                    Top project: <span className="wr-narr-pill cyan">{doneByProject[0].project.emoji} {doneByProject[0].project.name}</span> with {doneByProject[0].items.length} items completed.
                  </p>
                )}
                {featAdvanced.length > 0 && (
                  <p>
                    Advanced {featAdvanced.length} feature{featAdvanced.length === 1 ? '' : 's'}: {featAdvanced.slice(0, 2).map((f) => f.title).join(', ')}{featAdvanced.length > 2 ? `, +${featAdvanced.length - 2} more` : ''}.
                  </p>
                )}
                <p>
                  Burn was <strong>{costPrefix}{week.wow.cost.now.toFixed(2)}</strong> {wowCostPct >= 0 ? '↑' : '↓'} {Math.abs(wowCostPct).toFixed(0)}% vs last week.
                  {costIsPartial && (
                    <> <span data-testid="weekly-pricing-gap" style={{ color: 'var(--neon-orange)' }}>
                      Excludes {week.pricing.unknownModels.length} model{week.pricing.unknownModels.length === 1 ? '' : 's'} with no configured rate ({week.pricing.unknownModels.join(', ')}).
                    </span></>
                  )}
                </p>
                {week.doneCount === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No completed todos this week — try closing one to seed the report.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', alignContent: 'start' }}>
            <KpiTile label="todos done"    value={week.doneCount}            color="var(--neon-green)" />
            <KpiTile label="features +"    value={featAdvanced.length}       color="var(--neon-cyan)" />
            <KpiTile label="sessions"      value={week.wow.sessions.now}     wow={wowSessionsDelta}              color="var(--neon-purple)" />
            <KpiTile label="tokens · 7d"   value={fmt.k(week.wow.tokens.now)} wow={Math.round(wowTokensPct)} unit="%" color="var(--neon-cyan)" />
            <KpiTile label="cost · 7d"     value={costPrefix + week.wow.cost.now.toFixed(2)} wow={Math.round(wowCostPct)} unit="%" color="var(--neon-orange)" warn />
            <KpiTile label="focus hours"   value={week.focusHours + 'h'}     color="var(--neon-pink)" />
          </div>
        </div>

        {/* Row 2: done · features · WoW */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr', gap: '1.25rem', flex: 1, minHeight: 0 }}>
          <div className="surface" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
              <span className="prompt">&gt;</span> done this week
              <span className="count">— {week.doneCount} items</span>
              <span className="right" style={{ color: 'var(--neon-green)' }}>🎉</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: 4 }}>
              {doneByProject.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(nothing completed yet this week)</div>
              ) : doneByProject.map((g) => (
                <DoneGroup key={g.project.id} project={g.project} items={g.items} onOpen={(id) => navigate(`/todos/${id}`)} />
              ))}
            </div>
          </div>

          <div className="surface" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
              <span className="prompt">&gt;</span> features advanced
              <span className="count">— {featAdvanced.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: 4 }}>
              {featAdvanced.length === 0
                ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>(no features advanced)</div>
                : featAdvanced.map((f) => <FeatureDeltaRow key={f.id} f={f} />)}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
            <div className="surface">
              <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
                <span className="prompt">&gt;</span> this week vs last
              </div>
              <WowCompare label="todos done" cur={week.doneCount}              prev={Math.max(0, week.doneCount - wowSessionsDelta)} fmt={(n) => String(n)} />
              <WowCompare label="sessions"   cur={week.wow.sessions.now}       prev={week.wow.sessions.prev} fmt={(n) => String(n)} />
              <WowCompare label="tokens"     cur={week.wow.tokens.now / 1_000_000} prev={week.wow.tokens.prev / 1_000_000} fmt={(n) => n.toFixed(2) + 'M'} />
              <WowCompare label="cost"       cur={week.wow.cost.now}           prev={week.wow.cost.prev} fmt={(n) => costPrefix + n.toFixed(2)} warn />
              <WowCompare label="focus hrs"  cur={week.focusHours}             prev={Math.max(0, week.focusHours - 1)} fmt={(n) => n.toFixed(1) + 'h'} />
            </div>

            {stale.length > 0 && (
              <div className="surface">
                <div className="sec-head" style={{ marginBottom: '0.6rem' }}>
                  <span className="prompt">&gt;</span> 🌫 stale digest
                  <span className="count">— {stale.length} item{stale.length === 1 ? '' : 's'}, untouched 30d+</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {stale.slice(0, 6).map((it) => (
                    <StaleReviewRow
                      key={it.id}
                      item={it}
                      days={daysSince(it.updatedAt)}
                      nextWeek={nextWeek}
                      disabled={mutatingId === it.id}
                      onOpen={() => navigate(`/todos/${it.id}`)}
                      onKeep={() => applyStaleAction(it, {}, 'stale item kept')}
                      onToday={() => applyStaleAction(it, {
                        status: 'planned',
                        todayPinned: true,
                        scheduledForRelative: 'today',
                      }, 'stale item scheduled for today')}
                      onNextWeek={() => applyStaleAction(it, { status: 'planned', todayPinned: false, scheduledFor: nextWeek.days[0]!.isoDate }, 'stale item scheduled for next week')}
                      onSomeday={() => applyStaleAction(it, { status: 'someday', todayPinned: false, scheduledFor: null, startAt: null, dueAt: null }, 'stale item moved to someday')}
                      onDrop={() => applyStaleAction(it, { status: 'dropped', todayPinned: false }, 'stale item dropped')}
                    />
                  ))}
                  {stale.length > 6 && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                      +{stale.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="surface" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
                <span className="prompt">&gt;</span> top sessions
              </div>
              <WeeklyReviewSessions projects={projects} state={session_state} />
            </div>
          </div>
        </div>

        {/* Next week plan — empty by default; user drops todos in. */}
        <div style={{ marginTop: '1.25rem' }}>
          <div className="sec-head" style={{ marginBottom: '0.75rem' }}>
            <span className="prompt">&gt;</span> plan next week
            <span className="count">— {nextWeek.week} · persisted scheduled dates</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
            {nextWeek.days.map((day) => (
              <NextWeekDay
                key={day.key}
                day={day}
                items={itemsForDate(nextWeekItems, day.isoDate)}
                onOpen={(id) => navigate(`/todos/${id}`)}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{weeklyReviewStyles}</style>
    </div>
  );
}
