#!/usr/bin/env bun
import { existsSync } from 'fs';
import { dirname } from 'path';
import { loadConfig } from '../server/src/config.js';

type Status = 'ok' | 'warn' | 'fail';

interface Check {
  name: string;
  status: Status;
  detail: string;
}

const config = loadConfig();
const checks: Check[] = [];

checks.push(checkBun());
checks.push(pathCheck('db dir', dirname(config.dbPath)));
checks.push(pathCheck('db file', config.dbPath));
checks.push(pathCheck('Claude root', config.claudeRoot));
checks.push(pathCheck('Codex root', config.codexRoot));
checks.push(await httpCheck('server health', `http://localhost:${config.port}/health`, false));
checks.push(await httpCheck('client dev server', 'http://localhost:5173/', false));

for (const check of checks) {
  process.stdout.write(`${icon(check.status)} ${check.name}: ${check.detail}\n`);
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

function pathCheck(name: string, path: string): Check {
  if (existsSync(path)) {
    return { name, status: 'ok', detail: path };
  }
  return {
    name,
    status: 'warn',
    detail: `${path} not found`,
  };
}

async function httpCheck(name: string, url: string, required: boolean): Promise<Check> {
  try {
    const res = await fetchWithTimeout(url, 700);
    return {
      name,
      status: res.ok ? 'ok' : required ? 'fail' : 'warn',
      detail: `${url} returned ${res.status}`,
    };
  } catch (e) {
    return {
      name,
      status: required ? 'fail' : 'warn',
      detail: `${url} unreachable (${e instanceof Error ? e.message : String(e)})`,
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
