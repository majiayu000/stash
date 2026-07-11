import {
  constants,
  copyFileSync,
  mkdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';

export const WEEKLY_PERFORMANCE_FILE_COUNT = 3_000;

export interface WeeklyPerformanceFixtureOptions {
  projectDir: string;
  oldTimestamp: string;
  previousTimestamp: string;
  currentTimestamp: string;
  candidateMtime: Date;
  fileCount?: number;
}

export interface WeeklyPerformanceFixture {
  files: string[];
  uniqueInodes: number;
  oldFileBytes: number;
}

/**
 * Builds valid, independent-inode Claude histories. COPYFILE_FICLONE keeps the
 * fixture cheap on CoW filesystems and honestly falls back to a normal copy
 * elsewhere; unlike hard links, each path exercises its own vnode/page cache.
 */
export function seedWeeklyPerformanceFixture(
  options: WeeklyPerformanceFixtureOptions,
): WeeklyPerformanceFixture {
  const fileCount = options.fileCount ?? WEEKLY_PERFORMANCE_FILE_COUNT;
  if (fileCount < 2) throw new RangeError('weekly performance fixture requires at least two files');
  mkdirSync(options.projectDir, { recursive: true });

  const template = join(
    dirname(dirname(options.projectDir)),
    `.weekly-performance-template-${process.pid}-${Date.now()}.jsonl`,
  );
  const files: string[] = [];
  const inodes = new Set<string>();
  try {
    writeClaudeSession(
      template,
      'old-template',
      options.oldTimestamp,
      1,
      1,
      'x'.repeat(512 * 1024),
    );
    const oldFileBytes = statSync(template).size;
    if (oldFileBytes < 512 * 1024 || oldFileBytes > 600 * 1024) {
      throw new Error(`weekly performance template has unexpected size: ${oldFileBytes}`);
    }

    for (let index = 0; index < fileCount - 2; index++) {
      const destination = join(
        options.projectDir,
        `old-${String(index).padStart(4, '0')}.jsonl`,
      );
      copyFileSync(template, destination, constants.COPYFILE_FICLONE);
      utimesSync(destination, options.candidateMtime, options.candidateMtime);
      recordFile(destination, files, inodes);
    }

    const previous = join(options.projectDir, 'previous-week.jsonl');
    writeClaudeSession(previous, 'previous-week', options.previousTimestamp, 100, 50);
    utimesSync(previous, options.candidateMtime, options.candidateMtime);
    recordFile(previous, files, inodes);

    const current = join(options.projectDir, 'current-week.jsonl');
    writeClaudeSession(current, 'current-week', options.currentTimestamp, 200, 25);
    utimesSync(current, options.candidateMtime, options.candidateMtime);
    recordFile(current, files, inodes);

    if (files.length !== fileCount || inodes.size !== fileCount) {
      throw new Error(
        `weekly performance fixture is not independent: files=${files.length}, inodes=${inodes.size}`,
      );
    }
    return { files, uniqueInodes: inodes.size, oldFileBytes };
  } finally {
    try {
      unlinkSync(template);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }
}

function recordFile(sourcePath: string, files: string[], inodes: Set<string>): void {
  const stat = statSync(sourcePath);
  files.push(sourcePath);
  inodes.add(`${stat.dev}:${stat.ino}`);
}

function writeClaudeSession(
  sourcePath: string,
  sessionId: string,
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
  extraContent = '',
): void {
  const user = {
    type: 'user',
    timestamp,
    sessionId,
    cwd: '/Users/test/weekly-performance',
    message: { role: 'user', content: `weekly ${sessionId}${extraContent}` },
  };
  const assistant = {
    type: 'assistant',
    timestamp,
    sessionId,
    message: {
      role: 'assistant',
      content: 'done',
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
  };
  writeFileSync(sourcePath, `${JSON.stringify(user)}\n${JSON.stringify(assistant)}\n`);
}
