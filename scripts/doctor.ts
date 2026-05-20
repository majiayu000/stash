#!/usr/bin/env bun
import { accessSync, constants } from 'fs';
import { dirname } from 'path';
import { loadConfig } from '../server/src/config.js';

type Status = 'ok' | 'warn' | 'fail';

interface Check {
  name: string;
  status: Status;
  detail: string;
  hint?: string;
}

const config = loadConfig();
const strict = Bun.argv.includes('--strict');
const help = Bun.argv.includes('-h') || Bun.argv.includes('--help');
const httpTimeoutMs = strict ? 30_000 : 700;

if (help) {
  process.stdout.write(
    `usage: bun run doctor [--strict]\n\n` +
      `Checks Bun, the configured SQLite path, Claude/Codex roots, and local ports.\n` +
      `--strict treats missing local state and unreachable dev servers as failures.\n`,
  );
  process.exit(0);
}

const checks: Check[] = [];

checks.push(checkBun());
checks.push(pathCheck('db dir', dirname(config.dbPath), strict, constants.R_OK | constants.W_OK, 'run a seed command or create the directory before first launch'));
checks.push(pathCheck('db file', config.dbPath, strict, constants.R_OK | constants.W_OK, 'run `STASH_DB_PATH=/tmp/stash-demo.db bun run seed:rich:sessions` for a demo DB, or start the server once with your chosen STASH_DB_PATH'));
checks.push(pathCheck('Claude root', config.claudeRoot, strict, constants.R_OK, 'set CLAUDE_ROOT to a readable Claude project/session directory'));
checks.push(pathCheck('Codex root', config.codexRoot, strict, constants.R_OK, 'set CODEX_ROOT to a readable Codex session directory'));
checks.push(await httpCheck('server health', `http://localhost:${config.port}/health`, strict, httpTimeoutMs, 'start `bun run server:dev` or set PORT if 4174 is taken'));
checks.push(await httpCheck('client dev server', 'http://localhost:5173/', strict, httpTimeoutMs, 'start `bun run client:dev` in another shell'));

for (const check of checks) {
  process.stdout.write(`${icon(check.status)} ${check.name}: ${check.detail}\n`);
  if (check.status !== 'ok' && check.hint) {
    process.stdout.write(`   next: ${check.hint}\n`);
  }
}

if (checks.some((check) => check.status === 'fail')) {
  process.exitCode = 1;
}

function checkBun(): Check {
  const version = Bun.version;
  const [major = 0, minor = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
  const ok = major > 1 || (major === 1 && minor >= 1);
  return {
    name: 'Bun version',
    status: ok ? 'ok' : 'fail',
    detail: `${version} ${ok ? '(>= 1.1)' : '(< 1.1)'}`,
  };
}

function pathCheck(name: string, path: string, required: boolean, mode: number, hint: string): Check {
  try {
    accessSync(path, mode);
    return { name, status: 'ok', detail: path };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      name,
      status: required ? 'fail' : 'warn',
      detail: `${path} not ready (${reason})`,
      hint,
    };
  }
}

async function httpCheck(name: string, url: string, required: boolean, timeoutMs: number, hint: string): Promise<Check> {
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    return {
      name,
      status: res.ok ? 'ok' : required ? 'fail' : 'warn',
      detail: `${url} returned ${res.status}`,
      hint,
    };
  } catch (e) {
    return {
      name,
      status: required ? 'fail' : 'warn',
      detail: `${url} unreachable (${e instanceof Error ? e.message : String(e)})`,
      hint,
    };
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
