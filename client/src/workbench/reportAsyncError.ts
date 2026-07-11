export interface WorkbenchAsyncErrorDetail {
  id: number;
  scope: string;
  message: string;
  retry?: () => void | Promise<void>;
}

export const WORKBENCH_ASYNC_ERROR_EVENT = 'stash:async-error';

let nextAsyncErrorId = 0;

export function reportAsyncError(
  scope: string,
  error: unknown,
  retry?: () => void | Promise<void>,
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[stash] ${scope}: ${message}`, error);
  window.dispatchEvent(new CustomEvent<WorkbenchAsyncErrorDetail>(WORKBENCH_ASYNC_ERROR_EVENT, {
    detail: {
      id: ++nextAsyncErrorId,
      scope,
      message,
      retry,
    },
  }));
}
