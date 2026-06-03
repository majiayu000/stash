# Skills Product Research

Date: 2026-05-21

## Question

The Skills page should not ask users to call `POST /api/skills`. This research checks how skill, plugin, extension, and integration products let users add and manage reusable capabilities.

## Key Finding

Products treat a skill as an installed capability package, not as a raw API record. The common user flow is:

1. Discover or create the skill.
2. Install or import it into a workspace/local scope.
3. Enable or disable it.
4. Configure any required fields.
5. Bind it to a project, agent, or runtime.
6. Show status, source, and risk clearly.

## Multica

Source: `https://github.com/multica-ai/multica`

Multica is the closest reference for Stash because it models skills as workspace-level packages that can be attached to agents.

Relevant source files from local clone `/tmp/multica-source`:

- `packages/views/skills/components/skills-page.tsx`
- `packages/views/skills/components/create-skill-dialog.tsx`
- `packages/views/skills/components/runtime-local-skill-import-panel.tsx`
- `packages/views/skills/components/skill-detail-page.tsx`
- `packages/views/agents/components/skill-add-dialog.tsx`
- `packages/views/locales/en/skills.json`

Observed interaction:

- Skills page has a normal `New skill` CTA, search, filters, empty state, and list/detail navigation.
- Empty state says users can create, import by URL, or copy from a connected runtime.
- `New skill` opens a chooser with three modes: create manually, import from URL, copy from runtime.
- URL import supports ClawHub, Skills.sh, and GitHub.
- Local import scans runtime skills, lets users select one or many, then imports them.
- Agent binding uses a multi-select dialog with explicit confirm. Attached skills are filtered out rather than disabled in place.
- Detail page shows files, metadata, origin, agents using the skill, permissions, save state, and delete confirmation.
- Success uses in-app toast; validation errors are inline. No native `prompt`, `alert`, or `confirm` is part of the product path.

Takeaway for Stash:

- Keep raw CRUD endpoints internal.
- The product surface should be `Add skill`, not `POST /api/skills`.
- Binding should be reviewable and explicit.
- Source, status, and usage should be visible before users assume a skill is active.

## AI Coding Tools

References:

- Claude Code Skills: `https://code.claude.com/docs/en/skills`
- Claude Code Plugins: `https://code.claude.com/docs/en/discover-plugins`
- OpenAI Codex Skills: `https://developers.openai.com/codex/skills`
- ChatGPT GPTs: `https://help.openai.com/en/articles/8554397-creating-a-gpt`
- OpenAI MCP/connectors: `https://developers.openai.com/api/docs/guides/tools-connectors-mcp`
- Cursor MCP: `https://docs.cursor.com/en/context/mcp`
- Cursor Marketplace: `https://cursor.com/marketplace`
- Windsurf MCP: `https://docs.windsurf.com/windsurf/cascade/mcp`
- Cline MCP: `https://docs.cline.bot/mcp/configuring-mcp-servers`
- Roo Code Marketplace: `https://roocodeinc.github.io/Roo-Code/features/marketplace/`

Observed patterns:

- Claude Code and Codex expose skills through files, CLI, plugin systems, and settings, not through a user-facing API CRUD page.
- Claude Code supports user/project/enterprise/plugin scopes and visibility modes such as on, name-only, user-invocable-only, or off.
- Codex supports repo/user/admin/system skills and config-level disabling.
- Cursor, Windsurf, Cline, and Roo Code use marketplace/config/UI flows for MCP servers and tool capabilities.
- Cline and Windsurf show server or tool toggles. Roo Code emphasizes project/global scope.
- Ordinary users mostly interact through UI, CLI, config files, or marketplace install links. API surfaces are developer infrastructure.

Takeaway for Stash:

- Show scope explicitly: global/workspace, project, or agent.
- Show activation status separately from installation.
- Show capabilities and risk: injected context, command execution, filesystem access, external API/tool access.
- Do not combine "installed", "enabled", and "bound" into one ambiguous toggle.

## Non-coding Products

References:

- Obsidian Community plugins: `https://obsidian.md/help/community-plugins`
- Obsidian Plugin security: `https://obsidian.md/help/plugin-security`
- Raycast Extensions: `https://manual.raycast.com/extensions`
- Raycast Preferences API: `https://developers.raycast.com/api-reference/preferences`
- Raycast Store guidelines: `https://developers.raycast.com/basics/prepare-an-extension-for-store`
- Notion connections: `https://www.notion.com/help/add-and-manage-connections-with-the-api`
- Slack apps: `https://slack.com/help/articles/202035138-Add-apps-to-your-Slack-workspace`
- Zapier actions: `https://help.zapier.com/hc/en-us/articles/8496257774221-Set-up-your-Zap-action`
- Linear integrations: `https://linear.app/docs/integration-directory`

Observed patterns:

- Obsidian separates install from enable.
- Raycast supports extension preferences and clear empty states.
- Notion installs a connection, then grants access to selected pages or databases.
- Slack shows app scopes and warns about unreviewed apps.
- Zapier uses a setup, configure, test sequence.
- Linear integrations are installed at workspace level and configured per team/project/channel.

Takeaway for Stash:

- Empty state should offer product actions, not developer instructions.
- A skill can be available but not enabled, enabled but not configured, configured but not bound.
- Configuration should be inline with validation and a test path when the backend supports it.
- Destructive actions need a product confirmation dialog; reversible state flips should use in-app notices or undo.

## Stash Current Backend Boundary

Current Stash v0.2 supports:

- `GET/POST/PATCH/DELETE /api/skills`
- `GET/PUT/POST/DELETE /api/projects/:projectId/skills`
- `Skill.source`: `official | community`
- `Skill.installed`: boolean
- Project bindings with `enabled`

Current backend does not yet support:

- GitHub import
- Local runtime scan/import
- Marketplace registry
- Skill file bundles or `SKILL.md` preview
- Required configuration schema
- Capability/permission metadata
- Separate enabled state outside project bindings

Therefore, the immediate product slice should improve the manual skill and binding experience without pretending import/configuration exists.
