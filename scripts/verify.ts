#!/usr/bin/env bun
import { spawn } from 'child_process';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

interface Step {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const ci = Bun.argv.includes('--ci');
const diffArgs =
  ci && process.env.GITHUB_BASE_REF
    ? ['diff', '--check', `origin/${process.env.GITHUB_BASE_REF}...HEAD`]
    : ['diff', '--check'];
const e2eEnv = ci ? await createIsolatedE2eEnv() : { STASH_REUSE_E2E_SERVER: '1' };

const steps: Step[] = [
  { name: 'diff check', command: 'git', args: diffArgs },
  {
    name: ci ? 'doctor' : 'doctor strict',
    command: 'bun',
    args: ['run', 'doctor', ...(ci ? [] : ['--strict'])],
  },
  { name: 'typecheck', command: 'bun', args: ['run', 'typecheck'] },
  { name: 'server tests', command: 'bun', args: ['run', 'server:test'] },
  { name: 'client tests', command: 'bun', args: ['run', 'client:test'] },
  { name: 'client build', command: 'bun', args: ['run', 'client:build'] },
  {
    name: 'client e2e',
    command: 'bun',
    args: ['run', 'client:e2e'],
    env: e2eEnv,
  },
];

for (const step of steps) {
  process.stdout.write(`\n==> ${step.name}\n`);
  const code = await run(step);
  if (code !== 0) {
    process.stderr.write(`verify failed at step: ${step.name}\n`);
    process.exit(code);
  }
}

async function createIsolatedE2eEnv(): Promise<Record<string, string>> {
  const claimed = new Set<number>();
  const serverPort = await pickPort(4274, claimed);
  claimed.add(serverPort);
  const clientPort = await pickPort(5273, claimed);

  return {
    STASH_E2E_SERVER_PORT: String(serverPort),
    STASH_E2E_CLIENT_PORT: String(clientPort),
    STASH_E2E_API_URL: `http://localhost:${serverPort}/api`,
    STASH_E2E_DB_PATH: join(tmpdir(), `stash-e2e-${process.pid}-${Date.now()}.db`),
  };
}

async function pickPort(preferred: number, claimed: Set<number>): Promise<number> {
  if (!claimed.has(preferred) && await isPortAvailable(preferred)) {
    return preferred;
  }

  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('unable to allocate an e2e port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function run(step: Step): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      env: { ...process.env, ...step.env },
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      process.stderr.write(`${step.command}: ${error.message}\n`);
      resolve(1);
    });
  });
}

process.stdout.write('\nverify passed\n');
