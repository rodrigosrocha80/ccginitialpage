export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastPayload {
  id?: string;
  variant?: ToastVariant;
  title: string;
  description?: string;
  badge?: string;
  meta?: string;
  durationMs?: number;
}

export interface ToastItemData {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  badge?: string;
  meta?: string;
  durationMs: number;
}

export const TOAST_EVENT_NAME = 'ccg:toast';

declare global {
  interface Window {
    __ccgToastReady?: boolean;
    __ccgPendingToasts?: ToastItemData[];
  }
}

function generateToastId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function showToast(payload: ToastPayload): string {
  const id = payload.id || generateToastId();
  if (typeof window === 'undefined') {
    return id;
  }

  const detail: ToastItemData = {
    id,
    variant: payload.variant ?? 'info',
    title: payload.title,
    description: payload.description,
    badge: payload.badge,
    meta: payload.meta,
    durationMs: payload.durationMs ?? 6000,
  };

  if (window.__ccgToastReady) {
    window.dispatchEvent(new CustomEvent<ToastItemData>(TOAST_EVENT_NAME, { detail }));
  } else {
    window.__ccgPendingToasts = window.__ccgPendingToasts ?? [];
    window.__ccgPendingToasts.push(detail);
  }

  return id;
}
