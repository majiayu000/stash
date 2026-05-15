export type SkillSource = 'official' | 'community';

export interface Skill {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  source: SkillSource;
  stars: number;
  installed: boolean;
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillInput {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  source?: SkillSource;
  stars?: number;
  installed?: boolean;
  version?: string;
}

export type UpdateSkillInput = Partial<Omit<CreateSkillInput, 'id'>>;

export interface ProjectSkillBinding {
  projectId: string;
  skillId: string;
  enabled: boolean;
  boundAt: string;
}
