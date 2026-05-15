import type { Area } from '@stash/shared';
import { listAreas } from '../api/areas';
import { useAsync, type AsyncState } from './useAsync';

export function useAreas(): AsyncState<Area[]> {
  return useAsync<Area[]>(() => listAreas(), []);
}
