#!/usr/bin/env bun
import { chmodSync, existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const target = join(repoRoot, 'tools', 'stash');
const binDir = resolve(process.env.STASH_BIN_DIR ?? join(homedir(), '.local', 'bin'));
const linkPath = join(binDir, 'stash');
const force = Bun.argv.includes('--force');

if (!existsSync(target)) {
  process.stderr.write(`stash install: missing CLI target at ${target}\n`);
  process.exit(1);
}

mkdirSync(binDir, { recursive: true });
chmodSync(target, 0o755);

if (existsSync(linkPath)) {
  const existing = lstatSync(linkPath);
  if (!existing.isSymbolicLink()) {
    process.stderr.write(
      `stash install: ${linkPath} already exists and is not a symlink.\n` +
        `Choose another STASH_BIN_DIR or move the existing file first.\n`,
    );
    process.exit(1);
  }

  const resolved = resolve(binDir, readlinkSync(linkPath));
  if (resolved !== target) {
    if (!force) {
      process.stderr.write(
        `stash install: ${linkPath} points to ${resolved}.\n` +
          `Run with --force to replace only this symlink.\n`,
      );
      process.exit(1);
    }
    unlinkSync(linkPath);
  }
}

if (!existsSync(linkPath)) {
  symlinkSync(target, linkPath);
}

process.stdout.write(`OK linked ${linkPath} -> ${target}\n`);

const pathEntries = (process.env.PATH ?? '').split(':').map((p) => resolve(p || '.'));
if (!pathEntries.includes(binDir)) {
  const displayDir = binDir.startsWith(homedir()) ? binDir.replace(homedir(), '$HOME') : binDir;
  process.stdout.write(`Add this to your shell profile if needed:\n  export PATH="${displayDir}:$PATH"\n`);
}

process.stdout.write(
  `Verify:\n` +
    `  stash doctor\n` +
    `Capture:\n` +
    `  stash "fix login #aurora ^p1 !tomorrow @auth *45m"\n`,
);
