import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { JournalEntry, Lesson, WorkItem } from '@stash/shared';
import { listLinkedSessions, type LinkedSessionEdge } from '../../api/agent-sessions';
import { apiGet } from '../../api/client';
import { getWorkItem, listJournal } from '../../api/work-items';
import type { WBTodo } from '../data';
import { reportAsyncError } from '../reportAsyncError';

export function useEscToClose(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) return;
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function useTodoDetailResources(todo: WBTodo): {
  itemState: WorkItem | null;
  setItem: Dispatch<SetStateAction<WorkItem | null>>;
  realSubs: WorkItem[] | null;
  setRealSubs: Dispatch<SetStateAction<WorkItem[] | null>>;
  lessons: Lesson[];
} {
  const [itemState, setItem] = useState<WorkItem | null>(null);
  const [realSubs, setRealSubs] = useState<WorkItem[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    let cancelled = false;
    setRealSubs(null);
    setLessons([]);

    async function loadItem() {
      try {
        const item = await getWorkItem(todo.id);
        if (!cancelled) setItem(item);
      } catch (error) {
        if (!cancelled) reportAsyncError('load todo detail', error, loadItem);
      }
    }

    async function loadSubtasks() {
      try {
        const response = await apiGet<{ data: WorkItem[] }>(`/work-items/${todo.id}/subtasks`);
        if (!cancelled) setRealSubs(response.data);
      } catch (error) {
        if (!cancelled) {
          setRealSubs([]);
          reportAsyncError('load subtasks', error, loadSubtasks);
        }
      }
    }

    const params = new URLSearchParams();
    if (todo.project) params.set('projectId', todo.project);
    todo.tags.forEach((tag) => params.append('label', tag.replace(/^#/, '')));
    params.set('limit', '3');
    async function loadLessons() {
      try {
        const response = await apiGet<{ data: Lesson[] }>(`/lessons/relevant?${params.toString()}`);
        if (!cancelled) setLessons(response.data);
      } catch (error) {
        if (!cancelled) {
          setLessons([]);
          reportAsyncError('load relevant lessons', error, loadLessons);
        }
      }
    }

    void loadItem();
    void loadSubtasks();
    void loadLessons();
    return () => { cancelled = true; };
  }, [todo.id]);

  return { itemState, setItem, realSubs, setRealSubs, lessons };
}

export function useJournalEntries(workItemId: string): {
  journalEntries: JournalEntry[];
  setJournalEntries: Dispatch<SetStateAction<JournalEntry[]>>;
  refreshJournal: () => Promise<void>;
} {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const requestVersion = useRef(0);
  const refreshJournal = useCallback(async function refreshJournalRequest() {
    const version = ++requestVersion.current;
    try {
      const rows = await listJournal(workItemId);
      if (version === requestVersion.current) setJournalEntries(rows);
    } catch (error) {
      if (version === requestVersion.current) {
        reportAsyncError('load todo journal', error, refreshJournalRequest);
      }
    }
  }, [workItemId]);

  useEffect(() => {
    setJournalEntries([]);
    void refreshJournal();
    return () => { requestVersion.current += 1; };
  }, [refreshJournal]);

  return { journalEntries, setJournalEntries, refreshJournal };
}

export function useLinkedSessionEdges(workItemId: string): {
  linkedEdges: LinkedSessionEdge[];
  setLinkedEdges: Dispatch<SetStateAction<LinkedSessionEdge[]>>;
  refreshLinkedSessions: () => Promise<void>;
} {
  const [linkedEdges, setLinkedEdges] = useState<LinkedSessionEdge[]>([]);
  const requestVersion = useRef(0);
  const refreshLinkedSessions = useCallback(async function refreshLinkedSessionRequest() {
    const version = ++requestVersion.current;
    try {
      const edges = await listLinkedSessions(workItemId);
      if (version === requestVersion.current) setLinkedEdges(edges);
    } catch (error) {
      if (version === requestVersion.current) {
        reportAsyncError('load linked sessions', error, refreshLinkedSessionRequest);
      }
    }
  }, [workItemId]);

  useEffect(() => {
    setLinkedEdges([]);
    void refreshLinkedSessions();
    return () => { requestVersion.current += 1; };
  }, [refreshLinkedSessions]);

  return { linkedEdges, setLinkedEdges, refreshLinkedSessions };
}
