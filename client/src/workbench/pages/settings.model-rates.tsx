import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_MODEL_RATES,
  MAX_MODEL_RATE_PER_M,
  findModelRate,
  normalize_model_rate_id,
  type ModelRateOverride,
  type UpsertModelRateInput,
} from '@stash/shared';
import { getBudgetSpendSnapshot, invalidate_weekly_snapshot_cache } from '../../api/analytics';
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
  const refresh_generation = useRef(0);
  const dialog = useWorkbenchDialog();

  async function refresh() {
    const generation = ++refresh_generation.current;
    const is_current = () => mounted.current && generation === refresh_generation.current;
    if (is_current()) setLoading(true);
    try {
      const card = await getModelRates();
      if (is_current()) setOverrides(card.overrides);
    } catch (error) {
      if (is_current()) reportAsyncError('load model rates', error, refresh);
    } finally {
      if (is_current()) setLoading(false);
    }
    if (!is_current()) return;
    // Coverage is a separate concern: the rate list is still usable when the
    // history scan fails, so a failure here must not blank the panel.
    try {
      const budget_spend = await getBudgetSpendSnapshot();
      if (is_current()) {
        setUnknownModels(budget_spend.pricing.unknownModels);
        setCoverageFailed(false);
      }
    } catch {
      if (is_current()) setCoverageFailed(true);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, []);

  async function askRate(model: string, existing?: ModelRateOverride) {
    const canonical_model = normalize_model_rate_id(model);
    const shipped = findModelRate(canonical_model, DEFAULT_MODEL_RATES);
    const inputStr = await dialog.prompt({
      title: `input rate for ${canonical_model}`,
      description: 'USD per million input tokens, from the provider\'s published rate card.',
      label: 'input $/M',
      defaultValue: existing ? String(existing.inputPerM) : '',
      confirmLabel: 'next',
    });
    if (inputStr === null) return;
    const input_rate = parse_rate(inputStr, 'input', true);
    if (!input_rate.ok) {
      await dialog.alert({ title: input_rate.message, tone: 'danger' });
      return;
    }
    const outputStr = await dialog.prompt({
      title: `output rate for ${canonical_model}`,
      description: 'USD per million output tokens.',
      label: 'output $/M',
      defaultValue: existing ? String(existing.outputPerM) : '',
      confirmLabel: 'next',
    });
    if (outputStr === null) return;
    const output_rate = parse_rate(outputStr, 'output', true);
    if (!output_rate.ok) {
      await dialog.alert({ title: output_rate.message, tone: 'danger' });
      return;
    }
    const cacheReadStr = await dialog.prompt({
      title: `cache read rate for ${canonical_model}`,
      description: 'USD per million cache-read tokens. Leave blank only when this token class does not apply; cached usage stays unpriced without it.',
      label: 'cache read $/M',
      defaultValue: rate_default(existing?.cacheReadPerM ?? shipped?.cacheReadPerM),
      confirmLabel: 'next',
    });
    if (cacheReadStr === null) return;
    const cache_read_rate = parse_rate(cacheReadStr, 'cache read', false);
    if (!cache_read_rate.ok) {
      await dialog.alert({ title: cache_read_rate.message, tone: 'danger' });
      return;
    }
    const cacheWriteStr = await dialog.prompt({
      title: `cache write rate for ${canonical_model}`,
      description: 'USD per million cache-write tokens. Leave blank only when this token class does not apply; cached usage stays unpriced without it.',
      label: 'cache write $/M',
      defaultValue: rate_default(existing?.cacheWritePerM ?? shipped?.cacheWritePerM),
      confirmLabel: 'save rate',
    });
    if (cacheWriteStr === null) return;
    const cache_write_rate = parse_rate(cacheWriteStr, 'cache write', false);
    if (!cache_write_rate.ok) {
      await dialog.alert({ title: cache_write_rate.message, tone: 'danger' });
      return;
    }
    const input: UpsertModelRateInput = {
      model: canonical_model,
      inputPerM: input_rate.value!,
      outputPerM: output_rate.value!,
    };
    if (cache_read_rate.value !== undefined) input.cacheReadPerM = cache_read_rate.value;
    if (cache_write_rate.value !== undefined) input.cacheWritePerM = cache_write_rate.value;
    try {
      await upsertModelRate(input);
      invalidate_weekly_snapshot_cache();
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
    const has_shipped_rate = findModelRate(rate.model, DEFAULT_MODEL_RATES) !== undefined;
    const ok = await dialog.confirm({
      title: 'delete rate?',
      description: has_shipped_rate
        ? `${rate.model} restores the shipped rate. Any cache prices omitted by that card remain visibly unpriced.`
        : `${rate.model} goes back to unpriced — its usage is excluded from cost totals, not counted as $0.`,
      confirmLabel: 'delete rate',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteModelRate(rate.model);
      invalidate_weekly_snapshot_cache();
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

  const stillUnpriced = unknownModels;

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
            {stillUnpriced.map((model) => {
              const existing = overrides.find(
                (rate) => normalize_model_rate_id(rate.model) === normalize_model_rate_id(model),
              );
              return (
                <div key={model} style={rowStyle}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{model}</span>
                  <button type="button" onClick={() => askRate(model, existing)} style={rowButtonStyle}>
                    {existing ? 'edit rate' : 'add rate'}
                  </button>
                </div>
              );
            })}
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

type ParsedRate = { ok: true; value: number | undefined } | { ok: false; message: string };

function parse_rate(raw: string, label: string, required: boolean): ParsedRate {
  const value = raw.trim();
  if (!value) {
    return required
      ? { ok: false, message: `${label} rate is required` }
      : { ok: true, value: undefined };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_MODEL_RATE_PER_M) {
    return { ok: false, message: `${label} rate must be between 0 and ${MAX_MODEL_RATE_PER_M}` };
  }
  return { ok: true, value: parsed };
}

function rate_default(value: number | undefined): string {
  return value === undefined ? '' : String(value);
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
