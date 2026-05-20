import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { listWorkItems } from '../api/work-items';
import { reportAsyncError } from './reportAsyncError';

/**
 * v0.6 — fire browser notifications for reminders that fell due in the last
 * tick window. Tick every 60s.
 *
 * Permission must be requested by user gesture (ConceptN has a button).
 * The ticker silently no-ops if permission isn't `granted`. We dedupe
 * notifications per item via the Notification tag.
 *
 * Items considered: reminderAt strictly in [lastTick, now], not in done/dropped.
 * The first tick after page load uses `now - 60s` as the lower bound so we
 * don't reflood for stale reminders, but anything within the last minute fires.
 */

const TICK_MS = 60_000;
const STORAGE_KEY = 'stash.remindersFired.v1';

function loadFired(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function persistFired(fired: Set<string>) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(fired))); } catch { /* optional notification dedupe */ }
}

export function ReminderTicker() {
  const lastTick = useRef<number>(Date.now() - TICK_MS);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const fired = loadFired();

    async function tick() {
      if (cancelled) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        lastTick.current = Date.now();
        return;
      }
      try {
        // Server doesn't index reminderAt; pull all open items and filter client-side.
        const items = await listWorkItems({});
        const now = Date.now();
        const lower = lastTick.current;
        for (const it of items) {
          if (!it.reminderAt) continue;
          if (it.status === 'done' || it.status === 'dropped') continue;
          if (fired.has(it.id + ':' + it.reminderAt)) continue;
          const ts = Date.parse(it.reminderAt);
          if (Number.isNaN(ts)) continue;
          if (ts > lower && ts <= now) {
            const n = new Notification(`⏰ ${it.title}`, {
              body: it.description?.slice(0, 200) ?? '(no description)',
              tag: 'stash-reminder:' + it.id,
            });
            n.onclick = () => { window.focus(); navigate(`/c/l/${it.id}`); };
            fired.add(it.id + ':' + it.reminderAt);
          }
        }
        persistFired(fired);
        lastTick.current = now;
      } catch (error) {
        reportAsyncError('reminder tick', error);
      }
    }

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [navigate]);

  return null;
}

/**
 * Imperative helper for the Settings "enable notifications" button.
 * Resolves to true if permission ends up granted.
 */
export async function requestReminderPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch { return false; }
}

export function getReminderPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}
