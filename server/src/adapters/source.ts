import type { AgentProvider, AgentSession, AgentSessionEvent, UsageEvent } from '@stash/shared';

export interface ScanOptions {
  root: string;
  /** Max files to read (newest first). 0 = no limit. */
  limit?: number;
}

export interface SourceScanResult {
  sessions: AgentSession[];
  errors: SourceParseError[];
}

export interface SourceParseError {
  provider: AgentProvider;
  sourcePath: string;
  message: string;
}

export interface AgentSource {
  provider: AgentProvider;
  scan(options: ScanOptions): SourceScanResult;
  getEvents(sourcePath: string): AgentSessionEvent[];
  /** Extract token usage events from a parsed session file. Empty when unsupported. */
  getUsage(sourcePath: string): UsageEvent[];
}
