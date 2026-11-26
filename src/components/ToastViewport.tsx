import { useCallback, useEffect, useRef, useState } from 'react';
import { TOAST_EVENT_NAME, type ToastItemData, type ToastVariant } from '@/lib/toast';

const MAX_ACTIVE_TOASTS = 4;

interface VariantStyle {
  containerBorder: string;
  iconBg: string;
  iconColor: string;
  badgeClass: string;
  metaClass: string;
  progressBar: string;
}

const VARIANT_STYLES: Record<ToastVariant, VariantStyle> = {
  success: {
    containerBorder: 'border-ccg-green-700/30',
    iconBg: 'bg-ccg-green-100',
    iconColor: 'text-ccg-green-800',
    badgeClass: 'bg-ccg-green-50 text-ccg-green-900 ring-1 ring-ccg-green-700/25',
    metaClass: 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/20',
    progressBar: 'bg-ccg-green-700',
  },
  warning: {
    containerBorder: 'border-amber-400/50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-800',
    badgeClass: 'bg-amber-50 text-amber-950 ring-1 ring-amber-400/40',
    metaClass: 'bg-amber-50 text-amber-950 ring-1 ring-amber-400/35',
    progressBar: 'bg-ccg-yellow-500',
  },
  error: {
    containerBorder: 'border-red-300',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-700',
    badgeClass: 'bg-red-50 text-red-900 ring-1 ring-red-300',
    metaClass: 'bg-red-50 text-red-800 ring-1 ring-red-200',
    progressBar: 'bg-red-600',
  },
  info: {
    containerBorder: 'border-ccg-forest/25',
    iconBg: 'bg-ccg-forest text-ccg-yellow-400',
    iconColor: 'text-ccg-yellow-400',
    badgeClass: 'bg-ccg-yellow-400/25 text-ink-primary ring-1 ring-ccg-yellow-500/40',
    metaClass: 'bg-surface-muted text-ink-secondary ring-1 ring-border-subtle',
    progressBar: 'bg-ccg-yellow-500',
  },
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (variant === 'warning') {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
    );
  }
  if (variant === 'error') {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6m0-6l6 6" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
    </svg>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItemData;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.durationMs);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (toast.durationMs <= 0 || paused) return;

    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, Math.max(remainingRef.current, 0));

    return () => {
      window.clearTimeout(timer);
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [paused, toast.durationMs, toast.id, onDismiss]);

  const style = VARIANT_STYLES[toast.variant];

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`ccg-toast-enter pointer-events-auto relative overflow-hidden rounded-2xl border bg-white shadow-2xl ring-1 ring-black/5 ${style.containerBorder}`}
    >
      <div className="flex items-start gap-3.5 p-4 pr-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg} ${style.iconColor}`}
        >
          <VariantIcon variant={toast.variant} />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-sm font-extrabold leading-snug text-ink-primary sm:text-base">
              {toast.title}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fechar notificação"
              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink-primary"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {toast.description && (
            <p className="text-xs leading-relaxed text-ink-secondary sm:text-sm">
              {toast.description}
            </p>
          )}

          {(toast.badge || toast.meta) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {toast.badge && (
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${style.badgeClass}`}
                >
                  {toast.badge}
                </span>
              )}
              {toast.meta && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${style.metaClass}`}
                >
                  <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  {toast.meta}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {toast.durationMs > 0 && (
        <div className="h-1 w-full bg-surface-muted">
          <div
            className={`ccg-toast-progress h-full ${style.progressBar}`}
            style={{
              animationDuration: `${toast.durationMs}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItemData[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((incoming: ToastItemData) => {
    setToasts((prev) => {
      const withoutDup = prev.filter((item) => item.id !== incoming.id);
      return [...withoutDup, incoming].slice(-MAX_ACTIVE_TOASTS);
    });
  }, []);

  useEffect(() => {
    const handleToastEvent = (event: Event) => {
      const custom = event as CustomEvent<ToastItemData>;
      if (!custom.detail) return;
      pushToast(custom.detail);
    };

    window.addEventListener(TOAST_EVENT_NAME, handleToastEvent);
    window.__ccgToastReady = true;

    const pending = window.__ccgPendingToasts;
    if (Array.isArray(pending) && pending.length > 0) {
      window.__ccgPendingToasts = [];
      for (const item of pending) {
        pushToast(item);
      }
    }

    return () => {
      window.removeEventListener(TOAST_EVENT_NAME, handleToastEvent);
      window.__ccgToastReady = false;
    };
  }, [pushToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notificações do sistema"
      className="pointer-events-none fixed top-20 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-md flex-col gap-3 sm:right-6"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
