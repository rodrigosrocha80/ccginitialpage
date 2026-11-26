import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface AdminLoginFormProps {
  turnstileSiteKey?: string;
}

export function AdminLoginForm({ turnstileSiteKey = '' }: AdminLoginFormProps) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileContainerRef.current) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !turnstileContainerRef.current || !window.turnstile) return;
      if (turnstileWidgetIdRef.current) return;
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        theme: 'light',
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
      );
      if (existingScript) {
        existingScript.addEventListener('load', renderWidget);
      } else {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.addEventListener('load', renderWidget);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // ignore
        }
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [turnstileSiteKey]);

  const resetTurnstile = () => {
    setTurnstileToken('');
    if (turnstileWidgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {
        // ignore
      }
    }
  };

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (turnstileSiteKey && !turnstileToken) {
      setError('Conclua a verificação de segurança antes de entrar.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: user.trim(),
          password,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.message || 'Usuário ou senha inválidos.');
        resetTurnstile();
        return;
      }
      window.location.reload();
    } catch {
      setError('Erro de conexão ao realizar login.');
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border-subtle bg-white p-6 shadow-sm sm:p-8">
      <div className="border-b border-border-subtle pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ccg-green-800">
          Acesso Restrito — RH CCG
        </p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-ink-primary">
          Gestor de Vagas e Currículos
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Entre com suas credenciais administrativas para gerenciar vagas e baixar currículos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="admin-user" className="mb-1.5 block text-sm font-semibold text-ink-primary">
            Usuário
          </label>
          <input
            id="admin-user"
            type="text"
            required
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="admin-pass" className="mb-1.5 block text-sm font-semibold text-ink-primary">
            Senha
          </label>
          <input
            id="admin-pass"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
          />
        </div>

        {turnstileSiteKey && <div ref={turnstileContainerRef} className="min-h-[65px]" />}

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[46px] w-full cursor-pointer rounded-xl bg-ccg-green-800 px-5 text-base font-bold text-white transition-colors hover:bg-ccg-green-900 disabled:opacity-60"
        >
          {submitting ? 'Entrando...' : 'Acessar Gestor de Vagas'}
        </button>
      </form>
    </div>
  );
}
