import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Input } from './input';
import { Textarea } from './textarea';

type DialogTone = 'default' | 'danger' | 'ok';

export interface PromptOptions {
  title: string;
  description?: ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

export interface AlertOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: DialogTone;
}

export interface WorkbenchDialogApi {
  prompt: (options: string | PromptOptions) => Promise<string | null>;
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
  alert: (options: string | AlertOptions) => Promise<void>;
}

type DialogRequest =
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void };

const WorkbenchDialogContext = createContext<WorkbenchDialogApi | null>(null);

function promptOptions(options: string | PromptOptions): PromptOptions {
  return typeof options === 'string' ? { title: options } : options;
}

function confirmOptions(options: string | ConfirmOptions): ConfirmOptions {
  return typeof options === 'string' ? { title: options } : options;
}

function alertOptions(options: string | AlertOptions): AlertOptions {
  return typeof options === 'string' ? { title: options } : options;
}

export function WorkbenchDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (request?.kind === 'prompt') {
      setValue(request.options.defaultValue ?? '');
    } else {
      setValue('');
    }
  }, [request]);

  const prompt = useCallback((options: string | PromptOptions) => new Promise<string | null>((resolve) => {
    setRequest({ kind: 'prompt', options: promptOptions(options), resolve });
  }), []);

  const confirm = useCallback((options: string | ConfirmOptions) => new Promise<boolean>((resolve) => {
    setRequest({ kind: 'confirm', options: confirmOptions(options), resolve });
  }), []);

  const alert = useCallback((options: string | AlertOptions) => new Promise<void>((resolve) => {
    setRequest({ kind: 'alert', options: alertOptions(options), resolve });
  }), []);

  const api = useMemo(() => ({ prompt, confirm, alert }), [prompt, confirm, alert]);

  function cancel() {
    if (!request) return;
    if (request.kind === 'prompt') request.resolve(null);
    if (request.kind === 'confirm') request.resolve(false);
    if (request.kind === 'alert') request.resolve();
    setRequest(null);
  }

  function submitPrompt(event: FormEvent) {
    event.preventDefault();
    if (request?.kind !== 'prompt') return;
    request.resolve(value);
    setRequest(null);
  }

  function acceptConfirm() {
    if (request?.kind !== 'confirm') return;
    request.resolve(true);
    setRequest(null);
  }

  function acceptAlert() {
    if (request?.kind !== 'alert') return;
    request.resolve();
    setRequest(null);
  }

  const tone = request && request.kind !== 'prompt' ? request.options.tone ?? 'default' : 'default';

  return (
    <WorkbenchDialogContext.Provider value={api}>
      {children}
      <Dialog open={request !== null} onOpenChange={(open) => { if (!open) cancel(); }}>
        {request?.kind === 'prompt' && (
          <DialogContent data-testid="ui-prompt-dialog">
            <form onSubmit={submitPrompt}>
              <DialogHeader>
                <DialogTitle>{request.options.title}</DialogTitle>
                {request.options.description && (
                  <DialogDescription>{request.options.description}</DialogDescription>
                )}
              </DialogHeader>
              <label className="ui-field">
                <span>{request.options.label ?? 'value'}</span>
                {request.options.multiline ? (
                  <Textarea
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={request.options.placeholder}
                    rows={5}
                    data-testid="ui-dialog-input"
                  />
                ) : (
                  <Input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={request.options.placeholder}
                    data-testid="ui-dialog-input"
                  />
                )}
              </label>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={cancel}>
                  {request.options.cancelLabel ?? 'cancel'}
                </Button>
                <Button type="submit" variant="primary" data-testid="ui-dialog-confirm">
                  {request.options.confirmLabel ?? 'save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}

        {request?.kind === 'confirm' && (
          <DialogContent data-testid="ui-confirm-dialog" className={`ui-dialog-${tone}`}>
            <DialogHeader>
              <DialogTitle>{request.options.title}</DialogTitle>
              {request.options.description && (
                <DialogDescription>{request.options.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={cancel}>
                {request.options.cancelLabel ?? 'cancel'}
              </Button>
              <Button
                type="button"
                variant={tone === 'danger' ? 'danger' : 'primary'}
                onClick={acceptConfirm}
                data-testid="ui-dialog-confirm"
              >
                {request.options.confirmLabel ?? 'confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}

        {request?.kind === 'alert' && (
          <DialogContent data-testid="ui-alert-dialog" className={`ui-dialog-${tone}`}>
            <DialogHeader>
              <DialogTitle>{request.options.title}</DialogTitle>
              {request.options.description && (
                <DialogDescription>{request.options.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant={tone === 'danger' ? 'danger' : 'primary'}
                onClick={acceptAlert}
                data-testid="ui-dialog-confirm"
              >
                {request.options.confirmLabel ?? 'ok'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </WorkbenchDialogContext.Provider>
  );
}

export function useWorkbenchDialog(): WorkbenchDialogApi {
  const context = useContext(WorkbenchDialogContext);
  if (!context) throw new Error('useWorkbenchDialog must be used inside WorkbenchDialogProvider');
  return context;
}
