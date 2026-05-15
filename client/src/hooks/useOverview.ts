import { getOverview, type OverviewData } from '../api/overview';
import { useAsync, type AsyncState } from './useAsync';

export function useOverview(): AsyncState<OverviewData> {
  return useAsync<OverviewData>(() => getOverview(), []);
}
