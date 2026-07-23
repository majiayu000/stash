import { apiGet } from './client';

export interface RuntimeMetadata {
  timeZone: string;
  calendarDate: string;
  now: string;
}

export function getRuntimeMetadata(): Promise<RuntimeMetadata> {
  return apiGet<RuntimeMetadata>('/runtime');
}
