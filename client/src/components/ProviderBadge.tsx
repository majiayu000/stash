import type { AgentProvider } from '@stash/shared';

export function ProviderBadge({ provider }: { provider: AgentProvider }) {
  const cls =
    provider === 'claude'
      ? 'bg-provider-claude/10 text-provider-claude border-provider-claude/30'
      : 'bg-provider-codex/10 text-provider-codex border-provider-codex/30';
  return (
    <span className={`pill ${cls} uppercase`}>{provider}</span>
  );
}
