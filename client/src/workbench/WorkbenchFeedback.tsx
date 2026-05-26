import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

export type WorkbenchToastTone = 'info' | 'success' | 'error';

export interface WorkbenchToastAction {
  label: string;
  run: () => void | Promise<void>;
}

interface ToastOptions {
  tone?: WorkbenchToastTone;
  action?: WorkbenchToastAction;
  timeoutMs?: number;
}

interface ToastEntry {
  id: number;
  message: string;
  tone: WorkbenchToastTone;
  action?: WorkbenchToastAction;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  multiline?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export interface AlertOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: WorkbenchToastTone;
}

interface DialogEntry {
  id: number;
  kind: 'prompt' | 'confirm' | 'alert';
  title: string;
  message?: string;
  value: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  multiline: boolean;
  tone: 'default' | 'danger';
  resolve: (value: string | boolean | null) => void;
}

interface WorkbenchFeedbackApi {
  toast: (message: string, options?: ToastOptions) => () => void;
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const fallbackApi: WorkbenchFeedbackApi = {
  toast: (message) => {
    console.warn(`Workbench feedback provider missing: ${message}`);
    return () => {};
  },
  prompt: async () => null,
  confirm: async () => false,
  alert: async (options) => {
    console.warn(typeof options === 'string' ? options : options.message);
  },
};

const WorkbenchFeedbackContext = createContext<WorkbenchFeedbackApi>(fallbackApi);

export function useWorkbenchFeedback(): WorkbenchFeedbackApi {
  return useContext(WorkbenchFeedbackContext);
}

export function WorkbenchFeedbackProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(1);
  const dialogQueue = useRef<DialogEntry[]>([]);
  const activeDialog = useRef<DialogEntry | null>(null);
  const toastTimers = useRef<Map<number, number>>(new Map());

  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [dialog, setDialog] = useState<DialogEntry | null>(null);

  const removeToast = useCallback((id: number) => {
    const timer = toastTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId.current++;
    const entry: ToastEntry = {
      id,
      message,
      tone: options.tone ?? 'info',
      action: options.action,
    };

    setToasts((current) => [...current.slice(-3), entry]);

    const timeoutMs = options.timeoutMs ?? (options.action ? 8000 : 2600);
    const timer = window.setTimeout(() => removeToast(id), timeoutMs);
    toastTimers.current.set(id, timer);

    return () => removeToast(id);
  }, [removeToast]);

  const setActiveDialog = useCallback((entry: DialogEntry | null) => {
    activeDialog.current = entry;
    setDialog(entry);
  }, []);

  const enqueueDialog = useCallback((entry: Omit<DialogEntry, 'id' | 'resolve'>) => {
    return new Promise<string | boolean | null>((resolve) => {
      const next: DialogEntry = { ...entry, id: nextId.current++, resolve };
      if (activeDialog.current) {
        dialogQueue.current.push(next);
        return;
      }
      setActiveDialog(next);
    });
  }, [setActiveDialog]);

  const finishDialog = useCallback((value: string | boolean | null) => {
    const current = activeDialog.current;
    if (!current) return;
    current.resolve(value);
    setActiveDialog(dialogQueue.current.shift() ?? null);
  }, [setActiveDialog]);

  const prompt = useCallback(async (options: PromptOptions) => {
    const value = await enqueueDialog({
      kind: 'prompt',
      title: options.title,
      message: options.message,
      value: options.defaultValue ?? '',
      placeholder: options.placeholder,
      confirmLabel: options.confirmLabel ?? 'Save',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      multiline: options.multiline ?? false,
      tone: 'default',
    });
    return typeof value === 'string' ? value : null;
  }, [enqueueDialog]);

  const confirm = useCallback(async (options: ConfirmOptions) => {
    const value = await enqueueDialog({
      kind: 'confirm',
      title: options.title,
      message: options.message,
      value: '',
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      multiline: false,
      tone: options.tone ?? 'default',
    });
    return value === true;
  }, [enqueueDialog]);

