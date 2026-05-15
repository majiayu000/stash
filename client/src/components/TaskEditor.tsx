import { useEffect, useState } from 'react';
import type {
  AgentProvider,
  Priority,
  UpdateWorkItemInput,
  WorkItem,
  WorkItemKind,
  WorkItemStatus,
} from '@stash/shared';
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES, PRIORITIES } from '@stash/shared';
import {
  linkSession,
  listAgentSessions,
  listLinkedSessions,
  unlinkSession,
  type AgentSessionWithLinks,
  type LinkedSessionEdge,
} from '../api/agent-sessions';
import { inferEvidence } from '../api/evidence';
import { ProviderBadge } from './ProviderBadge';

export interface TaskEditorProps {
  item: WorkItem | undefined;
  onSave: (patch: UpdateWorkItemInput) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

export function TaskEditor({ item, onSave, onDelete }: TaskEditorProps) {
  const [draft, setDraft] = useState<UpdateWorkItemInput>({});
  const [busy, setBusy] = useState(false);
  const [linkedSessions, setLinkedSessions] = useState<LinkedSessionEdge[]>([]);
  const [availableSessions, setAvailableSessions] = useState<AgentSessionWithLinks[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [picker, setPicker] = useState<string>('');

  useEffect(() => {
    setDraft({});
    setPicker('');
    if (!item) {
      setLinkedSessions([]);
      return;
    }
    listLinkedSessions(item.id).then(setLinkedSessions).catch(() => setLinkedSessions([]));
    listAgentSessions('all')
      .then((r) => setAvailableSessions(r.sessions))
      .catch(() => setAvailableSessions([]));
  }, [item?.id]);

  async function link() {
    if (!item || !picker) return;
    const [provider, sessionId] = picker.split('::') as [AgentProvider, string];
    setLinkBusy(true);
    try {
      await linkSession(item.id, provider, sessionId);
      const fresh = await listLinkedSessions(item.id);
      setLinkedSessions(fresh);
      setPicker('');
    } finally {
      setLinkBusy(false);
    }
  }

  async function unlink(provider: AgentProvider, sessionId: string) {
    if (!item) return;
    setLinkBusy(true);
    try {
      await unlinkSession(item.id, provider, sessionId);
      const fresh = await listLinkedSessions(item.id);
      setLinkedSessions(fresh);
    } finally {
      setLinkBusy(false);
    }
  }

  if (!item) {
    return (
      <div className="text-muted text-xs p-3">
        Select a task to edit, or capture a new one on the left.
      </div>
    );
  }

  function patch(field: keyof UpdateWorkItemInput, value: unknown) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  const merged: WorkItem = { ...item, ...(draft as Partial<WorkItem>) };

  async function save() {
    setBusy(true);
    try {
      await onSave(draft);
      setDraft({});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="task-editor">
      <Field label="Title">
        <input
          className="input"
          value={merged.title}
          onChange={(e) => patch('title', e.target.value)}
          data-testid="editor-title"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Kind">
          <Select
            value={merged.kind}
            onChange={(v) => patch('kind', v as WorkItemKind)}
            options={WORK_ITEM_KINDS}
          />
        </Field>
        <Field label="Status">
          <Select
            value={merged.status}
            onChange={(v) => patch('status', v as WorkItemStatus)}
            options={WORK_ITEM_STATUSES}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Priority">
          <Select
            value={merged.priority}
            onChange={(v) => patch('priority', v as Priority)}
            options={PRIORITIES}
          />
        </Field>
        <Field label="Scheduled">
          <input
            type="date"
            className="input"
            value={merged.scheduledFor ?? ''}
            onChange={(e) => patch('scheduledFor', e.target.value || undefined)}
          />
        </Field>
      </div>

      <Field label="Outcome / done-when">
        <textarea
          className="input min-h-[80px]"
          value={merged.outcome ?? ''}
          onChange={(e) => patch('outcome', e.target.value)}
        />
      </Field>

      <Field label="Notes">
        <textarea
          className="input min-h-[80px]"
          value={merged.context ?? ''}
          onChange={(e) => patch('context', e.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || Object.keys(draft).length === 0}
          onClick={save}
          data-testid="editor-save"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {onDelete ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onDelete(item.id)}
          >
            Delete
          </button>
        ) : null}
      </div>

      <div className="border-t border-line pt-3 mt-2 flex flex-col gap-2">
        <div className="label">Linked sessions</div>
        {linkedSessions.length === 0 ? (
          <div className="text-muted text-[11px]">No sessions linked.</div>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="linked-sessions">
            {linkedSessions.map((l) => {
              const meta = availableSessions.find(
                (s) => s.provider === l.provider && s.id === l.sessionId,
              );
              return (
                <li
                  key={`${l.provider}:${l.sessionId}`}
                  className="flex items-center gap-2 text-[12px] border border-line rounded-md p-2 bg-surface"
                  data-testid="linked-session"
                  data-session-id={l.sessionId}
                >
                  <ProviderBadge provider={l.provider} />
                  <span className="flex-1 truncate">{meta?.title ?? l.sessionId}</span>
                  <button
                    type="button"
                    className="btn h-7 px-2 text-[11px]"
                    disabled={linkBusy}
                    onClick={() => unlink(l.provider, l.sessionId)}
                    data-testid={`unlink-${l.sessionId}`}
                  >
                    Unlink
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {linkedSessions.length > 0 ? (
          <button
            type="button"
            className="btn"
            data-testid="detect-completion"
            disabled={!item || linkBusy}
            onClick={async () => {
              if (!item) return;
              setLinkBusy(true);
              try {
                await inferEvidence(item.id);
              } finally {
                setLinkBusy(false);
              }
            }}
          >
            Detect completion from sessions
          </button>
        ) : null}

        <div className="flex gap-2 items-center">
          <select
            className="input flex-1"
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            data-testid="session-picker"
          >
            <option value="">Pick a session…</option>
            {availableSessions
              .filter(
                (s) => !linkedSessions.some((l) => l.provider === s.provider && l.sessionId === s.id),
              )
              .map((s) => (
                <option key={`${s.provider}:${s.id}`} value={`${s.provider}::${s.id}`}>
                  [{s.provider}] {s.title}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={link}
            disabled={linkBusy || !picker}
            data-testid="link-session"
          >
            Link
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
