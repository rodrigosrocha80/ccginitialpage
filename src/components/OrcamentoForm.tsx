import { useEffect, useState, type SyntheticEvent } from 'react';
import { buildWhatsAppUrl } from '@/lib/site';

interface OrcamentoFormProps {
  initialEquipment?: string;
  turnstileSiteKey?: string;
}

function validateClientQuote(data: {
  nome: string;
  telefone: string;
  email: string;
  mensagem: string;
  consentimentoLgpd: boolean;
}): Record<string, string> {
  const errs: Record<string, string> = {};
  if (data.nome.trim().length < 2) errs.nome = 'Informe seu nome completo ou nome do responsável.';
  if (data.telefone.trim().length < 8) errs.telefone = 'Informe um telefone ou WhatsApp válido com DDD.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    errs.email = 'Informe um e-mail corporativo ou pessoal válido.';
  }
  if (data.mensagem.trim().length < 5) {
    errs.mensagem = 'Descreva brevemente o equipamento ou serviço desejado.';
  }
  if (!data.consentimentoLgpd) {
    errs.consentimentoLgpd = 'É necessário concordar com a Política de Privacidade para enviar.';
  }
  return errs;
}

export function OrcamentoForm({ initialEquipment = '', turnstileSiteKey = '' }: OrcamentoFormProps) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [equipamentoInteresse, setEquipamentoInteresse] = useState(initialEquipment);
  const [consentimentoLgpd, setConsentimentoLgpd] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eqParam = params.get('equipamento');
    if (eqParam) {
      setEquipamentoInteresse(eqParam);
      setMensagem((prev) =>
        prev ? prev : `Gostaria de solicitar orçamento para locação de: ${eqParam}.`
      );
    }

    const onSelectEquipment = (e: Event) => {
      const custom = e as CustomEvent<{ equipment?: string }>;
      const eq = custom.detail?.equipment;
      if (!eq) return;
      setEquipamentoInteresse(eq);
      setMensagem(`Gostaria de solicitar orçamento para locação de: ${eq}.\nLocal da obra / Prazo estimado: `);
    };

    window.addEventListener('ccg:select-equipment', onSelectEquipment);
    return () => window.removeEventListener('ccg:select-equipment', onSelectEquipment);
  }, []);

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFieldErrors({});
    setFeedback('');

    const payload = {
      nome,
      telefone,
      email,
      mensagem,
      equipamentoInteresse: equipamentoInteresse || undefined,
      consentimentoLgpd,
      website,
    };

    const errs = validateClientQuote(payload);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setStatus('error');
      setFeedback('Por favor, revise os campos destacados.');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok || !json.ok) {
        setStatus('error');
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        setFeedback(
          json.message || 'Não foi possível enviar o formulário. Tente novamente ou use o WhatsApp.'
        );
        return;
      }

      setStatus('success');
      setFeedback(
        json.message ||
          'Solicitação recebida com sucesso! Retornaremos em até 24 horas úteis.'
      );
      setNome('');
      setTelefone('');
      setEmail('');
      setMensagem('');
      setEquipamentoInteresse('');
      setConsentimentoLgpd(false);
    } catch {
      setStatus('error');
      setFeedback(
        'Erro de conexão ao enviar sua solicitação. Utilize o botão de WhatsApp ao lado para atendimento imediato.'
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-2xl border border-border-subtle bg-white p-6 shadow-sm sm:p-8"
      aria-label="Formulário de solicitação de orçamento"
    >
      <div className="border-b border-border-subtle pb-4">
        <h3 className="font-display text-2xl font-bold text-ink-primary">
          Solicite seu orçamento
        </h3>
        <p className="mt-1 text-sm text-ink-secondary">
          Resposta técnica e comercial em até <strong>24 horas úteis</strong>.
        </p>
      </div>

      {equipamentoInteresse && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-ccg-green-50 px-3.5 py-2.5 text-sm text-ccg-green-900 ring-1 ring-ccg-green-800/20">
          <span>
            Item selecionado: <strong>{equipamentoInteresse}</strong>
          </span>
          <button
            type="button"
            onClick={() => setEquipamentoInteresse('')}
            className="min-h-[32px] cursor-pointer px-2 text-xs font-semibold text-ccg-green-800 hover:underline"
          >
            Remover
          </button>
        </div>
      )}

      {/* Campo honeypot invisível para bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website-hp">Não preencher</label>
        <input
          id="website-hp"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="orc-nome" className="mb-1.5 block text-sm font-semibold text-ink-primary">
            Nome ou Empresa *
          </label>
          <input
            id="orc-nome"
            name="nome"
            type="text"
            required
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: João Silva / Construtora"
            aria-invalid={Boolean(fieldErrors.nome)}
            className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
          />
          {fieldErrors.nome && (
            <p className="mt-1 text-xs font-medium text-red-700" role="alert">
              {fieldErrors.nome}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="orc-telefone" className="mb-1.5 block text-sm font-semibold text-ink-primary">
            Telefone / WhatsApp *
          </label>
          <input
            id="orc-telefone"
            name="telefone"
            type="tel"
            required
            autoComplete="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(98) 99999-9999"
            aria-invalid={Boolean(fieldErrors.telefone)}
            className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
          />
          {fieldErrors.telefone && (
            <p className="mt-1 text-xs font-medium text-red-700" role="alert">
              {fieldErrors.telefone}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="orc-email" className="mb-1.5 block text-sm font-semibold text-ink-primary">
          E-mail *
        </label>
        <input
          id="orc-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="engenharia@suaempresa.com.br"
          aria-invalid={Boolean(fieldErrors.email)}
          className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
        />
        {fieldErrors.email && (
          <p className="mt-1 text-xs font-medium text-red-700" role="alert">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="orc-mensagem" className="mb-1.5 block text-sm font-semibold text-ink-primary">
          Equipamento ou serviço desejado *
        </label>
        <textarea
          id="orc-mensagem"
          name="mensagem"
          rows={3}
          required
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Informe as máquinas ou escopo de terraplenagem, cidade da obra e prazo previsto."
          aria-invalid={Boolean(fieldErrors.mensagem)}
          className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
        />
        {fieldErrors.mensagem && (
          <p className="mt-1 text-xs font-medium text-red-700" role="alert">
            {fieldErrors.mensagem}
          </p>
        )}
      </div>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={consentimentoLgpd}
            onChange={(e) => setConsentimentoLgpd(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-border-subtle text-ccg-green-800 focus:ring-ccg-yellow-500"
          />
          <span>
            Concordo com o tratamento dos meus dados para retorno comercial conforme a{' '}
            <a href="/privacidade" className="font-semibold text-ccg-green-800 underline">
              Política de Privacidade
            </a>{' '}
            (LGPD).
          </span>
        </label>
        {fieldErrors.consentimentoLgpd && (
          <p className="mt-1 text-xs font-medium text-red-700" role="alert">
            {fieldErrors.consentimentoLgpd}
          </p>
        )}
      </div>

      {turnstileSiteKey && (
        <div
          className="cf-turnstile"
          data-sitekey={turnstileSiteKey}
          data-theme="light"
        />
      )}

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl p-4 text-sm font-medium ${
            status === 'success'
              ? 'bg-ccg-green-50 text-ccg-green-900 ring-1 ring-ccg-green-700/30'
              : 'bg-red-50 text-red-800 ring-1 ring-red-600/30'
          }`}
        >
          <p>{feedback}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 pt-1 sm:flex-row">
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="min-h-[48px] flex-1 cursor-pointer rounded-xl bg-ccg-green-800 px-6 py-3 text-base font-bold text-white shadow-xs transition-colors hover:bg-ccg-green-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'submitting' ? 'Enviando solicitação...' : 'Enviar pedido de orçamento'}
        </button>
        <a
          href={buildWhatsAppUrl(
            equipamentoInteresse
              ? `Olá! Quero cotar ${equipamentoInteresse} com a CCG Locações.`
              : undefined
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-ccg-green-800 bg-ccg-green-50 px-5 py-3 text-base font-bold text-ccg-green-900 transition-colors hover:bg-ccg-green-100"
        >
          Falar no WhatsApp
        </a>
      </div>
    </form>
  );
}