  const alert = useCallback(async (options: AlertOptions | string) => {
    const normalized = typeof options === 'string'
      ? { message: options }
      : options;

    await enqueueDialog({
      kind: 'alert',
      title: normalized.title ?? (normalized.tone === 'error' ? 'Error' : 'Notice'),
      message: normalized.message,
      value: '',
      confirmLabel: normalized.confirmLabel ?? 'OK',
      cancelLabel: '',
      multiline: false,
      tone: normalized.tone === 'error' ? 'danger' : 'default',
    });
  }, [enqueueDialog]);

  const api = useMemo<WorkbenchFeedbackApi>(() => ({
    toast,
    prompt,
    confirm,
    alert,
  }), [alert, confirm, prompt, toast]);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer));
      toastTimers.current.clear();
    };
  }, []);

  return (
    <WorkbenchFeedbackContext.Provider value={api}>
      {children}
      <WorkbenchToasts toasts={toasts} removeToast={removeToast} toast={toast} />
      {dialog && <WorkbenchDialog dialog={dialog} finish={finishDialog} />}
      <style>{feedbackStyles}</style>
    </WorkbenchFeedbackContext.Provider>
  );
}

function WorkbenchToasts({
  toasts,
  removeToast,
  toast,
}: {
  toasts: ToastEntry[];
  removeToast: (id: number) => void;
  toast: WorkbenchFeedbackApi['toast'];
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="wb-toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((entry) => (
        <div key={entry.id} className={`wb-toast ${entry.tone}`} role="status" data-testid="wb-toast">
          <span className="wb-toast-message">{entry.message}</span>
          {entry.action && (
            <button
              type="button"
              className="wb-toast-action"
              onClick={() => {
                void Promise.resolve(entry.action?.run())
                  .catch((err) => {
                    toast(err instanceof Error ? err.message : String(err), { tone: 'error' });
                  })
                  .finally(() => removeToast(entry.id));
              }}
            >
              {entry.action.label}
            </button>
          )}
          <button
            type="button"
            className="wb-toast-close"
            onClick={() => removeToast(entry.id)}
            aria-label="dismiss"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function WorkbenchDialog({
  dialog,
  finish,
}: {
  dialog: DialogEntry;
  finish: (value: string | boolean | null) => void;
}) {
  const [value, setValue] = useState(dialog.value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setValue(dialog.value);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [dialog.id, dialog.value]);

  function submitDialog(e: FormEvent) {
    e.preventDefault();
    if (dialog.kind === 'prompt') {
      finish(value);
      return;
    }
    finish(true);
  }

  function cancel() {
    finish(dialog.kind === 'prompt' ? null : false);
  }

  return (
    <div
      className="wb-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dialog.kind !== 'alert') cancel();
      }}
    >
      <form
        className={`wb-dialog ${dialog.tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        onSubmit={submitDialog}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
          if (dialog.multiline && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            finish(value);
          }
        }}
      >
        <div className="wb-dialog-title">{dialog.title}</div>
        {dialog.message && <div className="wb-dialog-message">{dialog.message}</div>}
        {dialog.kind === 'prompt' && (
          dialog.multiline ? (
            <textarea
              ref={(node) => { inputRef.current = node; }}
              className="wb-dialog-input multiline"
              value={value}
              placeholder={dialog.placeholder}
              onChange={(e) => setValue(e.target.value)}
              rows={5}
              data-testid="wb-dialog-input"
            />
          ) : (
            <input
              ref={(node) => { inputRef.current = node; }}
              className="wb-dialog-input"
              value={value}
              placeholder={dialog.placeholder}
              onChange={(e) => setValue(e.target.value)}
              data-testid="wb-dialog-input"
            />
          )
        )}
        <div className="wb-dialog-actions">
          {dialog.kind !== 'alert' && (
            <button type="button" className="wb-dialog-btn ghost" onClick={cancel}>
              {dialog.cancelLabel}
            </button>
          )}
          <button
            type="submit"
            className={`wb-dialog-btn primary ${dialog.tone === 'danger' ? 'danger' : ''}`}
            data-testid="wb-dialog-confirm"
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

const feedbackStyles = `
.wb-toast-stack {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 2200;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.55rem;
  pointer-events: none;
}
.wb-toast {
  min-width: min(360px, calc(100vw - 3rem));
  max-width: min(440px, calc(100vw - 3rem));
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.65rem;
  pointer-events: auto;
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-left: 3px solid var(--neon-cyan, #00fff2);
  border-radius: 8px;
  padding: 0.55rem 0.75rem 0.55rem 0.85rem;
  box-shadow: 0 14px 36px rgba(0,0,0,0.45);
  animation: wb-toast-in 0.16s ease;
}
.wb-toast.success { border-left-color: var(--neon-green, #30d158); }
.wb-toast.error { border-left-color: var(--neon-pink, #ff375f); }
.wb-toast-message {
  min-width: 0;
  color: var(--text-primary, #fff);
  font: 0.76rem/1.45 var(--font-mono);
  overflow-wrap: anywhere;
}
.wb-toast-action,
.wb-toast-close {
  font: 0.7rem var(--font-mono);
  border-radius: 4px;
  cursor: pointer;
}
.wb-toast-action {
  color: var(--neon-cyan, #00fff2);
  border: 1px solid rgba(0,255,242,0.35);
  background: rgba(0,255,242,0.08);
  padding: 3px 8px;
}
.wb-toast-close {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #888);
  border: 1px solid var(--border-hair, rgba(255,255,255,0.1));
  background: transparent;
  padding: 0;
}
.wb-toast-close:hover { color: var(--text-primary, #fff); border-color: var(--border-subtle, rgba(255,255,255,0.22)); }
@keyframes wb-toast-in {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.wb-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2300;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: rgba(0,0,0,0.58);
  backdrop-filter: blur(8px);
}
.wb-dialog {
  width: min(460px, 94vw);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.05rem;
  background: var(--bg-elevated, #161620);
  border: 1px solid var(--border-glow, rgba(0,255,242,0.3));
  border-radius: 10px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.06);
}
.wb-dialog.danger { border-color: rgba(255,55,95,0.45); }
.wb-dialog-title {
  color: var(--text-primary, #fff);
  font: 700 0.92rem/1.2 var(--font-mono);
}
.wb-dialog-message {
  color: var(--text-secondary, #ccc);
  font: 0.82rem/1.55 var(--font-body);
  white-space: pre-wrap;
}
.wb-dialog-input {
  width: 100%;
  background: var(--bg-void, #0a0a14);
  color: var(--text-primary, #fff);
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.16));
  border-radius: 7px;
  outline: none;
  padding: 0.65rem 0.75rem;
  font: 0.88rem/1.45 var(--font-mono);
}
.wb-dialog-input.multiline {
  resize: vertical;
  min-height: 120px;
}
.wb-dialog-input:focus {
  border-color: var(--neon-cyan, #00fff2);
  box-shadow: 0 0 0 3px rgba(0,255,242,0.1);
}
.wb-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  padding-top: 0.15rem;
}
.wb-dialog-btn {
  min-width: 76px;
  height: 34px;
  border-radius: 6px;
  font: 700 0.75rem var(--font-mono);
  cursor: pointer;
}
.wb-dialog-btn.ghost {
  color: var(--text-secondary, #ccc);
  background: transparent;
  border: 1px solid var(--border-hair, rgba(255,255,255,0.1));
}
.wb-dialog-btn.primary {
  color: var(--bg-void, #0a0a14);
  background: var(--neon-cyan, #00fff2);
  border: 1px solid var(--neon-cyan, #00fff2);
}
.wb-dialog-btn.primary.danger {
  color: white;
  background: var(--neon-pink, #ff375f);
  border-color: var(--neon-pink, #ff375f);
}
`;
