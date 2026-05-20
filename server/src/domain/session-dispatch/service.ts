import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  systemClock,
  ulid,
  type Clock,
} from '@stash/shared';
import type { AreaService } from '../area/service.js';
import type { ProjectKnowledgeService } from '../project-knowledge/service.js';
import type { SkillService } from '../skill/service.js';
import type { WorkItemService } from '../work-item/service.js';

/**
 * v1.0 — compose a real Claude/Codex starter prompt from a work item, plus
 * its project context (intent, lessons, bound skills). Optionally spawn the
 * tool's CLI with the prompt piped in; otherwise return a temp-file path so
 * the user can run it themselves.
 *
 * Design notes:
 * - We don't try to track the spawned child to completion. The Claude/Codex
 *   CLI writes its own JSONL under CLAUDE_ROOT/CODEX_ROOT, which the existing
 *   AgentSourceAggregator picks up automatically.
 * - Spawn is best-effort. If the binary isn't on PATH, we fall back to
 *   { spawned: false } with the prompt + a copy-pasteable command so the user
 *   can run it manually. That keeps stash useful on machines without the CLI.
 * - The composed prompt is also saved to a temp file under tmpdir/stash-prompts/
 *   so it's debuggable + reusable.
 */

export interface DispatchInput {
  workItemId: string;
  tool: 'claude' | 'codex';
  /** Extra free-form text to append after the composed sections. */
  extraInstructions?: string;
}

export interface DispatchResult {
  /** The full composed prompt string. */
  prompt: string;
  /** Temp file the prompt was saved to. */
  promptFile: string;
  /** Suggested shell command (good for the UI's "copy command" fallback). */
  suggestedCommand: string;
  /** True when we actually spawned the child process. */
  spawned: boolean;
  /** PID when spawned===true. */
  pid?: number;
  /** Diagnostic when spawned===false (binary missing, etc.). */
  spawnError?: string;
}

export interface ComposeResult {
  prompt: string;
  promptFile: string;
  suggestedCommand: string;
}

export interface SessionDispatchServiceDeps {
  workItems: WorkItemService;
  areas: AreaService;
  knowledge: ProjectKnowledgeService;
  skills: SkillService;
  clock?: Clock;
  /** Injection seam — test harnesses can stub spawn / write. */
  spawnImpl?: (cmd: string, args: string[], stdin: string) => { pid?: number; error?: string };
  writeFileImpl?: (path: string, contents: string) => void;
}

export class SessionDispatchService {
  private readonly clock: Clock;
  constructor(private readonly deps: SessionDispatchServiceDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  /**
   * Compose-only: prompt + temp file + suggested command. No spawn.
   * Safe for preview UIs that re-fire on every form change.
   */
  compose(input: DispatchInput): ComposeResult {
    const item = this.deps.workItems.get(input.workItemId);
    if (!item) throw new Error(`work item ${input.workItemId} not found`);

    const prompt = this.composePrompt(item, input.extraInstructions);
    const dir = join(tmpdir(), 'stash-prompts');
    mkdirSync(dir, { recursive: true });
    const stamp = ulid(this.clock.now());
    const promptFile = join(dir, `${input.tool}-${stamp}.md`);
    (this.deps.writeFileImpl ?? defaultWrite)(promptFile, prompt);

    const cmd = input.tool === 'claude' ? 'claude' : 'codex';
    return {
      prompt,
      promptFile,
      suggestedCommand: `${cmd} < ${shellEscape(promptFile)}`,
    };
  }

  dispatch(input: DispatchInput): DispatchResult {
    const composed = this.compose(input);
    const cmd = input.tool === 'claude' ? 'claude' : 'codex';
    const { pid, error } = (this.deps.spawnImpl ?? defaultSpawn)(cmd, [], composed.prompt);
    return {
      ...composed,
      spawned: pid !== undefined,
      pid,
      spawnError: error,
    };
  }

  composePrompt(item: ReturnType<WorkItemService['get']>, extra?: string): string {
    if (!item) return '';
    const lines: string[] = [];
    lines.push(`# Task: ${item.title}`);
    lines.push('');
    if (item.description) {
      lines.push(item.description.trim());
      lines.push('');
    }

    // Project context
    const projectId = item.projectId ?? item.areaId;
    if (projectId) {
      const area = this.deps.areas.get(projectId);
      if (area) {
        lines.push(`## Project: ${area.name}`);
        const intent = this.deps.knowledge.getIntent(projectId);
        if (intent?.text) {
          lines.push('');
          lines.push(`**Intent.** ${intent.text}`);
        }

        // Bound skills
        const bindings = this.deps.skills.listBindingsForProject(projectId);
        const enabled = bindings.filter((b) => b.enabled);
        if (enabled.length > 0) {
          const all = this.deps.skills.list();
          const byId = new Map(all.map((s) => [s.id, s]));
          const named = enabled
            .map((b) => byId.get(b.skillId))
            .filter((s): s is NonNullable<typeof s> => s !== undefined);
          if (named.length > 0) {
            lines.push('');
            lines.push('**Loaded skills.**');
            for (const s of named) {
              lines.push(`- ${s.name}${s.description ? ` — ${s.description}` : ''}`);
            }
          }
        }
        lines.push('');
      }
    }

    // Relevant lessons — tag-overlap with this todo's labels + same-project.
    const lessons = this.deps.knowledge.findRelevantLessons({
      projectId: item.projectId,
      labels: item.labels,
      limit: 3,
    });
    if (lessons.length > 0) {
      lines.push('## Relevant lessons');
      lines.push('');
      for (const l of lessons) {
        lines.push(`- **${l.title}**${l.body ? ` — ${l.body.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
      }
      lines.push('');
    }

    // Open sub-tasks (status != done/dropped)
    const subs = this.deps.workItems
      .list({ parentId: item.id, includeDropped: false })
      .filter((s) => s.status !== 'done');
    if (subs.length > 0) {
      lines.push('## Sub-tasks');
      lines.push('');
      for (const s of subs) lines.push(`- [ ] ${s.title}`);
      lines.push('');
    }

    if (extra?.trim()) {
      lines.push('## Notes');
      lines.push('');
      lines.push(extra.trim());
      lines.push('');
    }

    lines.push('---');
    lines.push('Begin.');
    return lines.join('\n');
  }
}

// ─── default implementations ───────────────────────────────────────────────

function defaultWrite(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
}

function defaultSpawn(cmd: string, args: string[], stdin: string): { pid?: number; error?: string } {
  // Use Bun.spawn — fire-and-forget, the CLI writes its own JSONL which the
  // aggregator picks up.
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    if (proc.stdin && 'write' in proc.stdin) {
      const writer = proc.stdin as { write: (data: string) => unknown; end?: () => unknown };
      writer.write(stdin);
      writer.end?.();
    }
    return { pid: proc.pid };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
