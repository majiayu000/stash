export interface ProjectIntent {
  projectId: string;
  text: string;
  updatedAt: string;
}

export type MilestoneStatus = 'planned' | 'wip' | 'done';

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  date?: string;
  status: MilestoneStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestoneInput {
  name: string;
  date?: string;
  status?: MilestoneStatus;
  progress?: number;
}

export type UpdateMilestoneInput = Partial<CreateMilestoneInput>;

export interface Decision {
  id: string;
  projectId: string;
  date: string;
  title: string;
  body: string;
  tags: string[];
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDecisionInput {
  date?: string;
  title: string;
  body?: string;
  tags?: string[];
  sessionId?: string;
}

export type UpdateDecisionInput = Partial<CreateDecisionInput>;

export interface ProjectNotes {
  projectId: string;
  markdown: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  projectId?: string;
  title: string;
  body: string;
  tags: string[];
  cross: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLessonInput {
  title: string;
  body?: string;
  tags?: string[];
  cross?: boolean;
  /** When omitted the lesson is cross-project (projectId stays null). */
  projectId?: string;
}

export type UpdateLessonInput = Partial<CreateLessonInput>;
