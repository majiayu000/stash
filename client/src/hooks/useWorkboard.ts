import { getWorkboard, type WorkboardData } from '../api/workboard';
import { useAsync, type AsyncState } from './useAsync';

export function useWorkboard(): AsyncState<WorkboardData> {
  return useAsync<WorkboardData>(() => getWorkboard(), []);
}
