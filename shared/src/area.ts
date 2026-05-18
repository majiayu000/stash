export type ReviewCadence = 'daily' | 'weekly' | 'monthly' | 'ad_hoc';

export interface Area {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  reviewCadence: ReviewCadence;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAreaInput {
  name: string;
  description?: string;
  emoji?: string;
  reviewCadence?: ReviewCadence;
}

export type UpdateAreaInput = Partial<CreateAreaInput>;

export const DEFAULT_AREAS: readonly CreateAreaInput[] = [
  { name: 'AI tooling', reviewCadence: 'weekly' },
  { name: 'OM demo', reviewCadence: 'weekly' },
  { name: 'AtlasCloud infra', reviewCadence: 'weekly' },
  { name: 'Personal admin', reviewCadence: 'monthly' },
  { name: 'Writing/social', reviewCadence: 'weekly' },
  { name: 'Learning', reviewCadence: 'monthly' },
] as const;
