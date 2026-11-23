import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { buildShareLinks, copyTextToClipboard } from '@/lib/share';

export interface ShareBadgeProps {
  path: string;
  title: string;
  text: string;
  label?: string;
  ariaLabel?: string;
  variant?: 'overlay' | 'inline' | 'admin';
  align?: 'right' | 'left';
  disabled?: boolean;
  disabledTitle?: string;
  className?: string;
  onCopied?: (url: string) => void;
}

const SHARE_OPEN_EVENT = 'ccg:share-menu-open';

export function ShareBadge({
  path,
  title,
  text,
  label = 'Compartilhar',
  ariaLabel,
  variant = 'inline',
  align = 'right',
  disabled = false,
  disabledTitle,
  className = '',
  onCopied,
}: ShareBadgeProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const instanceId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleOtherShareOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== instanceId) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener(SHARE_OPEN_EVENT, handleOtherShareOpen);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(SHARE_OPEN_EVENT, handleOtherShareOpen);
    };
  }, [open, instanceId]);

  const links = buildShareLinks({ path, title, text });

  const markCopied = (url: string) => {
    setCopied(true);
    onCopied?.(url);
    if (copiedTimerRef.current) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
    }, 2400);
  };

  const handleToggle = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    const next = !open;
    if (next) {
      window.dispatchEvent(new CustomEvent(SHARE_OPEN_EVENT, { detail: { id: instanceId } }));
    }
    setOpen(next);
  };

  const handleCopyLink = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyTextToClipboard(links.url);
    if (ok) {
      markCopied(links.url);
    }
    setOpen(false);
  };

  const handleNativeShare = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title,
        text,
        url: links.url,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const ok = await copyTextToClipboard(links.url);
      if (ok) markCopied(links.url);
    }
  };

  const baseVariantClasses =
    variant === 'overlay'
      ? copied
        ? 'rounded-full bg-ccg-green-800 px-2.5 py-1 text-xs font-semibold text-white shadow-xs ring-1 ring-ccg-green-800'
        : 'rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ccg-green-900 shadow-xs ring-1 ring-ccg-green-800/20 backdrop-blur-xs hover:bg-ccg-green-800 hover:text-white hover:ring-ccg-green-800'
      : variant === 'admin'
        ? copied
          ? 'min-h-[40px] rounded-lg bg-ccg-green-800 px-3 text-xs font-bold text-white ring-1 ring-ccg-green-800'
          : 'min-h-[40px] rounded-lg bg-ccg-green-50 px-3 text-xs font-bold text-ccg-green-900 ring-1 ring-ccg-green-800/25 hover:bg-ccg-green-800 hover:text-white hover:ring-ccg-green-800'
        : copied
          ? 'rounded-full bg-ccg-green-800 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-ccg-green-800'
          : 'rounded-full bg-ccg-green-50 px-2.5 py-0.5 text-xs font-semibold text-ccg-green-900 ring-1 ring-ccg-green-800/20 hover:bg-ccg-green-800 hover:text-white hover:ring-ccg-green-800';

  const disabledClasses = disabled
    ? 'cursor-not-allowed opacity-50 hover:bg-ccg-green-50 hover:text-ccg-green-900 hover:ring-ccg-green-800/25'
    : 'cursor-pointer';

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={disabled ? disabledTitle || 'Indisponível para compartilhamento' : ariaLabel || label}
        aria-label={ariaLabel || label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${baseVariantClasses} ${disabledClasses}`}
      >
        {copied ? (
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        )}
        <span>{copied ? 'Link copiado!' : label}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Opções para compartilhar ${title}`}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full z-50 mt-1.5 w-52 rounded-xl border border-border-subtle bg-white p-1.5 text-left shadow-xl ring-1 ring-black/5 ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Compartilhar link
          </p>

          <button
            type="button"
            role="menuitem"
            onClick={(e) => void handleCopyLink(e)}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-primary transition-colors hover:bg-ccg-green-50 hover:text-ccg-green-900"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-ccg-green-800"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            <span>Copiar link</span>
          </button>

          <a
            role="menuitem"
            href={links.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-primary transition-colors hover:bg-ccg-green-50 hover:text-ccg-green-900"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[#128C7E]"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12.03 2a9.97 9.97 0 0 0-8.6 15.01L2 22l5.13-1.35A9.98 9.98 0 1 0 12.03 2Zm5.82 14.12c-.25.7-1.42 1.34-1.97 1.41-.51.07-1.15.1-1.85-.12-.43-.14-.99-.32-1.7-.63-2.99-1.29-4.94-4.32-5.09-4.52-.15-.2-1.21-1.61-1.21-3.07 0-1.46.76-2.18 1.03-2.48.27-.3.59-.37.79-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.33-.3.5-.15.18-.32.4-.45.53-.15.15-.31.31-.13.61.18.3.8 1.32 1.72 2.14 1.18 1.05 2.18 1.38 2.48 1.53.3.15.48.12.66-.07.18-.2.76-.88.96-1.18.2-.3.41-.25.69-.15.28.1 1.77.83 2.07.98.3.15.5.23.58.35.07.13.07.73-.18 1.43Z" />
            </svg>
            <span>WhatsApp</span>
          </a>

          <a
            role="menuitem"
            href={links.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-primary transition-colors hover:bg-ccg-green-50 hover:text-ccg-green-900"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[#0A66C2]"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77Z" />
            </svg>
            <span>LinkedIn</span>
          </a>

          <a
            role="menuitem"
            href={links.email}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-primary transition-colors hover:bg-ccg-green-50 hover:text-ccg-green-900"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-ink-secondary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span>E-mail</span>
          </a>

          {canNativeShare && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => void handleNativeShare(e)}
              className="mt-1 flex w-full cursor-pointer items-center gap-2.5 border-t border-border-subtle px-2.5 pb-1.5 pt-2 text-xs font-semibold text-ccg-green-800 transition-colors hover:bg-ccg-green-50"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>Mais opções...</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
