import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { ShareBadge } from '@/components/ShareBadge';
import {
  CANDIDATURA_STATUS_LABELS,
  CANDIDATURA_STATUS_OPTIONS,
  VAGA_AREAS_SUGERIDAS,
  VAGA_CONTRATO_OPTIONS,
  VAGA_MODALIDADE_OPTIONS,
  VAGA_STATUS_LABELS,
  VAGA_STATUS_OPTIONS,
  formatBytes,
  type Candidatura,
  type CandidaturaStatus,
  type Vaga,
  type VagaContrato,
  type VagaModalidade,
  type VagaStatus,
} from '@/lib/careersSchema';
import { buildVagaShareData } from '@/lib/share';

interface EnvStatus {
  postgresConfigured: boolean;
  blobConfigured: boolean;
  localFallback: boolean;
}

interface VagaFormState {
  id?: string;
  titulo: string;
  area: string;
  localidade: string;
  modalidade: VagaModalidade;
  tipoContrato: VagaContrato;
  faixaSalarial: string;
  quantidade: number;
  resumo: string;
  descricao: string;
  requisitos: string;
  diferenciais: string;
  beneficios: string;
  status: VagaStatus;
  destaque: boolean;
}

const EMPTY_VAGA_FORM: VagaFormState = {
  titulo: '',
  area: 'Operação de Máquinas Pesadas',
  localidade: 'São Luís - MA',
  modalidade: 'Presencial',
  tipoContrato: 'CLT',
  faixaSalarial: '',
  quantidade: 1,
  resumo: '',
  descricao: '',
  requisitos: '',
  diferenciais: '',
  beneficios: '',
  status: 'aberta',
  destaque: false,
};

