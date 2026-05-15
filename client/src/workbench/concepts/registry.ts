/**
 * Concept registry — single source of truth for the 16 entries in the
 * ConceptSwitcher. Each entry maps an id (route slug) → short label + the
 * design-template description. `built: true` means the component is fully
 * ported; `built: false` renders a placeholder stub.
 *
 * The order here drives the switcher display order (most-impact concepts
 * first per docs/PLAN.md Phase 2 priority).
 */
export type ConceptId =
  | 'e' | 'b' | 'a' | 'k' | 'g' | 'h' | 'l' | 'f'
  | 'm' | 'o' | 'i' | 'j' | 'd' | 'c' | 'n' | 'prd';

export interface ConceptEntry {
  id: ConceptId;
  label: string;
  title: string;
  oneLiner: string;
  built: boolean;
}

export const CONCEPTS: ConceptEntry[] = [
  { id: 'e',   label: 'E · Capture & Plan',     title: 'Capture & Plan',          oneLiner: 'Hero capture + 4-col board + right rail. The default.',                              built: true  },
  { id: 'b',   label: 'B · Mission Control',    title: 'Mission Control',         oneLiner: '3-pane ops: sidebar / project detail / live stream + meter',                         built: true  },
  { id: 'a',   label: 'A · Card Wall',          title: 'Card Wall',               oneLiner: 'Pinterest-style project grid + capture & live rail',                                 built: true  },
  { id: 'k',   label: 'K · Project Workbench',  title: 'Project Workbench',       oneLiner: 'Intent · milestones · decisions · notes · lessons',                                  built: true  },
  { id: 'g',   label: 'G · Session Detail',     title: 'Session Detail',          oneLiner: 'Full transcript · tool calls · diffs · cost meter',                                  built: true  },
  { id: 'h',   label: 'H · Cost & Burn',        title: 'Cost & Burn Analytics',   oneLiner: 'Daily spend chart · model donut · heatmap · leaderboard',                            built: true  },
  { id: 'l',   label: 'L · Todo Detail',        title: 'Todo Detail / Split / Promote', oneLiner: 'Modal: edit, sub-tasks, link sessions, promote to project/feature',          built: false },
  { id: 'f',   label: 'F · Project Edit',       title: 'New Project + Edit',      oneLiner: 'Side-by-side: + new project modal · edit existing settings',                         built: false },
  { id: 'm',   label: 'M · Skills',             title: 'Skills Library',          oneLiner: 'Browse · install · bind to projects',                                                built: false },
  { id: 'o',   label: 'O · Start Session',      title: 'Start Session Dispatcher', oneLiner: 'Prompt + tool + model + auto-loaded skills + budget',                              built: false },
  { id: 'i',   label: 'I · ⌘K Palette',         title: 'Command Palette',         oneLiner: 'Search actions · projects · todos · sessions · filters',                             built: false },
  { id: 'j',   label: 'J · Weekly Review',      title: 'Weekly Review',           oneLiner: 'AI narrative · WoW KPIs · done · features advanced · plan',                          built: false },
  { id: 'd',   label: 'D · Constellation',      title: 'Constellation',           oneLiner: 'Projects as nodes · ring=progress · timeline strip',                                 built: false },
  { id: 'c',   label: 'C · Hero + Stream',      title: 'Hero + Stream',           oneLiner: 'Cinematic hero · mini-grid · live agent log',                                        built: false },
  { id: 'n',   label: 'N · Settings',           title: 'Settings + Integrations', oneLiner: 'Theme picker · paths · model rates · integrations',                                  built: false },
  { id: 'prd', label: 'PRD',                    title: 'Product Requirements',    oneLiner: 'The product doc that drives all 15 concepts',                                        built: false },
];

export function findConcept(id: string | undefined): ConceptEntry | undefined {
  if (!id) return undefined;
  return CONCEPTS.find((c) => c.id === id);
}
