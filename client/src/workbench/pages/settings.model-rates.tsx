import { useEffect, useRef, useState } from 'react';
import type { ModelRateOverride } from '@stash/shared';
import { getBurnSnapshot } from '../../api/analytics';
import { deleteModelRate, getModelRates, upsertModelRate } from '../../api/model-rates';
import { useWorkbenchDialog } from '../../components/ui/workbench-dialogs';
import { reportAsyncError } from '../reportAsyncError';

/**
 * Model rates the user owns, plus the models their own history contains that
 * nothing can price yet.
 *
 * The unpriced list is the point of the panel: #144 made unpriced usage visible
 * instead of silently reporting it as $0, and this is where that warning finally
 * leads somewhere. Nothing here proposes a price — an unknown rate is asked for,
 * never guessed, because a guessed rate is the failure mode #144 removed.
 */
export function ModelRatesPanel() {
  const [overrides, setOverrides] = useState<ModelRateOverride[]>([]);
  const [unknownModels, setUnknownModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverageFailed, setCoverageFailed] = useState(false);
  const mounted = useRef(true);
  const dialog = useWorkbenchDialog();

  async function refresh() {
    if (mounted.current) setLoading(true);
    try {
      const card = await getModelRates();
      if (mounted.current) setOverrides(card.overrides);
    } catch (error) {
      if (mounted.current) reportAsyncError('load model rates', error, refresh);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // Coverage is a separate concern: the rate list is still usable when the
    // history scan fails, so a failure here must not blank the panel.
    try {
      const burn = await getBurnSnapshot();
      if (mounted.current) {
        setUnknownModels(burn.pricing.unknownModels);
        setCoverageFailed(false);
      }
    } catch {
      if (mounted.current) setCoverageFailed(true);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, []);

  async function askRate(model: string, existing?: ModelRateOverride) {
    const inputStr = await dialog.prompt({
      title: `input rate for ${model}`,
      description: 'USD per million input tokens, from the provider\'s published rate card.',
      label: 'input $/M',
      defaultValue: existing ? String(existing.inputPerM) : '',
      confirmLabel: 'next',
    });
    if (inputStr === null) return;
    const inputPerM = Number(inputStr);
    if (!Number.isFinite(inputPerM) || inputPerM < 0) {
      await dialog.alert({ title: 'input rate must be a number ≥ 0', tone: 'danger' });
      return;
    }
    const outputStr = await dialog.prompt({
      title: `output rate for ${model}`,
      description: 'USD per million output tokens.',
      label: 'output $/M',
      defaultValue: existing ? String(existing.outputPerM) : '',
      confirmLabel: 'save rate',
    });
    if (outputStr === null) return;
    const outputPerM = Number(outputStr);
    if (!Number.isFinite(outputPerM) || outputPerM < 0) {
      await dialog.alert({ title: 'output rate must be a number ≥ 0', tone: 'danger' });
      return;
    }
    try {
      await upsertModelRate({ model, inputPerM, outputPerM });
      await refresh();
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) {
      await dialog.alert({
        title: 'could not save rate',
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    }
  }

  async function add() {
    const model = await dialog.prompt({
      title: 'model id',
      description: 'Exactly as it appears in transcripts, without any -YYYYMMDD suffix.',
      label: 'model',
      placeholder: 'qwen3.8-max-preview',
      confirmLabel: 'next',
    });
    if (!model?.trim()) return;
    await askRate(model.trim());
  }

  async function remove(rate: ModelRateOverride) {
    const ok = await dialog.confirm({
      title: 'delete rate?',
      description: `${rate.model} goes back to unpriced — its usage is excluded from cost totals, not counted as $0.`,
      confirmLabel: 'delete rate',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteModelRate(rate.model);
      await refresh();
      window.dispatchEvent(new CustomEvent('stash:captured'));
    } catch (e) {
      await dialog.alert({
        title: 'could not delete rate',
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    }
  }

  const configured = new Set(overrides.map((r) => r.model));
  const stillUnpriced = unknownModels.filter((m) => !configured.has(m));

  return (
    <div className="surface" style={{ padding: '1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.85rem' }}>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, margin: 0 }}>🏷️ model rates</h3>
        <button type="button" onClick={add} style={addButtonStyle}>+ rate</button>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0 }}>
        Rates here override the shipped card and add models it will never carry. A model with no
        rate is reported as <em>unpriced</em>, never as $0 — so cost totals stay a floor until you
        price it.
      </p>

      {coverageFailed ? (
        <div style={{ ...hintStyle, color: 'var(--neon-orange)' }}>
          could not read usage history, so unpriced models are unknown right now.
        </div>
      ) : stillUnpriced.length > 0 ? (
        <div style={unpricedBoxStyle}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--neon-orange)', marginBottom: 6 }}>
            {stillUnpriced.length} model{stillUnpriced.length === 1 ? '' : 's'} in your history with no rate
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stillUnpriced.map((model) => (
              <div key={model} style={rowStyle}>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{model}</span>
                <button type="button" onClick={() => askRate(model)} style={rowButtonStyle}>add rate</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div style={hintStyle}>loading…</div>
      ) : overrides.length === 0 ? (
        <div style={hintStyle}>no rate overrides. the shipped card is in use as-is.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {overrides.map((rate) => (
            <div key={rate.model} style={rowStyle}>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{rate.model}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--neon-orange)' }}>
                ${rate.inputPerM} / ${rate.outputPerM} per M
              </span>
              <button type="button" onClick={() => askRate(rate.model, rate)} style={rowButtonStyle}>edit</button>
              <button type="button" onClick={() => remove(rate)} style={{ ...rowButtonStyle, color: 'var(--neon-pink)' }}>delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const addButtonStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'rgba(0,255,242,0.08)',
  border: '1px solid rgba(0,255,242,0.3)',
  color: 'var(--neon-cyan)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  padding: '3px 10px',
  borderRadius: 4,
  cursor: 'pointer',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 8px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-hair)',
  borderRadius: 4,
};

const rowButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-hair)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.66rem',
  padding: '2px 8px',
  borderRadius: 3,
  cursor: 'pointer',
};

const unpricedBoxStyle: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  marginBottom: '0.7rem',
  background: 'rgba(255,159,10,0.05)',
  border: '1px dashed rgba(255,159,10,0.3)',
  borderRadius: 'var(--radius-md)',
};

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  color: 'var(--text-muted)',
};
