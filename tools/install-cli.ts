#!/usr/bin/env bun
import { chmod, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const source = join(toolsDir, 'stash');
const force = process.argv.includes('--force');

function homeDir(): string {
  const home = process.env.HOME;
  if (!home) {
    process.stderr.write('install:cli: HOME is not set; set STASH_CLI_DIR to an install directory\n');
    process.exit(1);
  }
  return home;
}

function installDir(): string {
  return process.env.STASH_CLI_DIR ?? join(homeDir(), '.local', 'bin');
}

function pathContains(dir: string): boolean {
  const parts = (process.env.PATH ?? '').split(':').filter(Boolean).map((p) => resolve(p));
  return parts.includes(resolve(dir));
}

async function existingTargetPointsHere(target: string): Promise<boolean> {
  try {
    const link = await readlink(target);
    return resolve(dirname(target), link) === resolve(source);
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
    if (code === 'EINVAL' || code === 'ENOENT') return false;
    throw e;
  }
}

async function main(): Promise<void> {
  const dir = installDir();
  const target = join(dir, 'stash');

  await mkdir(dir, { recursive: true });
  await chmod(source, 0o755);

  try {
    const stat = await lstat(target);
    if (stat.isDirectory()) {
      process.stderr.write(`install:cli: ${target} is a directory; choose another STASH_CLI_DIR\n`);
      process.exit(1);
    }
    if (stat.isSymbolicLink() && await existingTargetPointsHere(target)) {
      process.stdout.write(`stash already installed at ${target}\n`);
    } else if (force) {
      await rm(target);
      await symlink(source, target);
      process.stdout.write(`installed stash -> ${target}\n`);
    } else {
      process.stderr.write(`install:cli: ${target} already exists; rerun with --force to replace it\n`);
      process.exit(1);
    }
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
    if (code !== 'ENOENT') throw e;
    await symlink(source, target);
    process.stdout.write(`installed stash -> ${target}\n`);
  }

  if (!pathContains(dir)) {
    process.stdout.write(`note: ${dir} is not in PATH for this shell\n`);
    process.stdout.write(`add this to your shell profile: export PATH="${dir}:$PATH"\n`);
  }
  process.stdout.write('verify with: stash doctor\n');
}

await main();
