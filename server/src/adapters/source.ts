import type { AgentProvider, AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';
import type { SessionFileFingerprint } from './session-cache.js';

export interface ScanOptions {
  root: string;
  /** Max files to read (newest first). 0 = no limit. */
  limit?: number;
  /**
   * Only parse files whose filesystem mtime is at or after this boundary.
   * Claude/Codex session JSONL files are append-only, so mtime is a
   * conservative candidate filter; business timestamps are still read from
   * the file and decide whether an event belongs to an analytics window.
   */
  modifiedSinceMs?: number;
}

export interface SourceScanCacheStats {
  provider: AgentProvider;
  root: string;
  cacheEnabled: boolean;
  filesDiscovered: number;
  filesSeen: number;
  filesIndexed: number;
  filesReused: number;
  refreshedAt: string;
}

export interface SourceScanResult {
  sessions: AgentSession[];
  errors: SourceParseError[];
  cache?: SourceScanCacheStats;
  /** File generation captured by the metadata scan, keyed by source path. */
  fingerprintsBySource?: Map<string, SessionFileFingerprint>;
  /** Window-scoped usage populated by analytics scans; keyed by source path. */
  usageBySource?: Map<string, UsageEvent[]>;
}

export interface SourceParseError {
  provider: AgentProvider;
  sourcePath: string;
  message: string;
}

export interface AgentSource {
  provider: AgentProvider;
  scan(options: ScanOptions): SourceScanResult;
  /** Lightweight exact activity/usage scan for analytics-only consumers. */
  scanActivity?(options: ScanOptions): SourceScanResult;
  getEvents(sourcePath: string): AgentSessionEvent[];
  /** Extract token usage events from a parsed session file. Empty when unsupported. */
  getUsage(sourcePath: string, fingerprint?: SessionFileFingerprint): UsageEvent[];
}
