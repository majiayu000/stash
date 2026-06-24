import type { ChecklistItem, WorkItem } from '@stash/shared';

export interface IdeaDecompositionPromptInput {
  idea: WorkItem;
  projectContext?: string;
}

export interface TaskCoachPromptInput {
  task: WorkItem;
  question: string;
  recentJournal?: string[];
}

export interface CoachSummaryPromptInput {
  task: WorkItem;
  messages: string[];
  destination: 'journal' | 'description';
}

export interface MeetingTriagePromptInput {
  title?: string;
  text: string;
}

function formatChecklist(checklist: ChecklistItem[]): string {
  if (checklist.length === 0) return 'none';
  return checklist.map((item) => `- [${item.completed ? 'x' : ' '}] ${item.text}`).join('\n');
}

function taskBlock(item: WorkItem): string {
  return [
    `Title: ${item.title}`,
    `Kind: ${item.kind}`,
    `Status: ${item.status}`,
    `Priority: ${item.priority}`,
    item.description ? `Description: ${item.description}` : undefined,
    item.outcome ? `Outcome: ${item.outcome}` : undefined,
    item.context ? `Context: ${item.context}` : undefined,
    item.labels.length ? `Labels: ${item.labels.join(', ')}` : undefined,
    `Checklist:\n${formatChecklist(item.checklist)}`,
  ].filter((line): line is string => line !== undefined).join('\n');
}

export function buildIdeaDecompositionPrompt(input: IdeaDecompositionPromptInput): string {
  return [
    'You turn one captured idea into concrete todo drafts.',
    'Return only JSON. Do not include markdown.',
    '',
    'Required JSON shape:',
    '{"drafts":[{"title":"string","description":"string","priority":"p0|p1|p2|p3","labels":["string"],"checklist":[{"text":"string","completed":false}],"sourceSpans":[{"text":"string"}]}]}',
    '',
    'Rules:',
    '- Do not mark anything as an official todo. These are drafts for human review.',
    '- Prefer 2-6 concrete tasks.',
    '- Use sourceSpans to quote the idea text that supports each draft.',
    '- If the idea is too vague, return one draft that asks for clarification.',
    '',
    'Idea:',
    taskBlock(input.idea),
    input.projectContext ? `\nProject context:\n${input.projectContext}` : undefined,
  ].filter((line): line is string => line !== undefined).join('\n');
}

export function buildTaskCoachPrompt(input: TaskCoachPromptInput): string {
  return [
    'You are a task coach inside a local-first todo app.',
    'Return only JSON. Do not include markdown.',
    '',
    'Required JSON shape:',
    '{"reply":"string","suggestedActions":["string"]}',
    '',
    'Rules:',
    '- Give specific next actions for this task.',
    '- Do not claim you changed the todo. You can only suggest changes.',
    '- Keep the reply concise.',
    '',
    'Task:',
    taskBlock(input.task),
    input.recentJournal?.length ? `\nRecent journal:\n${input.recentJournal.join('\n')}` : undefined,
    '',
    `User question: ${input.question}`,
  ].filter((line): line is string => line !== undefined).join('\n');
}

export function buildCoachSummaryPrompt(input: CoachSummaryPromptInput): string {
  return [
    'Summarize task-coach messages into a user-reviewable write.',
    'Return only JSON. Do not include markdown.',
    '',
    'Required JSON shape:',
    '{"summary":"string","destination":"journal|description","sourceSpans":[{"text":"string"}]}',
    '',
    'Rules:',
    '- Do not write directly to the todo.',
    '- The user will choose whether to append this summary.',
    '- Preserve provenance with sourceSpans from the messages.',
    '',
    'Task:',
    taskBlock(input.task),
    '',
    `Requested destination: ${input.destination}`,
    '',
    'Messages:',
    input.messages.join('\n'),
  ].join('\n');
}

export function buildMeetingTriagePrompt(input: MeetingTriagePromptInput): string {
  return [
    'Turn meeting notes into reviewable todo drafts.',
    'Return only JSON. Do not include markdown.',
    '',
    'Required JSON shape:',
    '{"drafts":[{"title":"string","description":"string","priority":"p0|p1|p2|p3","labels":["string"],"sourceSpans":[{"text":"string"}],"reviewFlags":["high_risk|unclear|missing_source_span"],"reviewReason":"string"}]}',
    '',
    'Rules:',
    '- Do not create official todos. These are drafts for human review.',
    '- Use sourceSpans to quote exact meeting text supporting each draft.',
    '- Mark unclear drafts with reviewFlags: ["unclear"].',
    '- Mark destructive, secret, payment, legal, production, or data-loss actions as high_risk.',
    '',
    input.title ? `Meeting title: ${input.title}` : undefined,
    'Meeting notes:',
    input.text,
  ].filter((line): line is string => line !== undefined).join('\n');
}
