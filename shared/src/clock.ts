export interface Clock {
  now(): number;
  nowIso(): string;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

export function fixedClock(iso: string): Clock {
  const fixed = new Date(iso).getTime();
  return {
    now: () => fixed,
    nowIso: () => iso,
  };
}
