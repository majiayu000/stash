#!/usr/bin/env bun
import { spawn, type ChildProcess } from 'child_process';

/**
 * Runs the server and client together in one terminal.
 *
 * Starting them by hand needed two shells and the same `STASH_DB_PATH` typed
 * into both; getting that wrong silently pointed each half at a different
 * database. Here one process owns the environment and both halves inherit it.
 *
 * `--demo` points the run at a throwaway database and the seeded Claude root
 * so a first launch shows real content without touching the default DB.
 */
export interface Service {
  name: string;
  command: string;
  args: string[];
}

export const DEMO_DB_PATH = '/tmp/stash-demo.db';
export const DEMO_CLAUDE_ROOT = '/tmp/stash-rich-claude';

export const SERVICES: Service[] = [
  { name: 'server', command: 'bun', args: ['run', 'server:dev'] },
  { name: 'client', command: 'bun', args: ['run', 'client:dev'] },
];

/**
 * Environment both halves inherit. Outside demo mode nothing is injected, so
 * the server resolves its own default database exactly as `server:dev` would.
 * An explicit `STASH_DB_PATH` / `CLAUDE_ROOT` always wins over the demo values.
 */
export function resolve_shared_env(
  demo_mode: boolean,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (!demo_mode) return {};
  return {
    STASH_DB_PATH: env.STASH_DB_PATH ?? DEMO_DB_PATH,
    CLAUDE_ROOT: env.CLAUDE_ROOT ?? DEMO_CLAUDE_ROOT,
  };
}

if (import.meta.main) await main();

async function main(): Promise<void> {
  const demo = Bun.argv.includes('--demo');
  const shared_env = resolve_shared_env(demo);
  const children: ChildProcess[] = [];
  let shutting_down = false;

  if (demo) {
    process.stdout.write('[dev] demo mode\n');
    process.stdout.write(`[dev]   STASH_DB_PATH=${shared_env.STASH_DB_PATH}\n`);
    process.stdout.write(`[dev]   CLAUDE_ROOT=${shared_env.CLAUDE_ROOT}\n`);
    if (!(await Bun.file(shared_env.STASH_DB_PATH!).exists())) {
      process.stdout.write('[dev] no demo database yet — seeding\n');
      const seeded = await run_to_completion('bun', ['run', 'seed:rich:sessions'], shared_env);
      if (seeded !== 0) {
        process.stderr.write('[dev] seeding failed\n');
        process.exit(seeded);
      }
    }
  }

  for (const service of SERVICES) {
    // `bun run <script>` spawns the real server/vite process as a grandchild,
    // so signalling the direct child leaves the actual listener running. Each
    // service gets its own process group and is signalled as a group instead.
    const child = spawn(service.command, service.args, {
      stdio: 'inherit',
      detached: true,
      env: { ...process.env, ...shared_env },
    });
    children.push(child);

    child.on('error', (error) => {
      process.stderr.write(`[dev] ${service.name}: ${error.message}\n`);
      shutdown(1);
    });
    // If either half dies the other is useless on its own, so take both down
    // rather than leaving a half-running stack that still looks healthy.
    child.on('close', (code) => {
      if (shutting_down) return;
      process.stderr.write(`[dev] ${service.name} exited with ${code ?? 1}\n`);
      shutdown(code ?? 1);
    });
  }

  process.stdout.write('[dev] server http://localhost:4174 · client http://localhost:5173\n');
  process.stdout.write('[dev] ctrl-c stops both\n');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => shutdown(0));
  }

  function shutdown(code: number): void {
    if (shutting_down) return;
    shutting_down = true;
    for (const child of children) {
      if (child.exitCode !== null || child.pid === undefined) continue;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Group already gone; nothing left to stop.
      }
    }
    process.exit(code);
  }
}

function run_to_completion(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      process.stderr.write(`${command}: ${error.message}\n`);
      resolve(1);
    });
  });
}
