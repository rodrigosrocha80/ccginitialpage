# CCG Locações e Terraplenagem — Site Institucional & Catálogo de Frota

Novo site institucional de alta conversão para **CCG Construções e Terraplenagem LTDA** (`https://ccglocacao.com.br`), desenvolvido com **Astro 7**, **TypeScript estrito**, **Tailwind CSS v4**, **React 19** (ilhas interativas pontuais) e **Motion**.

---

## Estrutura de Pastas

```text
├── docs/
│   ├── PROMPT_MASTER.md               # Especificação de produto e engenharia
│   └── AUDITORIA_E_DESIGN_BRIEF.md    # Auditoria (Fase 1), Design Brief (Fase 2) e mapa 301
├── public/
│   ├── _redirects                     # Regras 301 para Cloudflare Pages / Netlify
│   ├── favicon.svg                    # Ícone vetorial CCG
│   └── robots.txt                     # Diretivas de indexação + sitemap
├── src/
│   ├── assets/                        # Imagens reais otimizadas via astro:assets (WebP/AVIF)
│   │   ├── brand/                     # Logomarca oficial, sede e diagrama SGI
│   │   ├── clientes/                  # Logos reais de contratantes e parceiros
│   │   ├── equipamentos/              # Fotos limpas dos 38 equipamentos
│   │   ├── hero/                      # Fotos aéreas e de campo em alta resolução
│   │   └── obras/                     # Fotos reais dos cases executados
│   ├── components/
│   │   ├── CookieConsent.tsx          # Banner LGPD (carrega GA4/Clarity só após aceite)
│   │   ├── EquipamentosCatalogo.tsx   # Catálogo filtrável + busca + seleção para cotação
│   │   ├── FaqAccordion.tsx           # Perguntas frequentes acessíveis
│   │   ├── Footer.astro               # Rodapé completo com mapa, contatos e CNPJ
│   │   ├── Header.astro               # Cabeçalho fixo + menu mobile acessível
│   │   ├── MotionReveal.tsx           # Reveal suave com respeito a prefers-reduced-motion
│   │   ├── OrcamentoForm.tsx          # Formulário validado com Zod 4 + honeypot/Turnstile
│   │   ├── PageHero.astro             # Cabeçalho padrão para páginas internas
│   │   └── WhatsAppFloat.astro        # Botão flutuante com mensagem pré-preenchida
│   ├── data/                          # Content Collections (conteúdo separado do layout)
│   │   ├── clientes.json
│   │   ├── depoimentos.json           # Contém placeholders marcados aguardando aprovação
│   │   ├── equipamentos.json
│   │   ├── faq.json
│   │   ├── obras.json
│   │   └── servicos.json
│   ├── layouts/
│   │   └── BaseLayout.astro           # Shell HTML, SEO, Open Graph, Canonical e JSON-LD
│   ├── lib/
│   │   ├── equipamentosView.ts        # Pré-otimização de imagens para o catálogo React
│   │   ├── images.ts                  # Mapeamento tipado de src/assets
│   │   ├── quoteSchema.ts             # Schema Zod 4 compartilhado client/server
│   │   └── site.ts                    # Dados institucionais centralizados e helper WhatsApp
│   ├── pages/
│   │   ├── api/orcamento.ts           # Endpoint server-side (POST) com Resend + anti-spam
│   │   ├── clientes.astro
│   │   ├── contato.astro
│   │   ├── equipamentos.astro
│   │   ├── index.astro                # Landing page principal de conversão
│   │   ├── obras.astro
│   │   ├── politica-integrada.astro
│   │   ├── privacidade.astro
│   │   ├── sobre.astro
│   │   └── trabalhe-conosco.astro
│   ├── styles/global.css              # Tailwind CSS v4 + @theme tokens + fontes self-hosted
│   └── content.config.ts              # Definição das Content Collections (Astro 7)
├── astro.config.mjs                   # Config Astro 7, Node adapter standalone e redirects 301
├── package.json
└── tsconfig.json
```

---

## Pré-requisitos e Instalação Local

- **Node.js**: `>= 22.23.4` (requisito do Astro 7)
- **npm**: `>= 9.6.5`

```bash
npm install
cp .env.example .env
npm run dev
```

Acesse `http://localhost:4321`.

### Verificação e Build de Produção

```bash
npm run check   # Validação de tipos TypeScript + templates Astro
npm run build   # Gera dist/client (estático) e dist/server (endpoint /api/orcamento)
npm run start   # Sobe o servidor Node standalone na porta 4321
```

---

## Variáveis de Ambiente (`.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PUBLIC_SITE_URL` | Sim (prod) | URL canônica (`https://ccglocacao.com.br`) |
| `RESEND_API_KEY` | Sim (prod) | Chave da API Resend para envio real dos e-mails de orçamento. Em dev, se omitida, o endpoint apenas registra o lead no console. |
| `QUOTE_FROM_EMAIL` | Sim (prod) | Remetente autenticado no Resend (ex.: `Site CCG Locações <noreply@ccglocacao.com.br>`) |
| `QUOTE_TO_EMAIL` | Não | Destino dos leads (padrão: `contratos@ccglocacao.com.br`) |
| `PUBLIC_TURNSTILE_SITE_KEY` | Opcional | Chave pública Cloudflare Turnstile no formulário |
| `TURNSTILE_SECRET_KEY` | Opcional | Chave secreta Cloudflare Turnstile validada em `/api/orcamento` |
| `PUBLIC_GA4_ID` | Opcional | ID Google Analytics 4 (`G-XXXXXXXXXX`), carregado apenas após aceite LGPD |
| `PUBLIC_CLARITY_ID` | Opcional | ID Microsoft Clarity, carregado apenas após aceite LGPD |
| `HOST` / `PORT` | Opcional | Bind do servidor Node (`0.0.0.0` / `4321`) |

---

## Como Editar Conteúdo (Sem Mexer em Layout)

Todo o conteúdo dinâmico fica isolado em `src/data/*.json` e validado automaticamente pelo `src/content.config.ts`:

- **Adicionar/editar equipamentos**: edite `src/data/equipamentos.json` e coloque a imagem em `src/assets/equipamentos/`.
- **Adicionar obras/cases**: edite `src/data/obras.json` e adicione a foto em `src/assets/obras/`.
- **Substituir os placeholders de depoimentos**: edite `src/data/depoimentos.json` trocando `"status": "placeholder"` para `"verificado"` e preenchendo nome, cargo, empresa e relato autorizados pelo cliente.
- **Atualizar FAQ, Serviços ou Clientes**: edite `src/data/faq.json`, `src/data/servicos.json` ou `src/data/clientes.json`.
- **Contatos, CNPJ, endereços e WhatsApp**: centralizados em `src/lib/site.ts`.

---

## Deploy

### Opção 1 — Docker + Nginx na sua infra GCP (Recomendada para este build Node standalone)
1. Execute `npm run build` para gerar `dist/`.
2. Rode o processo Node com `NODE_ENV=production HOST=127.0.0.1 PORT=4321 node dist/server/entry.mjs`.
3. Configure o Nginx com SSL (Let's Encrypt) fazendo proxy reverso para `http://127.0.0.1:4321` e cache longo (`Cache-Control: public, max-age=31536000, immutable`) para `/_astro/*`.

### Opção 2 — Cloudflare Pages ou Vercel
Substitua `@astrojs/node` por `@astrojs/cloudflare` ou `@astrojs/vercel` em `astro.config.mjs`. Os redirects 301 das URLs antigas `.html` também já estão mapeados em `public/_redirects`.