function formatDateBr(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildCandidateWhatsApp(phone: string, nome: string, vaga: string): string {
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('55') ? digits : `55${digits}`;
  const msg = encodeURIComponent(
    `Olá ${nome}, somos do RH da CCG Construções e Locações! Recebemos sua candidatura para ${vaga} e gostaríamos de conversar.`
  );
  return `https://wa.me/${e164}?text=${msg}`;
}

export function AdminVagasManager() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [isDevFallbackPassword, setIsDevFallbackPassword] = useState(false);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);

  // Login form
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Tabs e dados
  const [activeTab, setActiveTab] = useState<'vagas' | 'candidaturas'>('vagas');
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [toast, setToast] = useState('');

  // Modal/form de vaga
  const [showVagaForm, setShowVagaForm] = useState(false);
  const [vagaForm, setVagaForm] = useState<VagaFormState>(EMPTY_VAGA_FORM);
  const [vagaFormErrors, setVagaFormErrors] = useState<Record<string, string>>({});
  const [savingVaga, setSavingVaga] = useState(false);

  // Filtros e detalhe de candidaturas
  const [filterVagaId, setFilterVagaId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchCand, setSearchCand] = useState('');
  const [selectedCand, setSelectedCand] = useState<Candidatura | null>(null);
  const [editCandStatus, setEditCandStatus] = useState<CandidaturaStatus>('nova');
  const [editCandNotas, setEditCandNotas] = useState('');
  const [savingCand, setSavingCand] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setGlobalError('');
    try {
      const [vagasRes, candsRes] = await Promise.all([
        fetch('/api/admin/vagas'),
        fetch('/api/admin/candidaturas'),
      ]);

      if (vagasRes.status === 401 || candsRes.status === 401) {
        setAuthenticated(false);
        return;
      }

      const vagasJson = (await vagasRes.json()) as { ok?: boolean; vagas?: Vaga[]; message?: string };
      const candsJson = (await candsRes.json()) as {
        ok?: boolean;
        candidaturas?: Candidatura[];
        message?: string;
      };

      if (!vagasRes.ok || !vagasJson.ok) {
        setGlobalError(vagasJson.message || 'Erro ao carregar vagas.');
      } else {
        setVagas(vagasJson.vagas || []);
      }

      if (!candsRes.ok || !candsJson.ok) {
        setGlobalError(candsJson.message || 'Erro ao carregar candidaturas.');
      } else {
        setCandidaturas(candsJson.candidaturas || []);
      }
    } catch {
      setGlobalError('Falha de rede ao consultar o servidor.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin/me');
        const json = (await res.json()) as {
          authenticated?: boolean;
          user?: string | null;
          isDevFallbackPassword?: boolean;
          environment?: EnvStatus;
        };
        setAuthenticated(Boolean(json.authenticated));
        setAdminUser(json.user || '');
        setIsDevFallbackPassword(Boolean(json.isDevFallbackPassword));
        if (json.environment) setEnvStatus(json.environment);
      } catch {
        setAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };
    void checkSession();
  }, []);

  useEffect(() => {
    if (authenticated) {
      void loadData();
    }
  }, [authenticated, loadData]);

  const handleLogin = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError('');
    setLoginSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: loginUser, password: loginPassword }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; user?: string };
      if (!res.ok || !json.ok) {
        setLoginError(json.message || 'Usuário ou senha inválidos.');
        return;
      }
      setAuthenticated(true);
      setAdminUser(json.user || loginUser);
      setLoginPassword('');
    } catch {
      setLoginError('Erro de conexão ao realizar login.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthenticated(false);
    setAdminUser('');
    setVagas([]);
    setCandidaturas([]);
    setSelectedCand(null);
  };

  const openNewVaga = () => {
    setVagaForm(EMPTY_VAGA_FORM);
    setVagaFormErrors({});
    setShowVagaForm(true);
  };

  const openEditVaga = (vaga: Vaga) => {
    setVagaForm({
      id: vaga.id,
      titulo: vaga.titulo,
      area: vaga.area,
      localidade: vaga.localidade,
      modalidade: vaga.modalidade,
      tipoContrato: vaga.tipoContrato,
      faixaSalarial: vaga.faixaSalarial || '',
      quantidade: vaga.quantidade,
      resumo: vaga.resumo,
      descricao: vaga.descricao,
      requisitos: vaga.requisitos,
      diferenciais: vaga.diferenciais || '',
      beneficios: vaga.beneficios || '',
      status: vaga.status,
      destaque: vaga.destaque,
    });
    setVagaFormErrors({});
    setShowVagaForm(true);
  };

  const handleSaveVaga = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingVaga(true);
    setVagaFormErrors({});
    try {
      const isEdit = Boolean(vagaForm.id);
      const endpoint = isEdit ? `/api/admin/vagas/${vagaForm.id}` : '/api/admin/vagas';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: vagaForm.titulo,
          area: vagaForm.area,
          localidade: vagaForm.localidade,
          modalidade: vagaForm.modalidade,
          tipoContrato: vagaForm.tipoContrato,
          faixaSalarial: vagaForm.faixaSalarial || null,
          quantidade: Number(vagaForm.quantidade) || 1,
          resumo: vagaForm.resumo,
          descricao: vagaForm.descricao,
          requisitos: vagaForm.requisitos,
          diferenciais: vagaForm.diferenciais || null,
          beneficios: vagaForm.beneficios || null,
          status: vagaForm.status,
          destaque: vagaForm.destaque,
        }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!res.ok || !json.ok) {
        if (json.fieldErrors) setVagaFormErrors(json.fieldErrors);
        setGlobalError(json.message || 'Não foi possível salvar a vaga.');
        return;
      }

      setShowVagaForm(false);
      showToast(isEdit ? 'Vaga atualizada com sucesso!' : 'Nova vaga cadastrada com sucesso!');
      await loadData();
    } catch {
      setGlobalError('Erro de conexão ao salvar a vaga.');
    } finally {
      setSavingVaga(false);
    }
  };

  const handleQuickStatusVaga = async (vaga: Vaga, status: VagaStatus) => {
    const res = await fetch(`/api/admin/vagas/${vaga.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setVagas((prev) => prev.map((v) => (v.id === vaga.id ? { ...v, status } : v)));
      showToast(`Status da vaga atualizado para "${VAGA_STATUS_LABELS[status]}".`);
    }
  };

  const handleDeleteVaga = async (vaga: Vaga) => {
    const ok = window.confirm(
      `Deseja realmente excluir a vaga "${vaga.titulo}"? As candidaturas já recebidas serão mantidas no histórico.`
    );
    if (!ok) return;
    const res = await fetch(`/api/admin/vagas/${vaga.id}`, { method: 'DELETE' });
    if (res.ok) {
      setVagas((prev) => prev.filter((v) => v.id !== vaga.id));
      showToast('Vaga excluída com sucesso.');
    }
  };

  const openCandidate = (cand: Candidatura) => {
    setSelectedCand(cand);
    setEditCandStatus(cand.status);
    setEditCandNotas(cand.notasRh || '');
  };

  const handleSaveCandidatura = async () => {
    if (!selectedCand) return;
    setSavingCand(true);
    try {
      const res = await fetch(`/api/admin/candidaturas/${selectedCand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editCandStatus,
          notasRh: editCandNotas.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; candidatura?: Candidatura };
      if (res.ok && json.ok && json.candidatura) {
        setCandidaturas((prev) =>
          prev.map((c) => (c.id === selectedCand.id ? json.candidatura! : c))
        );
        setSelectedCand(json.candidatura);
        showToast('Candidatura atualizada.');
      }
    } finally {
      setSavingCand(false);
    }
  };

  const handleDeleteCandidatura = async (cand: Candidatura) => {
    const ok = window.confirm(
      `Excluir a candidatura de "${cand.nome}" e remover permanentemente o arquivo de currículo?`
    );
    if (!ok) return;
    const res = await fetch(`/api/admin/candidaturas/${cand.id}`, { method: 'DELETE' });
    if (res.ok) {
      setCandidaturas((prev) => prev.filter((c) => c.id !== cand.id));
      if (selectedCand?.id === cand.id) setSelectedCand(null);
      showToast('Candidatura e currículo removidos.');
      await loadData();
    }
  };

  const filteredCandidaturas = useMemo(() => {
    const q = searchCand.trim().toLowerCase();
    return candidaturas.filter((c) => {
      if (filterVagaId === '__banco__' && c.vagaId) return false;
      if (filterVagaId && filterVagaId !== '__banco__' && c.vagaId !== filterVagaId) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.cidadeUf.toLowerCase().includes(q) ||
        c.vagaTitulo.toLowerCase().includes(q) ||
        c.experienciaResumo.toLowerCase().includes(q)
      );
    });
  }, [candidaturas, filterVagaId, filterStatus, searchCand]);

  const metrics = useMemo(() => {
    const vagasAbertas = vagas.filter((v) => v.status === 'aberta').length;
    const novasCands = candidaturas.filter((c) => c.status === 'nova').length;
    return {
      vagasAbertas,
      totalVagas: vagas.length,
      novasCands,
      totalCands: candidaturas.length,
    };
  }, [vagas, candidaturas]);

  if (authLoading) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-white p-10 text-center text-sm text-ink-secondary">
        Verificando sessão administrativa...
      </div>
    );
  }

  if (!authenticated) {
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

        {isDevFallbackPassword && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3.5 text-xs text-amber-900 ring-1 ring-amber-400/40">
            <strong>Modo desenvolvimento local:</strong> `ADMIN_PASSWORD` não foi definido no `.env`.
            Use usuário <code>admin</code> e senha <code>ccg-admin-dev</code> para testes locais.
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-5 space-y-4">
          <div>
            <label htmlFor="admin-user" className="mb-1.5 block text-sm font-semibold text-ink-primary">
              Usuário
            </label>
            <input
              id="admin-user"
              type="text"
              required
              autoComplete="username"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
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
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-base text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
            />
          </div>

          {loginError && (
            <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800" role="alert">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={loginSubmitting}
            className="min-h-[46px] w-full cursor-pointer rounded-xl bg-ccg-green-800 px-5 text-base font-bold text-white transition-colors hover:bg-ccg-green-900 disabled:opacity-60"
          >
            {loginSubmitting ? 'Entrando...' : 'Acessar Gestor de Vagas'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra superior do painel */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border-subtle bg-white p-5 shadow-xs sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-ccg-green-800">
            Painel Administrativo • Logado como {adminUser}
          </p>
          <h2 className="font-display text-2xl font-extrabold text-ink-primary">
            Gestor de Vagas &amp; Captação de Currículos
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/trabalhe-conosco"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[42px] items-center rounded-xl border border-border-subtle bg-surface-canvas px-4 text-sm font-semibold text-ink-primary hover:bg-surface-muted"
          >
            Ver página pública ↗
          </a>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex min-h-[42px] cursor-pointer items-center rounded-xl border border-border-subtle bg-white px-4 text-sm font-semibold text-ink-primary hover:bg-surface-muted"
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-[42px] cursor-pointer items-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-800 hover:bg-red-100"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Avisos de ambiente */}
      {envStatus?.localFallback && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
          <strong>Modo local de desenvolvimento ativo:</strong> `DATABASE_URL` e/ou
          `BLOB_READ_WRITE_TOKEN` não estão definidos. Os dados e currículos estão sendo salvos na
          pasta local <code>.local-data/</code>. Ao publicar na Vercel, conecte o{' '}
          <strong>Neon Postgres</strong> e o <strong>Vercel Blob</strong> nas variáveis de ambiente
          do projeto.
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="rounded-xl bg-ccg-green-50 px-4 py-3 text-sm font-semibold text-ccg-green-900 ring-1 ring-ccg-green-700/30"
        >
          {toast}
        </div>
      )}

      {globalError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800 ring-1 ring-red-600/30"
        >
          {globalError}
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-border-subtle bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Vagas abertas</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-ccg-green-800">
            {metrics.vagasAbertas}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total de vagas</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-ink-primary">
            {metrics.totalVagas}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Novas candidaturas
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold text-ccg-yellow-600">
            {metrics.novasCands}
          </p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Total de currículos
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold text-ink-primary">
            {metrics.totalCands}
          </p>
        </div>
      </div>

      {/* Navegação por abas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('vagas')}
            className={`min-h-[44px] cursor-pointer rounded-xl px-5 text-sm font-bold transition-colors ${
              activeTab === 'vagas'
                ? 'bg-ccg-green-800 text-white'
                : 'bg-white text-ink-secondary ring-1 ring-border-subtle hover:bg-surface-muted'
            }`}
          >
            Vagas ({vagas.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('candidaturas')}
            className={`min-h-[44px] cursor-pointer rounded-xl px-5 text-sm font-bold transition-colors ${
              activeTab === 'candidaturas'
                ? 'bg-ccg-green-800 text-white'
                : 'bg-white text-ink-secondary ring-1 ring-border-subtle hover:bg-surface-muted'
            }`}
          >
            Currículos e Candidatos ({candidaturas.length})
          </button>
        </div>

        {activeTab === 'vagas' && (
          <button
            type="button"
            onClick={openNewVaga}
            className="min-h-[44px] cursor-pointer rounded-xl bg-ccg-yellow-400 px-5 text-sm font-extrabold text-ink-primary shadow-xs hover:bg-ccg-yellow-500"
          >
            + Cadastrar nova vaga
          </button>
        )}
      </div>

      {/* ABA VAGAS */}
      {activeTab === 'vagas' && (
        <div className="space-y-4">
          {loadingData && vagas.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-white p-8 text-center text-sm text-ink-secondary">
              Carregando vagas...
            </div>
          ) : vagas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-subtle bg-white p-10 text-center">
              <p className="font-display text-lg font-bold text-ink-primary">
                Nenhuma vaga cadastrada ainda
              </p>
              <p className="mt-1 text-sm text-ink-secondary">
                Clique em &quot;Cadastrar nova vaga&quot; para publicar a primeira oportunidade na página
                Trabalhe Conosco.
              </p>
              <button
                type="button"
                onClick={openNewVaga}
                className="mt-4 min-h-[44px] cursor-pointer rounded-xl bg-ccg-green-800 px-6 text-sm font-bold text-white hover:bg-ccg-green-900"
              >
                + Cadastrar primeira vaga
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {vagas.map((vaga) => (
                <div
                  key={vaga.id}
                  className="relative flex flex-col justify-between gap-4 rounded-2xl border border-border-subtle bg-white p-5 shadow-xs has-[[aria-expanded=true]]:z-30 lg:flex-row lg:items-center"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          vaga.status === 'aberta'
                            ? 'bg-ccg-green-100 text-ccg-green-900'
                            : vaga.status === 'pausada'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-surface-muted text-ink-muted'
                        }`}
                      >
                        {VAGA_STATUS_LABELS[vaga.status]}
                      </span>
                      {vaga.destaque && (
                        <span className="rounded-full bg-ccg-yellow-400 px-2.5 py-0.5 text-xs font-extrabold text-ink-primary">
                          Destaque
                        </span>
                      )}
                      <span className="text-xs font-semibold text-ink-muted">{vaga.area}</span>
                    </div>
                    <h3 className="font-display text-xl font-extrabold text-ink-primary">
                      {vaga.titulo}
                    </h3>
                    <p className="text-xs text-ink-secondary">
                      📍 {vaga.localidade} • {vaga.modalidade} • {vaga.tipoContrato} •{' '}
                      {vaga.quantidade} {vaga.quantidade === 1 ? 'vaga' : 'vagas'}
                      {vaga.faixaSalarial ? ` • ${vaga.faixaSalarial}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ShareBadge
                      {...buildVagaShareData(vaga)}
                      variant="admin"
                      disabled={vaga.status !== 'aberta'}
                      disabledTitle="Altere o status da vaga para Aberta para compartilhar o link público"
                      ariaLabel={`Compartilhar vaga ${vaga.titulo}`}
                      onCopied={() =>
                        showToast(`Link da vaga "${vaga.titulo}" copiado para a área de transferência!`)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFilterVagaId(vaga.id);
                        setActiveTab('candidaturas');
                      }}
                      className="min-h-[40px] cursor-pointer rounded-lg bg-ccg-green-50 px-3.5 text-xs font-bold text-ccg-green-900 ring-1 ring-ccg-green-700/20 hover:bg-ccg-green-100"
                    >
                      👥 {vaga.totalCandidaturas ?? 0}{' '}
                      {(vaga.totalCandidaturas ?? 0) === 1 ? 'candidato' : 'candidatos'}
                    </button>

                    <select
                      aria-label={`Alterar status da vaga ${vaga.titulo}`}
                      value={vaga.status}
                      onChange={(e) =>
                        void handleQuickStatusVaga(vaga, e.target.value as VagaStatus)
                      }
                      className="min-h-[40px] rounded-lg border border-border-subtle bg-surface-canvas px-2.5 text-xs font-semibold text-ink-primary"
                    >
                      {VAGA_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {VAGA_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => openEditVaga(vaga)}
                      className="min-h-[40px] cursor-pointer rounded-lg border border-border-subtle px-3.5 text-xs font-semibold text-ink-primary hover:bg-surface-muted"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteVaga(vaga)}
                      className="min-h-[40px] cursor-pointer rounded-lg border border-red-200 px-3.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA CANDIDATURAS */}
      {activeTab === 'candidaturas' && (
        <div className="space-y-5">
          {/* Filtros */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border-subtle bg-white p-4 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <input
                type="search"
                value={searchCand}
                onChange={(e) => setSearchCand(e.target.value)}
                placeholder="Buscar candidato por nome, e-mail, cidade ou experiência..."
                className="min-h-[42px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-sm text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="sm:col-span-4">
              <select
                value={filterVagaId}
                onChange={(e) => setFilterVagaId(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary"
              >
                <option value="">Todas as vagas</option>
                <option value="__banco__">Banco de Talentos</option>
                {vagas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.titulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary"
              >
                <option value="">Todos os status</option>
                {CANDIDATURA_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {CANDIDATURA_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Lista de candidatos */}
            <div className="space-y-3 lg:col-span-5">
              {filteredCandidaturas.length === 0 ? (
                <div className="rounded-2xl border border-border-subtle bg-white p-8 text-center text-sm text-ink-secondary">
                  Nenhuma candidatura encontrada para os filtros selecionados.
                </div>
              ) : (
                filteredCandidaturas.map((cand) => {
                  const isActive = selectedCand?.id === cand.id;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => openCandidate(cand)}
                      className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition-all ${
                        isActive
                          ? 'border-ccg-green-700 bg-ccg-green-50/60 ring-2 ring-ccg-green-700/20'
                          : 'border-border-subtle bg-white hover:border-ccg-green-700/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-base font-bold text-ink-primary">
                          {cand.nome}
                        </p>
                        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-bold text-ink-secondary">
                          {CANDIDATURA_STATUS_LABELS[cand.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-ccg-green-800">
                        {cand.vagaTitulo}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        📍 {cand.cidadeUf} • 📄 {formatBytes(cand.curriculoTamanho)}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        Enviado em {formatDateBr(cand.createdAt)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            {/* Painel de detalhe do candidato */}
            <div className="lg:col-span-7">
              {!selectedCand ? (
                <div className="rounded-2xl border border-dashed border-border-subtle bg-white p-10 text-center text-sm text-ink-secondary">
                  Selecione um candidato à esquerda para visualizar os dados completos, baixar o
                  currículo e atualizar o status no processo seletivo.
                </div>
              ) : (
                <div className="space-y-5 rounded-2xl border border-border-subtle bg-white p-6 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-4">
                    <div>
                      <span className="rounded-full bg-ccg-green-50 px-2.5 py-0.5 text-xs font-bold text-ccg-green-900">
                        {selectedCand.vagaTitulo}
                      </span>
                      <h3 className="mt-2 font-display text-2xl font-extrabold text-ink-primary">
                        {selectedCand.nome}
                      </h3>
                      <p className="text-xs text-ink-muted">
                        Protocolo #{selectedCand.id.slice(0, 8).toUpperCase()} • Recebido em{' '}
                        {formatDateBr(selectedCand.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCandidatura(selectedCand)}
                      className="min-h-[38px] cursor-pointer rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </div>

                  {/* Contatos e Currículo */}
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <span className="block text-xs font-semibold text-ink-muted">E-mail</span>
                      <a
                        href={`mailto:${selectedCand.email}`}
                        className="font-semibold text-ccg-green-800 hover:underline"
                      >
                        {selectedCand.email}
                      </a>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-ink-muted">
                        Telefone / WhatsApp
                      </span>
                      <a
                        href={buildCandidateWhatsApp(
                          selectedCand.telefone,
                          selectedCand.nome,
                          selectedCand.vagaTitulo
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-ccg-green-800 hover:underline"
                      >
                        {selectedCand.telefone} (abrir WhatsApp ↗)
                      </a>
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-ink-muted">Cidade / UF</span>
                      <span className="text-ink-primary">{selectedCand.cidadeUf}</span>
                    </div>
                    {selectedCand.cpf && (
                      <div>
                        <span className="block text-xs font-semibold text-ink-muted">CPF</span>
                        <span className="text-ink-primary">{selectedCand.cpf}</span>
                      </div>
                    )}
                    {selectedCand.cnh && (
                      <div>
                        <span className="block text-xs font-semibold text-ink-muted">CNH</span>
                        <span className="text-ink-primary">{selectedCand.cnh}</span>
                      </div>
                    )}
                    {selectedCand.pretensaoSalarial && (
                      <div>
                        <span className="block text-xs font-semibold text-ink-muted">
                          Pretensão salarial
                        </span>
                        <span className="text-ink-primary">{selectedCand.pretensaoSalarial}</span>
                      </div>
                    )}
                    {selectedCand.linkedinUrl && (
                      <div className="sm:col-span-2">
                        <span className="block text-xs font-semibold text-ink-muted">
                          LinkedIn / Portfólio
                        </span>
                        <a
                          href={selectedCand.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all font-semibold text-ccg-green-800 hover:underline"
                        >
                          {selectedCand.linkedinUrl}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Box do currículo */}
                  <div className="flex flex-col justify-between gap-3 rounded-xl border border-ccg-green-800/20 bg-ccg-green-50 p-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-ccg-green-900">
                        Currículo anexado
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-ink-primary">
                        📄 {selectedCand.curriculoNome}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatBytes(selectedCand.curriculoTamanho)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/admin/curriculo?id=${encodeURIComponent(selectedCand.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[40px] items-center rounded-lg border border-ccg-green-800 bg-white px-3.5 text-xs font-bold text-ccg-green-900 hover:bg-ccg-green-100"
                      >
                        Visualizar
                      </a>
                      <a
                        href={`/api/admin/curriculo?id=${encodeURIComponent(selectedCand.id)}&download=1`}
                        className="inline-flex min-h-[40px] items-center rounded-lg bg-ccg-green-800 px-3.5 text-xs font-bold text-white hover:bg-ccg-green-900"
                      >
                        Baixar arquivo
                      </a>
                    </div>
                  </div>

                  {/* Experiência e observações */}
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                        Resumo de experiência / cursos
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap rounded-xl bg-surface-canvas p-3.5 text-ink-primary">
                        {selectedCand.experienciaResumo}
                      </p>
                    </div>
                    {selectedCand.mensagem && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                          Observações do candidato
                        </h4>
                        <p className="mt-1 whitespace-pre-wrap rounded-xl bg-surface-canvas p-3.5 text-ink-primary">
                          {selectedCand.mensagem}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Triagem RH */}
                  <div className="space-y-3 border-t border-border-subtle pt-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="rh-status"
                          className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted"
                        >
                          Etapa / Status
                        </label>
                        <select
                          id="rh-status"
                          value={editCandStatus}
                          onChange={(e) => setEditCandStatus(e.target.value as CandidaturaStatus)}
                          className="min-h-[42px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm font-semibold text-ink-primary"
                        >
                          {CANDIDATURA_STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {CANDIDATURA_STATUS_LABELS[st]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="rh-notas"
                        className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted"
                      >
                        Anotações internas do RH
                      </label>
                      <textarea
                        id="rh-notas"
                        rows={3}
                        value={editCandNotas}
                        onChange={(e) => setEditCandNotas(e.target.value)}
                        placeholder="Ex.: Entrevista agendada para quinta às 14h, possui NR-11 válida..."
                        className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3 text-sm text-ink-primary focus:border-ccg-green-700 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={savingCand}
                      onClick={() => void handleSaveCandidatura()}
                      className="min-h-[42px] cursor-pointer rounded-xl bg-ccg-green-800 px-5 text-sm font-bold text-white hover:bg-ccg-green-900 disabled:opacity-60"
                    >
                      {savingCand ? 'Salvando...' : 'Salvar triagem'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO DE VAGA */}
      {showVagaForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vaga-form-title"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h3 id="vaga-form-title" className="font-display text-2xl font-extrabold text-ink-primary">
                {vagaForm.id ? 'Editar Vaga' : 'Cadastrar Nova Vaga'}
              </h3>
              <button
                type="button"
                onClick={() => setShowVagaForm(false)}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border-subtle text-ink-secondary hover:bg-surface-muted"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVaga} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Título da vaga *
                  </label>
                  <input
                    type="text"
                    required
                    value={vagaForm.titulo}
                    onChange={(e) => setVagaForm({ ...vagaForm, titulo: e.target.value })}
                    placeholder="Ex.: Operador de Escavadeira Hidráulica"
                    className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-sm text-ink-primary"
                  />
                  {vagaFormErrors.titulo && (
                    <p className="mt-1 text-xs text-red-700">{vagaFormErrors.titulo}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Área / Departamento *
                  </label>
                  <input
                    type="text"
                    list="areas-sugeridas"
                    required
                    value={vagaForm.area}
                    onChange={(e) => setVagaForm({ ...vagaForm, area: e.target.value })}
                    className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-sm text-ink-primary"
                  />
                  <datalist id="areas-sugeridas">
                    {VAGA_AREAS_SUGERIDAS.map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Localidade / Obra *
                  </label>
                  <input
                    type="text"
                    required
                    value={vagaForm.localidade}
                    onChange={(e) => setVagaForm({ ...vagaForm, localidade: e.target.value })}
                    placeholder="Ex.: São Luís - MA (Pedrinhas)"
                    className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-sm text-ink-primary"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Modalidade *
                  </label>
                  <select
                    value={vagaForm.modalidade}
                    onChange={(e) =>
                      setVagaForm({ ...vagaForm, modalidade: e.target.value as VagaModalidade })
                    }
                    className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary"
                  >
                    {VAGA_MODALIDADE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Tipo de contrato *
                  </label>
                  <select
                    value={vagaForm.tipoContrato}
                    onChange={(e) =>
                      setVagaForm({ ...vagaForm, tipoContrato: e.target.value as VagaContrato })
                    }
                    className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary"
                  >
                    {VAGA_CONTRATO_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Faixa salarial <span className="font-normal text-ink-muted">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={vagaForm.faixaSalarial}
                    onChange={(e) => setVagaForm({ ...vagaForm, faixaSalarial: e.target.value })}
                    placeholder="Ex.: A combinar ou R$ 3.500 - R$ 4.200"
                    className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3.5 text-sm text-ink-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-ink-primary">
                      Nº de vagas *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      required
                      value={vagaForm.quantidade}
                      onChange={(e) =>
                        setVagaForm({ ...vagaForm, quantidade: Number(e.target.value) || 1 })
                      }
                      className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-ink-primary">
                      Status *
                    </label>
                    <select
                      value={vagaForm.status}
                      onChange={(e) =>
                        setVagaForm({ ...vagaForm, status: e.target.value as VagaStatus })
                      }
                      className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm text-ink-primary"
                    >
                      {VAGA_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {VAGA_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-ink-primary">
                  Resumo curto (aparece no card da vaga) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={vagaForm.resumo}
                  onChange={(e) => setVagaForm({ ...vagaForm, resumo: e.target.value })}
                  placeholder="Breve apresentação da oportunidade em 1 ou 2 frases."
                  className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3 text-sm text-ink-primary"
                />
                {vagaFormErrors.resumo && (
                  <p className="mt-1 text-xs text-red-700">{vagaFormErrors.resumo}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-ink-primary">
                  Descrição completa e atividades *
                </label>
                <textarea
                  rows={4}
                  required
                  value={vagaForm.descricao}
                  onChange={(e) => setVagaForm({ ...vagaForm, descricao: e.target.value })}
                  placeholder="Detalhe as responsabilidades diárias, frente de obra, turnos, etc."
                  className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3 text-sm text-ink-primary"
                />
                {vagaFormErrors.descricao && (
                  <p className="mt-1 text-xs text-red-700">{vagaFormErrors.descricao}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-ink-primary">
                  Requisitos (um por linha) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={vagaForm.requisitos}
                  onChange={(e) => setVagaForm({ ...vagaForm, requisitos: e.target.value })}
                  placeholder={`Experiência comprovada em carteira\nCNH categoria D ou E\nCertificação NR-11 / NR-12 atualizada`}
                  className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3 text-sm text-ink-primary"
                />
                {vagaFormErrors.requisitos && (
                  <p className="mt-1 text-xs text-red-700">{vagaFormErrors.requisitos}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Diferenciais <span className="font-normal text-ink-muted">(opcional, um por linha)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={vagaForm.diferenciais}
                    onChange={(e) => setVagaForm({ ...vagaForm, diferenciais: e.target.value })}
                    className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3 text-sm text-ink-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink-primary">
                    Benefícios <span className="font-normal text-ink-muted">(opcional, um por linha)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={vagaForm.beneficios}
                    onChange={(e) => setVagaForm({ ...vagaForm, beneficios: e.target.value })}
                    placeholder={`Vale alimentação\nPlano de saúde\nSeguro de vida`}
                    className="w-full rounded-lg border border-border-subtle bg-surface-canvas p-3 text-sm text-ink-primary"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink-primary">
                <input
                  type="checkbox"
                  checked={vagaForm.destaque}
                  onChange={(e) => setVagaForm({ ...vagaForm, destaque: e.target.checked })}
                  className="h-4 w-4 rounded border-border-subtle text-ccg-green-800"
                />
                Destacar esta vaga no topo da página Trabalhe Conosco
              </label>

              <div className="flex justify-end gap-3 border-t border-border-subtle pt-4">
                <button
                  type="button"
                  onClick={() => setShowVagaForm(false)}
                  className="min-h-[44px] cursor-pointer rounded-xl border border-border-subtle px-5 text-sm font-semibold text-ink-primary hover:bg-surface-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingVaga}
                  className="min-h-[44px] cursor-pointer rounded-xl bg-ccg-green-800 px-6 text-sm font-bold text-white hover:bg-ccg-green-900 disabled:opacity-60"
                >
                  {savingVaga ? 'Salvando...' : vagaForm.id ? 'Salvar alterações' : 'Publicar vaga'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
