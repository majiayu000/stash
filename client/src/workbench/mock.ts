/**
 * Mock fills for fields not yet provided by the backend. Every entry is
 * tagged with the Phase 3 backend task that will replace it (see
 * docs/PLAN.md). When wiring Phase 4, grep for `mock.` to find every call
 * site that needs to switch to the real API.
 */

import type { WBProject } from './data';

// Phase 3c (analytics-burn) will replace this with computed shares from
// agent_sessions.provider + model.
export const MODEL_MIX = [
  { model: 'sonnet-4.5', pct: 58, color: 'var(--neon-cyan)' },
  { model: 'codex-1',    pct: 26, color: 'var(--neon-purple)' },
  { model: 'haiku-4.5',  pct: 11, color: 'var(--neon-green)' },
  { model: 'opus-4.7',   pct: 5,  color: 'var(--neon-orange)' },
];

// Phase 3c will compute the last 12 hours of token spend from agent_sessions.
export const TOKEN_SPARK = [42, 68, 51, 90, 74, 112, 88, 130, 124, 158, 142, 184];

// Phase 3c — last 30 days of $ spend, indexed 0=oldest. Replaced by analytics/burn.
export const DAILY_SPEND = [
  1.2, 0.8, 1.5, 0.4, 2.1, 1.7, 1.3, 0.9, 2.8, 3.2, 2.6, 1.9, 0.6, 1.4, 2.0,
  1.8, 2.4, 3.1, 2.7, 1.5, 0.9, 2.2, 3.5, 4.0, 3.7, 2.9, 4.2, 4.1, 3.8, 4.16,
];

// Phase 3c — 7×24 hourly heatmap (Sun..Sat). Deterministic so design fidelity
// across reloads stays constant.
export const HEATMAP_7x24: number[] = (() => {
  const out: number[] = [];
  for (let day = 0; day < 7; day++) {
    for (let h = 0; h < 24; h++) {
      const work = h >= 9 && h <= 22;
      const weekend = day === 0 || day === 6;
      const base = work ? (weekend ? 0.3 : 0.8) : 0.1;
      // Deterministic pseudo-random jitter from day*h.
      const jit = ((day * 73 + h * 19) % 9 - 4) / 20;
      out.push(Math.max(0, Math.min(1, base + jit)));
    }
  }
  return out;
})();

// Phase 3c — per-project budgets. Replaced when N (settings) persists overrides.
export interface MockBudget { scope: string; used: number; cap: number; color: string }
export const MOCK_BUDGETS: MockBudget[] = [
  { scope: 'aurora-api',     used: 2.41, cap: 5,   color: 'var(--neon-cyan)' },
  { scope: 'pixel-studio',   used: 1.32, cap: 3,   color: 'var(--neon-purple)' },
  { scope: 'terra-cli',      used: 0.94, cap: 3,   color: 'var(--neon-green)' },
  { scope: 'monthly · all',  used: 64.1, cap: 100, color: 'var(--neon-orange)' },
];

export interface MockAlert { tone: 'orange' | 'pink' | 'cyan'; text: string }
export const MOCK_ALERTS: MockAlert[] = [
  { tone: 'orange', text: 'aurora · 24h budget at 48% — projected to hit cap by 7pm' },
  { tone: 'pink',   text: 'pixel · session crashed on layer #312 (recursive svg mask)' },
];

// Phase 3b (project-knowledge) will replace per-project intent/milestones/etc.
export interface ProjectKnowledge {
  intent: string;
  milestones: { id: string; name: string; date: string; status: 'planned' | 'wip' | 'done'; progress: number }[];
  decisions: { id: string; date: string; title: string; body: string; tags: string[] }[];
  notes: string;
  lessons: { id: string; title: string; body: string; tags: string[]; cross?: string }[];
}

export function knowledgeFor(p: WBProject): ProjectKnowledge {
  return {
    intent: `Ship ${p.name} to a working v1. Right now: ${p.doing}. Optimize for cycle time, not for elegance — every closed loop unblocks a downstream choice.`,
    milestones: [
      { id: 'm1', name: 'kickoff', date: '2026-04-01', status: 'done', progress: 100 },
      { id: 'm2', name: 'mvp shipped', date: '2026-05-30', status: p.progress > 50 ? 'wip' : 'planned', progress: p.progress },
      { id: 'm3', name: 'v1 cut', date: '2026-07-15', status: 'planned', progress: 0 },
      { id: 'm4', name: '1.0 ga', date: '2026-09-01', status: 'planned', progress: 0 },
    ],
    decisions: [
      { id: 'd1', date: '2026-04-12', title: 'use bun:sqlite', body: 'No native deps; ships in Bun; transactions are reliable enough for the local use case.', tags: ['stack', 'sqlite'] },
      { id: 'd2', date: '2026-04-28', title: 'workbench design over GitHub-style', body: 'GitHub-style pages were generic; workbench template is the actual product. Restart UI.', tags: ['design', 'ux'] },
    ],
    notes: `# scratch
- next session: wire the analytics endpoint
- the burn chart in Concept H needs to handle empty days (zero render)
- skill bindings live in \`project_skills\` once 3a lands

## decisions still open
- whether to inline the AI narrative for Concept J or wait for an API
- single \`kv_settings\` table vs per-feature settings tables — leaning toward kv

## ideas
- voice-to-todo via Whisper
- promote idea → feature → project pipeline
`,
    lessons: [
      { id: 'L1', title: 'Mock + tag the swap path', body: 'Every mock has a Phase-3 tag so the wire-up phase can grep for it. Saves a "find me the TODO" pass at handoff.', tags: ['workflow'] },
      { id: 'L2', title: 'Themes need override layer, not just tokens', body: 'Mono and Paper need structural overrides (border-radius=0, hard shadows, killed gradients) — not just remapped --neon-cyan.', tags: ['css', 'design'], cross: 'figma-to-react' },
    ],
  };
}

// Phase 3a (skills) will replace this with real skills + project bindings.
export interface MockSkill {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  source: 'official' | 'community';
  stars: number;
  installed: boolean;
}

export const MOCK_SKILLS: MockSkill[] = [
  { id: 'rust-best-practices', name: 'Rust Best Practices', emoji: '🦀', desc: 'Microsoft pragmatic Rust guidelines', source: 'official', stars: 412, installed: true },
  { id: 'react-best-practices', name: 'React Best Practices', emoji: '⚛️', desc: 'Modern React patterns + hooks',     source: 'official', stars: 287, installed: true },
  { id: 'security-review',    name: 'Security Review',       emoji: '🔒', desc: 'OWASP + threat modeling pass',         source: 'official', stars: 156, installed: false },
  { id: 'design-shotgun',     name: 'Design Shotgun',        emoji: '🎯', desc: 'Generate UI variants in parallel',     source: 'community', stars: 89, installed: true },
];

// Phase 3d (analytics-weekly) will replace this with real WoW comparison.
export interface MockWeekly {
  doneCount: number;
  focusHours: number;
  wow: { tokens: { now: number; prev: number }; cost: { now: number; prev: number }; sessions: { now: number; prev: number } };
}

export function weeklyMock(): MockWeekly {
  return {
    doneCount: 12,
    focusHours: 18.5,
    wow: { tokens: { now: 184_000, prev: 142_000 }, cost: { now: 4.16, prev: 3.21 }, sessions: { now: 8, prev: 6 } },
  };
}
