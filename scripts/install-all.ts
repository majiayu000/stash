#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export type PackageInstallRunner = (package_dir: string) => Promise<number>;

export function discover_package_dirs(root_dir: string): string[] {
  const package_dirs = readdirSync(root_dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => join(root_dir, entry.name))
    .filter((package_dir) => existsSync(join(package_dir, 'package.json')))
    .sort();

  return [root_dir, ...package_dirs];
}

export async function install_all(
  root_dir: string,
  runner: PackageInstallRunner = run_frozen_install,
): Promise<void> {
  const package_dirs = discover_package_dirs(root_dir);
  package_dirs.forEach(assert_frozen_lock);

  for (const package_dir of package_dirs) {
    const relative_dir = package_dir === root_dir
      ? '.'
      : package_dir.slice(root_dir.length + 1);
    process.stdout.write(`\n==> install ${relative_dir}\n`);
    const exit_code = await runner(package_dir);
    if (exit_code !== 0) {
      throw new Error(`dependency install failed in ${relative_dir} with exit code ${exit_code}`);
    }
  }
}

export function assert_frozen_lock(package_dir: string): void {
  const manifest_path = join(package_dir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifest_path, 'utf8')) as unknown;
  if (!package_has_dependencies(manifest)) return;
  if (existsSync(join(package_dir, 'bun.lock')) || existsSync(join(package_dir, 'bun.lockb'))) {
    return;
  }
  throw new Error(`dependency-bearing package has no Bun lockfile: ${package_dir}`);
}

function package_has_dependencies(manifest: unknown): boolean {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('package.json must contain a JSON object');
  }
  const record = manifest as Record<string, unknown>;
  return [
    record.dependencies,
    record.devDependencies,
    record.optionalDependencies,
    record.peerDependencies,
  ].some(has_entries);
}

function has_entries(value: unknown): boolean {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length > 0;
}

async function run_frozen_install(package_dir: string): Promise<number> {
  const child = Bun.spawn(
    [process.execPath, 'install', '--frozen-lockfile'],
    {
      cwd: package_dir,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  return child.exited;
}

if (import.meta.main) {
  const root_dir = dirname(dirname(fileURLToPath(import.meta.url)));
  try {
    await install_all(root_dir);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
