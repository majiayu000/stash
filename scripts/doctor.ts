#!/usr/bin/env bun
import { accessSync, constants } from 'fs';
import { dirname } from 'path';
import { loadConfig, type Config } from '../server/src/config.js';

export type Status = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: Status;
  detail: string;
  hint?: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface DoctorOptions {
  config: Config;
  strict: boolean;
  bunVersion?: string;
  fetchImpl?: FetchLike;
  httpTimeoutMs?: number;
}

export async function runDoctor(options: DoctorOptions): Promise<Check[]> {
  const { config, strict } = options;
  const httpTimeoutMs = options.httpTimeoutMs ?? (strict ? 30_000 : 700);
  const fetchImpl = options.fetchImpl ?? fetch;

  return [
    checkBunVersion(options.bunVersion ?? Bun.version),
    pathCheck({
      name: 'db dir',
      path: dirname(config.dbPath),
      required: strict,
      mode: constants.R_OK | constants.W_OK,
      hint: `create the directory or set STASH_DB_PATH to a writable SQLite path`,
    }),
    pathCheck({
      name: 'db file',
      path: config.dbPath,
      required: strict,
      mode: constants.R_OK | constants.W_OK,
      hint:
        'run `STASH_DB_PATH=/tmp/stash-demo.db bun run seed:rich:sessions` for demo data, or start the server once with your chosen STASH_DB_PATH',
    }),
    pathCheck({
      name: 'Claude root',
      path: config.claudeRoot,
      required: strict,
      mode: constants.R_OK,
      hint: 'create the directory or set CLAUDE_ROOT to a readable Claude sessions root',
    }),
    pathCheck({
      name: 'Codex root',
      path: config.codexRoot,
      required: strict,
      mode: constants.R_OK,
      hint: 'create the directory or set CODEX_ROOT to a readable Codex sessions root',
    }),
    await httpCheck({
      name: 'server health',
      url: `http://localhost:${config.port}/health`,
      required: strict,
      timeoutMs: httpTimeoutMs,
      fetchImpl,
      hint: `start \`bun run server:dev\` or set PORT if ${config.port} is taken`,
    }),
    await httpCheck({
      name: 'client dev server',
      url: 'http://localhost:5173/',
      required: strict,
      timeoutMs: httpTimeoutMs,
      fetchImpl,
      hint: 'start `bun run client:dev` in another shell',
    }),
  ];
}

export function checkBunVersion(version: string): Check {
  const [rawMajor = '', rawMinor = ''] = version.split('.');
  const major = Number.parseInt(rawMajor, 10);
  const minor = Number.parseInt(rawMinor, 10);
  const ok =
    !Number.isNaN(major) && !Number.isNaN(minor) && (major > 1 || (major === 1 && minor >= 1));

  return {
    name: 'Bun version',
    status: ok ? 'ok' : 'fail',
    detail: `${version} ${ok ? '(>= 1.1)' : '(< 1.1)'}`,
    hint: ok ? undefined : 'install Bun 1.1 or newer, then rerun `bun run doctor`',
  };
}

export interface PathCheckOptions {
  name: string;
  path: string;
  required: boolean;
  mode: number;
  hint: string;
}

export function pathCheck(options: PathCheckOptions): Check {
  try {
    accessSync(options.path, options.mode);
    return { name: options.name, status: 'ok', detail: options.path };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      name: options.name,
      status: options.required ? 'fail' : 'warn',
      detail: `${options.path} not ready (${reason})`,
      hint: options.hint,
    };
  }
}

export interface HttpCheckOptions {
  name: string;
  url: string;
  required: boolean;
  timeoutMs: number;
  fetchImpl: FetchLike;
  hint: string;
}

export async function httpCheck(options: HttpCheckOptions): Promise<Check> {
  try {
    const res = await fetchWithTimeout(options.url, options.timeoutMs, options.fetchImpl);
    const status: Status = res.ok ? 'ok' : options.required ? 'fail' : 'warn';
    return {
      name: options.name,
      status,
      detail: `${options.url} returned ${res.status}`,
      hint: status === 'ok' ? undefined : options.hint,
    };
  } catch (error) {
    return {
      name: options.name,
      status: options.required ? 'fail' : 'warn',
      detail: `${options.url} unreachable (${error instanceof Error ? error.message : String(error)})`,
      hint: options.hint,
    };
  }
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function formatChecks(checks: Check[]): string {
  return checks
    .flatMap((check) => {
      const lines = [`${icon(check.status)} ${check.name}: ${check.detail}`];
      if (check.status !== 'ok' && check.hint) {
        lines.push(`   next: ${check.hint}`);
      }
      return lines;
    })
    .join('\n');
}

function icon(status: Status): string {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'warn':
      return 'WARN';
    case 'fail':
      return 'FAIL';
  }
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(
        `usage: bun run doctor [--strict]\n\n` +
        `Checks Bun, the configured SQLite path, Claude/Codex roots, and local dev servers.\n` +
        `STASH_DB_PATH overrides the default SQLite path; macOS keeps using an existing XDG or legacy app.db file until you migrate.\n` +
        `--strict treats missing first-run state and unreachable dev servers as failures.\n`,
    );
    return;
  }

  const checks = await runDoctor({
    config: loadConfig(),
    strict: args.includes('--strict'),
  });

  process.stdout.write(`${formatChecks(checks)}\n`);

  if (checks.some((check) => check.status === 'fail')) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
