// Projects are derived from paths in MVP; persisted aliases come later.

export interface Project {
  id: string;
  name: string;
  path: string;
  repoRemote?: string;
  branch?: string;
  activeSessionCount: number;
  blockedCount: number;
  staleCount: number;
  lastActiveAt: string;
}

export function projectIdFromPath(path: string): string {
  // Stable id from absolute path: lowercase, replace separators.
  return path
    .replace(/^~/, '')
    .replace(/[/\\]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
