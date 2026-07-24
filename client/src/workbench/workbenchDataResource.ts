export interface RefreshResourceState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  updatedAt: number | undefined;
}

export interface SharedRefreshResourceOptions {
  freshnessMs: number;
  now?: () => number;
}

type Listener = () => void;

/**
 * A shared refresh cycle that coalesces forced refreshes arriving during each
 * in-flight request into one pending follow-up request.
 */
export class SharedRefreshResource<T> {
  private state: RefreshResourceState<T> = {
    data: undefined,
    error: undefined,
    loading: true,
    updatedAt: undefined,
  };
  private readonly listeners = new Set<Listener>();
  private cycle: Promise<void> | undefined;
  private forcedRefreshPending = false;
  private invalidationVersion = 0;
  private readonly now: () => number;

  constructor(
    private readonly fetcher: () => Promise<T>,
    private readonly options: SharedRefreshResourceOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  getSnapshot = (): RefreshResourceState<T> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  revalidate(): Promise<void> {
    if (this.isFresh()) return Promise.resolve();
    return this.request(false);
  }

  refresh(): Promise<void> {
    return this.request(true);
  }

  invalidate(): void {
    this.invalidationVersion += 1;
    if (this.state.updatedAt !== undefined) {
      this.update({ ...this.state, updatedAt: undefined });
    }
  }

  private isFresh(): boolean {
    return this.state.updatedAt !== undefined
      && this.now() - this.state.updatedAt < this.options.freshnessMs;
  }

  private request(force: boolean): Promise<void> {
    if (this.cycle) {
      if (force) this.forcedRefreshPending = true;
      return this.cycle;
    }

    const work = this.runCycle();
    this.cycle = work.finally(() => {
      this.cycle = undefined;
      this.forcedRefreshPending = false;
    });
    return this.cycle;
  }

  private async runCycle(): Promise<void> {
    await this.fetchOnce();
    while (this.forcedRefreshPending) {
      this.forcedRefreshPending = false;
      await this.fetchOnce();
    }
  }

  private async fetchOnce(): Promise<void> {
    const requestVersion = this.invalidationVersion;
    this.update({ ...this.state, loading: true });
    try {
      const data = await this.fetcher();
      this.update({
        data,
        error: undefined,
        loading: false,
        updatedAt: requestVersion === this.invalidationVersion
          ? this.now()
          : undefined,
      });
    } catch (error) {
      this.update({
        ...this.state,
        error: error instanceof Error ? error : new Error(String(error)),
        loading: false,
      });
    }
  }

  private update(state: RefreshResourceState<T>): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
