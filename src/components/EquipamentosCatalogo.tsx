import { useMemo, useState } from 'react';
import { MotionConfig, motion, AnimatePresence } from 'motion/react';
import { ShareBadge } from '@/components/ShareBadge';
import type { EquipamentoView } from '@/lib/equipamentosView';
import { getCategoryByName } from '@/lib/seo';
import { buildEquipmentShareData } from '@/lib/share';
import { buildWhatsAppUrl } from '@/lib/site';

interface EquipamentosCatalogoProps {
  items: EquipamentoView[];
  mode?: 'home' | 'full';
}

const CATEGORIES = [
  'Todas',
  'Escavadeiras',
  'Carregadeiras',
  'Retroescavadeiras',
  'Tratores e Nivelamento',
  'Compactação',
  'Pavimentação',
  'Caminhões e Logística',
  'Veículos de Apoio',
] as const;

export function EquipamentosCatalogo({ items, mode = 'home' }: EquipamentosCatalogoProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [query, setQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllOnHome, setShowAllOnHome] = useState<boolean>(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchCat = selectedCategory === 'Todas' || item.categoria === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const specText = item.especificacoes.map((s) => `${s.label} ${s.valor}`).join(' ');
      const modelsText = item.modelosDetalhados?.map((m) => m.modelo).join(' ') ?? '';
      return `${item.nome} ${item.categoria} ${item.resumo} ${specText} ${modelsText}`
        .toLowerCase()
        .includes(q);
    });
  }, [items, selectedCategory, query]);

  const visibleItems = useMemo(() => {
    if (mode === 'full' || showAllOnHome || query.trim() !== '' || selectedCategory !== 'Todas') {
      return filtered;
    }
    // Na Home em estado inicial, exibe 8 destaques (1 por família) para manter escaneabilidade
    const featured = filtered.filter((i) => i.destaque);
    return featured.length >= 6 ? featured.slice(0, 8) : filtered.slice(0, 8);
  }, [filtered, mode, showAllOnHome, query, selectedCategory]);

  const handleSelectForQuote = (nomeEquipamento: string) => {
    window.dispatchEvent(
      new CustomEvent('ccg:select-equipment', { detail: { equipment: nomeEquipamento } })
    );
    const target = document.getElementById('orcamento');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.location.href = `/contato?equipamento=${encodeURIComponent(nomeEquipamento)}#orcamento`;
    }
  };

  const activeCategoryMeta =
    selectedCategory !== 'Todas' ? getCategoryByName(selectedCategory) : undefined;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Barra de busca + filtros */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categorias de equipamentos">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[44px] cursor-pointer rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-ccg-green-800 text-white shadow-xs'
                      : 'bg-surface-muted text-ink-secondary hover:bg-ccg-green-100 hover:text-ccg-green-900'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-72">
            <label htmlFor="busca-frota" className="sr-only">
              Buscar equipamento ou especificação
            </label>
            <input
              id="busca-frota"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar máquina, t, m³..."
              className="min-h-[44px] w-full rounded-lg border border-border-subtle bg-surface-canvas pl-10 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-ccg-green-700 focus:bg-white focus:outline-none"
            />
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>

        {/* Contagem e estado vazio */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-secondary">
          <p>
            Exibindo <strong className="text-ink-primary">{visibleItems.length}</strong> de{' '}
            <strong className="text-ink-primary">{filtered.length}</strong> equipamentos
            {selectedCategory !== 'Todas' ? ` em ${selectedCategory}` : ''}.
          </p>
          {activeCategoryMeta && (
            <a
              href={`/equipamentos/${activeCategoryMeta.slug}`}
              className="inline-flex min-h-[36px] items-center font-semibold text-ccg-green-800 underline-offset-4 hover:underline"
            >
              Ver página de {activeCategoryMeta.nome} &rarr;
            </a>
          )}
          {mode === 'home' && !showAllOnHome && selectedCategory === 'Todas' && query === '' && (
            <button
              type="button"
              onClick={() => setShowAllOnHome(true)}
              className="min-h-[44px] cursor-pointer font-semibold text-ccg-green-800 underline-offset-4 hover:underline"
            >
              Ver todos os {items.length} equipamentos aqui
            </button>
          )}
        </div>

        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-white p-10 text-center">
            <p className="text-base font-semibold text-ink-primary">
              Nenhum equipamento encontrado para &ldquo;{query}&rdquo;.
            </p>
            <p className="mt-1 text-sm text-ink-secondary">
              Limpe o filtro ou consulte diretamente nossa equipe de locação para configurações especiais.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedCategory('Todas');
                }}
                className="min-h-[44px] cursor-pointer rounded-lg border border-border-subtle px-4 py-2 text-sm font-semibold text-ink-primary hover:bg-surface-muted"
              >
                Limpar filtros
              </button>
              <a
                href={buildWhatsAppUrl(`Olá! Procuro um equipamento específico (${query}) para locação.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-ccg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-ccg-green-900"
              >
                Consultar no WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {visibleItems.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <motion.article
                    key={item.id}
                    layout="position"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="group relative flex flex-col rounded-2xl border border-border-subtle bg-surface-card shadow-xs transition-shadow hover:shadow-md has-[[aria-expanded=true]]:z-30"
                  >
                    <div className="relative aspect-[4/3] rounded-t-2xl bg-white">
                      <a
                        href={`/equipamentos/${item.id}`}
                        aria-label={`Ver descrição e ficha técnica de ${item.nome}`}
                        className="flex h-full w-full items-center justify-center overflow-hidden rounded-t-2xl px-4 pb-4 pt-11"
                      >
                        <img
                          src={item.imageSrc}
                          srcSet={item.imageSrcSet || undefined}
                          sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 24vw"
                          width={item.imageWidth}
                          height={item.imageHeight}
                          alt={item.nome}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      </a>
                      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate rounded-md bg-ccg-green-50/95 px-2.5 py-1 text-xs font-semibold text-ccg-green-900 ring-1 ring-ccg-green-800/15">
                          {item.categoria}
                        </span>
                        <ShareBadge
                          {...buildEquipmentShareData(item)}
                          variant="overlay"
                          ariaLabel={`Compartilhar ${item.nome}`}
                          className="pointer-events-auto shrink-0"
                        />
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col border-t border-border-subtle p-5">
                      <h3 className="font-display text-lg font-bold leading-snug text-ink-primary">
                        <a
                          href={`/equipamentos/${item.id}`}
                          className="transition-colors hover:text-ccg-green-800 hover:underline"
                        >
                          {item.nome}
                        </a>
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                        {item.resumo}
                      </p>

                      {/* Especificações técnicas estruturadas */}
                      <dl className="mt-4 space-y-2 rounded-xl bg-surface-canvas p-3 text-xs">
                        {item.especificacoes.map((spec) => (
                          <div key={spec.label} className="flex flex-col gap-0.5 border-b border-border-subtle/70 pb-1.5 last:border-b-0 last:pb-0">
                            <dt className="font-medium text-ink-muted">{spec.label}</dt>
                            <dd className="font-semibold text-ink-primary">{spec.valor}</dd>
                          </div>
                        ))}
                      </dl>

                      {item.modelosDetalhados && item.modelosDetalhados.length > 0 && (
                        <div className="mt-3">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 text-xs font-bold text-ccg-green-800 hover:underline"
                          >
                            <span>
                              {isExpanded
                                ? 'Ocultar fichas dos modelos'
                                : `Ver ${item.modelosDetalhados.length} modelos da frota`}
                            </span>
                            <svg
                              aria-hidden="true"
                              className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>

                          <ul
                            hidden={!isExpanded}
                            className="mt-2 space-y-2 rounded-lg border border-border-subtle bg-ccg-green-50/60 p-3 text-xs"
                          >
                            {item.modelosDetalhados.map((m) => (
                              <li key={m.modelo} className="space-y-0.5">
                                <p className="font-bold text-ccg-green-900">{m.modelo}</p>
                                {m.detalhes.map((d) => (
                                  <p key={d} className="text-ink-secondary">
                                    {d}
                                  </p>
                                ))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-3">
                        <a
                          href={`/equipamentos/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-ccg-green-800 hover:underline"
                        >
                          Ficha técnica completa <span aria-hidden="true">&rarr;</span>
                        </a>
                      </div>

                      <div className="mt-auto flex gap-2 pt-5">
                        <button
                          type="button"
                          onClick={() => handleSelectForQuote(item.nome)}
                          className="min-h-[44px] flex-1 cursor-pointer rounded-lg bg-ccg-green-800 px-3 py-2 text-center text-sm font-bold text-white transition-colors hover:bg-ccg-green-900"
                        >
                          Solicitar cotação
                        </button>
                        <a
                          href={buildWhatsAppUrl(
                            `Olá! Gostaria de verificar disponibilidade e cotação para: ${item.nome}.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Cotar ${item.nome} pelo WhatsApp`}
                          title="Cotar via WhatsApp"
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-ccg-green-800/30 bg-ccg-green-50 text-ccg-green-900 transition-colors hover:bg-ccg-green-100"
                        >
                          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.03 2a9.97 9.97 0 0 0-8.6 15.01L2 22l5.13-1.35A9.98 9.98 0 1 0 12.03 2Zm5.82 14.12c-.25.7-1.42 1.34-1.97 1.41-.51.07-1.15.1-1.85-.12-.43-.14-.99-.32-1.7-.63-2.99-1.29-4.94-4.32-5.09-4.52-.15-.2-1.21-1.61-1.21-3.07 0-1.46.76-2.18 1.03-2.48.27-.3.59-.37.79-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.33-.3.5-.15.18-.32.4-.45.53-.15.15-.31.31-.13.61.18.3.8 1.32 1.72 2.14 1.18 1.05 2.18 1.38 2.48 1.53.3.15.48.12.66-.07.18-.2.76-.88.96-1.18.2-.3.41-.25.69-.15.28.1 1.77.83 2.07.98.3.15.5.23.58.35.07.13.07.73-.18 1.43Z" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {mode === 'home' && !showAllOnHome && (
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-ccg-green-800/20 bg-ccg-green-50 p-6 sm:flex-row">
            <div>
              <p className="font-display text-lg font-bold text-ccg-green-900">
                Catálogo completo com {items.length} configurações de frota disponíveis
              </p>
              <p className="text-sm text-ink-secondary">
                Consulte fichas técnicas detalhadas de escavadeiras, rolos, usina de asfalto móvel, caminhões e veículos de apoio.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowAllOnHome(true)}
                className="min-h-[44px] cursor-pointer rounded-lg border border-ccg-green-800 px-4 py-2 text-sm font-bold text-ccg-green-900 hover:bg-white"
              >
                Expandir todos aqui
              </button>
              <a
                href="/equipamentos"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-ccg-green-800 px-5 py-2 text-sm font-bold text-white hover:bg-ccg-green-900"
              >
                Abrir catálogo completo
              </a>
            </div>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
