#!/usr/bin/env bun
import { constants } from 'fs';
import { access } from 'fs/promises';
import { dirname } from 'path';
import { loadConfig } from '../server/src/config.js';

type Status = 'pass' | 'warn' | 'fail';

interface Check {
  name: string;
  status: Status;
  detail: string;
}

const checks: Check[] = [];

function add(status: Status, name: string, detail: string) {
  checks.push({ status, name, detail });
}

function parseMinVersion(range: string | undefined): string {
  return range?.match(/\d+\.\d+\.\d+/)?.[0] ?? '1.1.0';
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10));
  const right = b.split('.').map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function readPackageJson(): Promise<{ engines?: { bun?: string } }> {
  return Bun.file(new URL('../package.json', import.meta.url)).json();
}

async function checkPath(label: string, path: string, required: boolean) {
  try {
    await access(path, constants.R_OK);
    add('pass', label, `${path} is readable`);
  } catch {
    add(
      required ? 'fail' : 'warn',
      label,
      `${path} is not readable; set the matching env var if this is not the intended path`,
    );
  }
}

async function checkDbPath(path: string) {
  const dir = dirname(path);
  try {
    await access(dir, constants.W_OK);
    add('pass', 'db path', `${path} parent is writable`);
  } catch {
    add(
      'warn',
      'db path',
      `${dir} is not writable or does not exist yet; stash creates missing parent directories on server start`,
    );
  }
}

async function fetchOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(750) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkPort(label: string, port: number, healthUrl?: string) {
  if (healthUrl && await fetchOk(healthUrl)) {
    add('pass', label, `port ${port} is already serving ${healthUrl}`);
    return;
  }
  try {
    const socket = await Bun.connect({ hostname: '127.0.0.1', port });
    socket.end();
    add('warn', label, `port ${port} is occupied but did not pass the stash health check`);
  } catch {
    add('pass', label, `port ${port} is available`);
  }
}

async function main() {
  const packageJson = await readPackageJson();
  const minBun = parseMinVersion(packageJson.engines?.bun);
  if (compareVersions(Bun.version, minBun) >= 0) {
    add('pass', 'bun version', `${Bun.version} satisfies >=${minBun}`);
  } else {
    add('fail', 'bun version', `${Bun.version} is below required >=${minBun}`);
  }

  const config = loadConfig();
  await checkDbPath(config.dbPath);
  await checkPath('claude root', config.claudeRoot, false);
  await checkPath('codex root', config.codexRoot, false);
  await checkPort('server port', config.port, `http://127.0.0.1:${config.port}/health`);
  await checkPort('client port', Number.parseInt(process.env.CLIENT_PORT ?? '5173', 10));

  console.log('stash doctor');
  for (const check of checks) {
    console.log(`${check.status.toUpperCase().padEnd(4)} ${check.name}: ${check.detail}`);
  }
  const counts = checks.reduce<Record<Status, number>>((acc, check) => {
    acc[check.status] += 1;
    return acc;
  }, { pass: 0, warn: 0, fail: 0 });
  console.log(`result: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail`);
  if (counts.fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
