import { useEffect, useMemo, useRef, useState, type DragEvent, type SyntheticEvent } from 'react';
import { upload } from '@vercel/blob/client';
import { ShareBadge } from '@/components/ShareBadge';
import {
  ALLOWED_RESUME_EXTENSIONS,
  MAX_RESUME_BYTES,
  formatBytes,
  isAllowedResumeFile,
  type Vaga,
} from '@/lib/careersSchema';
import { buildVagaShareData } from '@/lib/share';

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

interface VagasPortalProps {
  initialVagas: Vaga[];
  uploadMode: 'vercel_blob' | 'local' | 'unconfigured';
  blobAccess: 'private' | 'public';
  turnstileSiteKey?: string;
}

function sanitizeSlugName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'curriculo.pdf'
  );
}

function splitLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

export function VagasPortal({
  initialVagas,
  uploadMode,
  blobAccess,
  turnstileSiteKey = '',
}: VagasPortalProps) {
  const [vagas] = useState<Vaga[]>(initialVagas);
  const [busca, setBusca] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroModalidade, setFiltroModalidade] = useState('');
  const [vagaDetalhes, setVagaDetalhes] = useState<Vaga | null>(null);
  const [sharedVagaNotFound, setSharedVagaNotFound] = useState(false);
  const [selectedVagaId, setSelectedVagaId] = useState<string>(
    initialVagas[0]?.id || ''
  );

  // Campos do formulário de candidatura
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cidadeUf, setCidadeUf] = useState('');
  const [cpf, setCpf] = useState('');
  const [cnh, setCnh] = useState('');
  const [experienciaResumo, setExperienciaResumo] = useState('');
  const [pretensaoSalarial, setPretensaoSalarial] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [consentimentoLgpd, setConsentimentoLgpd] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [turnstileToken, setTurnstileToken] = useState('');

  // Estado do arquivo de currículo
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Estado de submissão
  const [status, setStatus] = useState<'idle' | 'uploading' | 'submitting' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');
  const [protocolo, setProtocolo] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const formRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  const areas = useMemo(
    () => Array.from(new Set(vagas.map((v) => v.area))).sort((a, b) => a.localeCompare(b)),
    [vagas]
  );

  const modalidades = useMemo(
    () => Array.from(new Set(vagas.map((v) => v.modalidade))),
    [vagas]
  );

  const vagasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vagas.filter((v) => {
      if (filtroArea && v.area !== filtroArea) return false;
      if (filtroModalidade && v.modalidade !== filtroModalidade) return false;
      if (!q) return true;
      return (
        v.titulo.toLowerCase().includes(q) ||
        v.area.toLowerCase().includes(q) ||
        v.localidade.toLowerCase().includes(q) ||
        v.resumo.toLowerCase().includes(q)
      );
    });
  }, [vagas, busca, filtroArea, filtroModalidade]);

  const selectedVaga = useMemo(
    () => vagas.find((v) => v.id === selectedVagaId) || null,
    [vagas, selectedVagaId]
  );

  // Ler ?vaga=<slug> na URL para pré-selecionar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vagaSlug = params.get('vaga');
    if (vagaSlug) {
      const found = vagas.find((v) => v.slug === vagaSlug || v.id === vagaSlug);
      if (found) {
        setSelectedVagaId(found.id);
        setVagaDetalhes(found);
        setSharedVagaNotFound(false);
      } else {
        setSharedVagaNotFound(true);
      }
    }
  }, [vagas]);

  // Fechar modal com Escape (sem interferir quando um menu de compartilhamento estiver aberto)
  useEffect(() => {
    if (!vagaDetalhes) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')) return;
      setVagaDetalhes(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [vagaDetalhes]);

  // Cloudflare Turnstile opcional
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

  const handleSelectVagaToApply = (vagaId: string) => {
    setSelectedVagaId(vagaId);
    setVagaDetalhes(null);
    setStatus('idle');
    setFeedback('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFileValidation = (file: File | null) => {
    if (!file) {
      setResumeFile(null);
      return;
    }
    if (!isAllowedResumeFile(file.name, file.type)) {
      setFieldErrors((prev) => ({
        ...prev,
        curriculo: `Formato inválido. Envie apenas ${ALLOWED_RESUME_EXTENSIONS.join(', ').toUpperCase()}.`,
      }));
      setResumeFile(null);
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setFieldErrors((prev) => ({
        ...prev,
        curriculo: `O arquivo selecionado tem ${formatBytes(file.size)}. O limite máximo é 10 MB.`,
      }));
      setResumeFile(null);
      return;
    }
    if (file.size === 0) {
      setFieldErrors((prev) => ({
        ...prev,
        curriculo: 'O arquivo selecionado está vazio.',
      }));
      setResumeFile(null);
      return;
    }

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.curriculo;
      return next;
    });
    setResumeFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFileValidation(file);
  };

  const validateForm = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (nome.trim().length < 3) errs.nome = 'Informe seu nome completo.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Informe um e-mail válido.';
    if (telefone.trim().length < 8) errs.telefone = 'Informe um telefone ou WhatsApp válido com DDD.';
    if (cidadeUf.trim().length < 2) errs.cidadeUf = 'Informe sua cidade e estado.';
    if (experienciaResumo.trim().length < 10) {
      errs.experienciaResumo = 'Resuma sua experiência profissional, máquinas operadas ou cursos.';
    }
    if (linkedinUrl.trim() && !/^https?:\/\/.+/i.test(linkedinUrl.trim())) {
      errs.linkedinUrl = 'Informe um link completo começando com https://';
    }
    if (!resumeFile) {
      errs.curriculo = 'Anexe seu currículo em PDF, DOC ou DOCX (até 10 MB).';
    }
    if (!consentimentoLgpd) {
      errs.consentimentoLgpd = 'É necessário concordar com a Política de Privacidade (LGPD).';
    }
    return errs;
  };

  const uploadResumeFile = async (file: File) => {
    if (uploadMode === 'unconfigured') {
      throw new Error(
        'O armazenamento de currículos ainda não foi configurado no servidor. Entre em contato pelo e-mail curriculos@ccglocacao.com.br.'
      );
    }

    if (uploadMode === 'local') {
      setUploadProgress(25);
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/curriculos/upload-local', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        url?: string;
        pathname?: string;
        contentType?: string;
        size?: number;
      };
      if (!res.ok || !data.ok || !data.url || !data.pathname) {
        throw new Error(data.message || 'Falha ao enviar o currículo.');
      }
      setUploadProgress(100);
      return {
        url: data.url,
        pathname: data.pathname,
        contentType: data.contentType || file.type || 'application/pdf',
        size: data.size || file.size,
        storage: 'local' as const,
      };
    }

    // Upload direto do navegador para Vercel Blob (suporta até 10 MB sem bater no limite de 4.5 MB de Functions)
    const pathname = `curriculos/${Date.now()}-${sanitizeSlugName(file.name)}`;
    const blob = await upload(pathname, file, {
      access: blobAccess,
      handleUploadUrl: '/api/curriculos/upload',
      onUploadProgress: (evt) => {
        if (evt.percentage !== undefined) {
          setUploadProgress(Math.round(evt.percentage));
        }
      },
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType || file.type || 'application/pdf',
      size: file.size,
      storage: 'vercel_blob' as const,
    };
  };

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFieldErrors({});
    setFeedback('');
    setProtocolo('');

    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setStatus('error');
      setFeedback('Revise os campos destacados antes de enviar sua candidatura.');
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setStatus('error');
      setFeedback('Conclua a verificação anti-spam antes de enviar.');
      return;
    }

    if (!resumeFile) return;

    try {
      setStatus('uploading');
      setUploadProgress(5);
      const uploaded = await uploadResumeFile(resumeFile);

      setStatus('submitting');
      const res = await fetch('/api/candidaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vagaId: selectedVaga ? selectedVaga.id : null,
          vagaTitulo: selectedVaga ? selectedVaga.titulo : 'Banco de Talentos',
          nome: nome.trim(),
          email: email.trim(),
          telefone: telefone.trim(),
          cidadeUf: cidadeUf.trim(),
          cpf: cpf.trim() || null,
          cnh: cnh.trim() || null,
          experienciaResumo: experienciaResumo.trim(),
          pretensaoSalarial: pretensaoSalarial.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          mensagem: mensagem.trim() || null,
          curriculoUrl: uploaded.url,
          curriculoPathname: uploaded.pathname,
          curriculoNome: resumeFile.name,
          curriculoTipo: uploaded.contentType,
          curriculoTamanho: uploaded.size,
          curriculoStorage: uploaded.storage,
          consentimentoLgpd,
          website,
          turnstileToken: turnstileToken || undefined,
        }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        protocolo?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok || !json.ok) {
        setStatus('error');
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        setFeedback(json.message || 'Não foi possível concluir sua candidatura.');
        resetTurnstile();
        return;
      }

      setStatus('success');
      setProtocolo(json.protocolo || '');
      setFeedback(
        json.message ||
          'Candidatura registrada com sucesso! Nossa equipe de RH analisará seu perfil.'
      );
      setNome('');
      setEmail('');
      setTelefone('');
      setCidadeUf('');
      setCpf('');
      setCnh('');
      setExperienciaResumo('');
      setPretensaoSalarial('');
      setLinkedinUrl('');
      setMensagem('');
      setConsentimentoLgpd(false);
      setResumeFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      resetTurnstile();
    } catch (err) {
      setStatus('error');
      setUploadProgress(0);
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Erro de conexão ao enviar sua candidatura. Tente novamente.'
      );
      resetTurnstile();
    }
  };

  return (
    <div className="space-y-12">
      {/* Seção 1: Vagas Abertas */}
      <section aria-labelledby="vagas-abertas-heading" className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-ccg-green-800">
              Oportunidades abertas
            </p>
            <h2
              id="vagas-abertas-heading"
              className="mt-1 font-display text-2xl font-extrabold text-ink-primary sm:text-3xl"
            >
              Vagas disponíveis na CCG
            </h2>
          </div>
          <button
            type="button"
            onClick={() => handleSelectVagaToApply('')}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-ccg-green-800 bg-ccg-green-50 px-4 py-2 text-sm font-bold text-ccg-green-900 transition-colors hover:bg-ccg-green-100"
          >
            Cadastrar no Banco de Talentos
          </button>
        </div>

        {sharedVagaNotFound && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm text-amber-950"
          >
            <p>
              A vaga acessada por este link não está mais aberta no momento. Confira abaixo outras
              oportunidades disponíveis ou cadastre seu currículo no Banco de Talentos.
            </p>
            <button
              type="button"
              onClick={() => setSharedVagaNotFound(false)}
              className="cursor-pointer text-xs font-bold text-amber-900 underline-offset-4 hover:underline"
            >
              Fechar aviso
            </button>
          </div>
        )}

        {vagas.length > 0 && (
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border-subtle bg-white p-4 shadow-xs sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label htmlFor="vaga-busca" className="sr-only">
                Buscar vaga
              </label>
              <input
                id="vaga-busca"
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por cargo, máquina, cidade ou palavra-chave..."
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="vaga-area" className="sr-only">
                Filtrar por área
              </label>
              <select
                id="vaga-area"
                value={filtroArea}
                onChange={(e) => setFiltroArea(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              >
                <option value="">Todas as áreas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="vaga-modalidade" className="sr-only">
                Filtrar por modalidade
              </label>
              <select
                id="vaga-modalidade"
                value={filtroModalidade}
                onChange={(e) => setFiltroModalidade(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              >
                <option value="">Todas as modalidades</option>
                {modalidades.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {vagas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ccg-green-800/30 bg-ccg-green-50/70 p-8 text-center">
            <h3 className="font-display text-xl font-bold text-ink-primary">
              No momento não há vagas específicas publicadas
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary">
              Nosso Banco de Talentos permanece aberto o ano inteiro. Cadastre seus dados e envie seu
              currículo abaixo para ser considerado nas próximas mobilizações de obra e frota.
            </p>
            <button
              type="button"
              onClick={() => handleSelectVagaToApply('')}
              className="mt-5 inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-xl bg-ccg-green-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-ccg-green-900"
            >
              Enviar currículo para o Banco de Talentos
            </button>
          </div>
        ) : vagasFiltradas.length === 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-white p-8 text-center">
            <p className="text-base font-semibold text-ink-primary">
              Nenhuma vaga encontrada com os filtros selecionados.
            </p>
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setFiltroArea('');
                setFiltroModalidade('');
              }}
              className="mt-3 cursor-pointer text-sm font-bold text-ccg-green-800 hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {vagasFiltradas.map((vaga) => {
              const isSelected = selectedVagaId === vaga.id;
              return (
                <article
                  key={vaga.id}
                  className={`relative flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-xs transition-all has-[[aria-expanded=true]]:z-30 ${
                    isSelected
                      ? 'border-ccg-green-700 ring-2 ring-ccg-green-700/20'
                      : 'border-border-subtle hover:border-ccg-green-700/50 hover:shadow-sm'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {vaga.destaque && (
                          <span className="rounded-full bg-ccg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-ink-primary">
                            Destaque
                          </span>
                        )}
                        <span className="rounded-full bg-ccg-green-50 px-2.5 py-0.5 text-xs font-semibold text-ccg-green-900">
                          {vaga.area}
                        </span>
                        <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink-secondary">
                          {vaga.tipoContrato}
                        </span>
                      </div>
                      <ShareBadge
                        {...buildVagaShareData(vaga)}
                        variant="inline"
                        ariaLabel={`Compartilhar vaga ${vaga.titulo}`}
                        className="shrink-0"
                      />
                    </div>

                    <h3 className="font-display text-xl font-extrabold text-ink-primary">
                      {vaga.titulo}
                    </h3>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-muted">
                      <span>📍 {vaga.localidade}</span>
                      <span>🏢 {vaga.modalidade}</span>
                      <span>
                        👥 {vaga.quantidade} {vaga.quantidade === 1 ? 'vaga' : 'vagas'}
                      </span>
                    </div>

                    {vaga.faixaSalarial && (
                      <p className="text-xs font-bold text-ccg-green-800">
                        Remuneração: {vaga.faixaSalarial}
                      </p>
                    )}

                    <p className="line-clamp-3 text-sm leading-relaxed text-ink-secondary">
                      {vaga.resumo}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                    <button
                      type="button"
                      onClick={() => setVagaDetalhes(vaga)}
                      className="min-h-[42px] flex-1 cursor-pointer rounded-xl border border-border-subtle bg-surface-canvas px-3.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-surface-muted"
                    >
                      Ver detalhes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectVagaToApply(vaga.id)}
                      className="min-h-[42px] flex-1 cursor-pointer rounded-xl bg-ccg-green-800 px-3.5 text-sm font-bold text-white transition-colors hover:bg-ccg-green-900"
                    >
                      Candidatar-se
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal de detalhes da vaga */}
      {vagaDetalhes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-vaga-titulo"
          onClick={() => setVagaDetalhes(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-ccg-green-50 px-2.5 py-0.5 text-xs font-bold text-ccg-green-900">
                    {vagaDetalhes.area}
                  </span>
                  <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-ink-secondary">
                    {vagaDetalhes.tipoContrato} • {vagaDetalhes.modalidade}
                  </span>
                </div>
                <h3
                  id="modal-vaga-titulo"
                  className="mt-2 font-display text-2xl font-extrabold text-ink-primary"
                >
                  {vagaDetalhes.titulo}
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  📍 {vagaDetalhes.localidade} • {vagaDetalhes.quantidade}{' '}
                  {vagaDetalhes.quantidade === 1 ? 'vaga' : 'vagas'}
                  {vagaDetalhes.faixaSalarial ? ` • ${vagaDetalhes.faixaSalarial}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ShareBadge
                  {...buildVagaShareData(vagaDetalhes)}
                  variant="inline"
                  ariaLabel={`Compartilhar vaga ${vagaDetalhes.titulo}`}
                />
                <button
                  type="button"
                  onClick={() => setVagaDetalhes(null)}
                  aria-label="Fechar detalhes da vaga"
                  className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-subtle text-ink-secondary hover:bg-surface-muted"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-5 text-sm leading-relaxed text-ink-secondary">
              <div>
                <h4 className="font-display text-base font-bold text-ink-primary">
                  Descrição e principais atividades
                </h4>
                <p className="mt-1.5 whitespace-pre-line">{vagaDetalhes.descricao}</p>
              </div>

              <div>
                <h4 className="font-display text-base font-bold text-ink-primary">Requisitos</h4>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  {splitLines(vagaDetalhes.requisitos).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {vagaDetalhes.diferenciais && (
                <div>
                  <h4 className="font-display text-base font-bold text-ink-primary">
                    Diferenciais
                  </h4>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {splitLines(vagaDetalhes.diferenciais).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {vagaDetalhes.beneficios && (
                <div>
                  <h4 className="font-display text-base font-bold text-ink-primary">Benefícios</h4>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {splitLines(vagaDetalhes.beneficios).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setVagaDetalhes(null)}
                className="min-h-[44px] cursor-pointer rounded-xl border border-border-subtle px-5 text-sm font-semibold text-ink-primary hover:bg-surface-muted"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => handleSelectVagaToApply(vagaDetalhes.id)}
                className="min-h-[44px] cursor-pointer rounded-xl bg-ccg-green-800 px-6 text-sm font-bold text-white hover:bg-ccg-green-900"
              >
                Candidatar-se a esta vaga
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seção 2: Formulário de Cadastro e Envio de Currículo */}
      <div ref={formRef} id="formulario-candidatura" className="scroll-mt-24">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-6 rounded-2xl border border-border-subtle bg-white p-6 shadow-sm sm:p-8"
          aria-label="Formulário de cadastro e candidatura"
        >
          <div className="border-b border-border-subtle pb-5">
            <p className="text-xs font-bold uppercase tracking-wider text-ccg-green-800">
              Cadastro de Candidato
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-ink-primary sm:text-3xl">
              {selectedVaga
                ? `Candidatura: ${selectedVaga.titulo}`
                : 'Envie seu currículo para o Banco de Talentos'}
            </h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              Preencha seus dados abaixo e anexe seu currículo em{' '}
              <strong>PDF, DOC ou DOCX (até 10 MB)</strong>.
            </p>
          </div>

          {/* Seleção da vaga */}
          <div>
            <label htmlFor="cand-vaga" className="mb-1.5 block text-sm font-semibold text-ink-primary">
              Vaga de interesse *
            </label>
            <select
              id="cand-vaga"
              value={selectedVagaId}
              onChange={(e) => setSelectedVagaId(e.target.value)}
              className="min-h-[46px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base font-medium text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
            >
              <option value="">Banco de Talentos (envio espontâneo)</option>
              {vagas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titulo} — {v.localidade} ({v.tipoContrato})
                </option>
              ))}
            </select>
          </div>

          {/* Honeypot */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="cand-website-hp">Não preencher</label>
            <input
              id="cand-website-hp"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {/* Dados pessoais */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cand-nome" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                Nome completo *
              </label>
              <input
                id="cand-nome"
                type="text"
                required
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Carlos Eduardo Silva"
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
              <label htmlFor="cand-email" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                E-mail *
              </label>
              <input
                id="cand-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
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
              <label htmlFor="cand-telefone" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                Telefone / WhatsApp *
              </label>
              <input
                id="cand-telefone"
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

            <div>
              <label htmlFor="cand-cidade" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                Cidade / Estado *
              </label>
              <input
                id="cand-cidade"
                type="text"
                required
                value={cidadeUf}
                onChange={(e) => setCidadeUf(e.target.value)}
                placeholder="Ex.: São Luís - MA"
                aria-invalid={Boolean(fieldErrors.cidadeUf)}
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              />
              {fieldErrors.cidadeUf && (
                <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                  {fieldErrors.cidadeUf}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="cand-cpf" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                CPF <span className="font-normal text-ink-muted">(opcional)</span>
              </label>
              <input
                id="cand-cpf"
                type="text"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="cand-cnh" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                Categoria CNH <span className="font-normal text-ink-muted">(se aplicável)</span>
              </label>
              <input
                id="cand-cnh"
                type="text"
                value={cnh}
                onChange={(e) => setCnh(e.target.value)}
                placeholder="Ex.: Categoria D / E (com EAR)"
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="cand-pretensao" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                Pretensão salarial <span className="font-normal text-ink-muted">(opcional)</span>
              </label>
              <input
                id="cand-pretensao"
                type="text"
                value={pretensaoSalarial}
                onChange={(e) => setPretensaoSalarial(e.target.value)}
                placeholder="Ex.: R$ 3.500,00 ou A combinar"
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="cand-linkedin" className="mb-1.5 block text-sm font-semibold text-ink-primary">
                LinkedIn ou Portfólio <span className="font-normal text-ink-muted">(opcional)</span>
              </label>
              <input
                id="cand-linkedin"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/seu-perfil"
                aria-invalid={Boolean(fieldErrors.linkedinUrl)}
                className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              />
              {fieldErrors.linkedinUrl && (
                <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                  {fieldErrors.linkedinUrl}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="cand-exp" className="mb-1.5 block text-sm font-semibold text-ink-primary">
              Resumo profissional, máquinas/habilidades e certificações (NRs) *
            </label>
            <textarea
              id="cand-exp"
              rows={4}
              required
              value={experienciaResumo}
              onChange={(e) => setExperienciaResumo(e.target.value)}
              placeholder="Conte sua experiência, tempo de atuação, equipamentos que opera ou especialidades técnicas (ex.: Escavadeira Hidráulica, Motoniveladora, NR-11, NR-12, MOPP, etc.)."
              aria-invalid={Boolean(fieldErrors.experienciaResumo)}
              className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
            />
            {fieldErrors.experienciaResumo && (
              <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                {fieldErrors.experienciaResumo}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="cand-msg" className="mb-1.5 block text-sm font-semibold text-ink-primary">
              Observações adicionais <span className="font-normal text-ink-muted">(opcional)</span>
            </label>
            <textarea
              id="cand-msg"
              rows={2}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Disponibilidade para início, disponibilidade para viagens/alojamento em obra, etc."
              className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3.5 text-base text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Upload de Currículo até 10 MB */}
          <div>
            <label htmlFor="cand-curriculo" className="mb-1.5 block text-sm font-semibold text-ink-primary">
              Currículo (PDF, DOC ou DOCX — máximo 10 MB) *
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                isDragging
                  ? 'border-ccg-green-700 bg-ccg-green-50'
                  : fieldErrors.curriculo
                    ? 'border-red-400 bg-red-50/40'
                    : 'border-border-subtle bg-surface-canvas hover:border-ccg-green-700/60'
              }`}
            >
              <input
                ref={fileInputRef}
                id="cand-curriculo"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => handleFileValidation(e.target.files?.[0] || null)}
                className="sr-only"
              />

              {resumeFile ? (
                <div className="flex flex-col items-center justify-between gap-3 sm:flex-row sm:text-left">
                  <div>
                    <p className="text-sm font-bold text-ccg-green-900">
                      📄 {resumeFile.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Tamanho: {formatBytes(resumeFile.size)} (limite: 10 MB)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[38px] cursor-pointer rounded-lg border border-border-subtle bg-white px-3 text-xs font-semibold text-ink-primary hover:bg-surface-muted"
                    >
                      Trocar arquivo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResumeFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="min-h-[38px] cursor-pointer rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink-primary">
                    Arraste seu currículo aqui ou clique para selecionar
                  </p>
                  <p className="text-xs text-ink-muted">
                    Formatos aceitos: PDF, DOC ou DOCX • Tamanho máximo: 10 MB
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-xl border border-ccg-green-800 bg-white px-4 py-2 text-sm font-bold text-ccg-green-900 hover:bg-ccg-green-50"
                  >
                    Selecionar currículo
                  </button>
                </div>
              )}

              {status === 'uploading' && (
                <div className="mt-4 space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ccg-green-100">
                    <div
                      className="h-full bg-ccg-green-700 transition-all duration-200"
                      style={{ width: `${Math.max(uploadProgress, 8)}%` }}
                    />
                  </div>
                  <p className="text-xs font-semibold text-ccg-green-900">
                    Enviando currículo... {uploadProgress}%
                  </p>
                </div>
              )}
            </div>
            {fieldErrors.curriculo && (
              <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                {fieldErrors.curriculo}
              </p>
            )}
          </div>

          {/* LGPD */}
          <div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={consentimentoLgpd}
                onChange={(e) => setConsentimentoLgpd(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-border-subtle text-ccg-green-800 focus:ring-ccg-yellow-500"
              />
              <span>
                Autorizo a CCG Construções e Terraplenagem a tratar meus dados pessoais e currículo
                exclusivamente para fins de recrutamento e seleção, conforme a{' '}
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

          {turnstileSiteKey && <div ref={turnstileContainerRef} className="min-h-[65px]" />}

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
              {protocolo && (
                <p className="mt-1 text-xs font-bold">
                  Protocolo da candidatura: #{protocolo}
                </p>
              )}
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={status === 'uploading' || status === 'submitting'}
              className="min-h-[50px] w-full cursor-pointer rounded-xl bg-ccg-green-800 px-6 py-3 text-base font-bold text-white shadow-xs transition-colors hover:bg-ccg-green-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[280px]"
            >
              {status === 'uploading'
                ? `Enviando currículo (${uploadProgress}%)...`
                : status === 'submitting'
                  ? 'Finalizando candidatura...'
                  : 'Enviar candidatura e currículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
