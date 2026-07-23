import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { discover_package_dirs, install_all } from './install-all';

describe('root dependency installer', () => {
  test('discovers every direct package and ignores node_modules packages', () => {
    const root_dir = mkdtempSync(join(tmpdir(), 'stash-install-all-'));
    try {
      write_package(root_dir);
      write_package(join(root_dir, 'client'));
      write_package(join(root_dir, 'server'));
      write_package(join(root_dir, 'shared'));
      write_package(join(root_dir, 'node_modules', 'not-a-workspace'));
      mkdirSync(join(root_dir, 'docs'));

      expect(discover_package_dirs(root_dir)).toEqual([
        root_dir,
        join(root_dir, 'client'),
        join(root_dir, 'server'),
        join(root_dir, 'shared'),
      ]);
    } finally {
      rmSync(root_dir, { recursive: true, force: true });
    }
  });

  test('runs frozen installs for all packages and stops visibly on failure', async () => {
    const root_dir = mkdtempSync(join(tmpdir(), 'stash-install-all-'));
    try {
      write_package(root_dir);
      write_package(join(root_dir, 'client'));
      write_package(join(root_dir, 'server'));
      const visited: string[] = [];

      await expect(install_all(root_dir, async (package_dir) => {
        visited.push(package_dir);
        return basename(package_dir) === 'server' ? 17 : 0;
      })).rejects.toThrow('dependency install failed in server with exit code 17');
      expect(visited).toEqual([
        root_dir,
        join(root_dir, 'client'),
        join(root_dir, 'server'),
      ]);
    } finally {
      rmSync(root_dir, { recursive: true, force: true });
    }
  });

  test('rejects a dependency-bearing package without a Bun lock before installing anything', async () => {
    const root_dir = mkdtempSync(join(tmpdir(), 'stash-install-all-'));
    try {
      write_package(root_dir);
      const client_dir = join(root_dir, 'client');
      mkdirSync(client_dir);
      writeFileSync(join(client_dir, 'package.json'), JSON.stringify({
        dependencies: { react: '^18.3.1' },
      }));
      let install_count = 0;

      await expect(install_all(root_dir, async () => {
        install_count++;
        return 0;
      })).rejects.toThrow(`dependency-bearing package has no Bun lockfile: ${client_dir}`);
      expect(install_count).toBe(0);
    } finally {
      rmSync(root_dir, { recursive: true, force: true });
    }
  });
});

function write_package(package_dir: string): void {
  mkdirSync(package_dir, { recursive: true });
  writeFileSync(join(package_dir, 'package.json'), '{}\n');
}
