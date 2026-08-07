-- v0.13 — user-owned per-million-token rates, merged over DEFAULT_MODEL_RATES.
-- One row per model id. A row either corrects a shipped rate or introduces a
-- model the shipped card will never carry (third-party models reached through
-- a proxy). Absence of a row is not "free": unpriced usage is reported as
-- unpriced by BurnPricingCoverage, never summed as $0.
--
-- model: exact provider model id as it appears in transcripts, minus any
--        release-date suffix — findModelRate() strips `-YYYYMMDD` before the
--        second lookup, so `claude-sonnet-4-6` covers `...-20260114`.

create table model_rates (
  model              text primary key,
  input_per_m        real not null,
  output_per_m       real not null,
  cache_read_per_m   real,
  cache_write_per_m  real,
  created_at         text not null,
  updated_at         text not null
);
