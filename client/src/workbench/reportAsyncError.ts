export interface WorkbenchAsyncErrorDetail {
  scope: string;
  message: string;
}

export function reportAsyncError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[stash] ${scope}: ${message}`, error);
  window.dispatchEvent(new CustomEvent<WorkbenchAsyncErrorDetail>('stash:async-error', {
    detail: { scope, message },
  }));
}
