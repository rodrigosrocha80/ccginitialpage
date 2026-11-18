# Auditoria (Fase 1), Design Brief (Fase 2) e Mapa de Migração — CCG Locações

## Fase 1 — Auditoria da Página Atual (`http://ccglocacao.com.br/`)

### 1. Inventário completo de conteúdo encontrado
O site legado foi gerado em **Adobe Muse 2017** (`generator: 2017.0.0.363`), servido apenas em HTTP sem SSL válido (certificado com erro `SEC_E_WRONG_PRINCIPAL` no acesso via `https://`). Contém 21 páginas estáticas `.html` e formulários legados em PHP (`scripts/form-u3787.php`, `scripts/form-u855.php`):

- **Home (`index.html`)**: Central de atendimento (`(98) 3313-9550`, `(98) 99988-0523`, `(98) 99988-0545`, `contratos@ccglocacao.com.br`), slideshow com 5 fotos de frota/obra, texto institucional sobre frota superior a 200 máquinas e assessoria de engenharia para obras de pequeno e médio porte, CTA em modal ("Solicite seu orçamento") e rodapé com endereço (`Av. Engenheiro Emiliano Macieira, Nº650, Pedrinhas, São Luís - Maranhão`).
- **A CCG (`a-ccg.html`)**: História desde 2003, participação na Alumar, UTE Itaqui (MPX), Vale S11D (On Shore e TFPM), VLI-Logística (Ferrovia Norte-Sul em Imperatriz), Missão, Visão e Valores.
- **Equipamentos (`equipamentos.html` + 6 subpáginas)**:
  - `escavadeira-hidraulica.html`: Hyundai 380 LC-9SH Robex, 360 LC-7A, 320 LC-7, 210 LC-7 e Komatsu PC160.
  - `miniescavadeira.html`: Case CX36B.
  - `carregadeiras.html`: Hyundai HL740-7A, HL757-7A, Lonking CDM 835E e CDM 856.
  - `minicarregadeira.html`: sem especificações em texto.
  - `retroescavadeira.html`: Case 580N, Case 580M e JCB 3C Plus (com especificações incompletas na JCB).
  - `motoniveladora.html`: Volvo G930.
  - Demais máquinas exibidas apenas como cards de imagem com texto rasterizado: Auto Betoneira, Caminhão Basculante, Betoneira, Comboio, Espargidor, Guindaste, Munck, Pipa, Plataforma, Carreta Prancha, Pá Carregadeira com Garfo, Mini Rolo, Rolos (Liso, Pé de Carneiro, Pneus), Trator Agrícola, Trator de Esteira e Vibroacabadora.
- **Obras (`obras.html` + 7 subpáginas)**: Barreirinhas (SECTUR, 22 km Povoado Cardosa), Areia Branca/RN (SNEF), Oiapoque/AP (Voltalia), Refinaria Premium Bacabeira (Consórcio Siemens/MARZA), S11D On Shore e TFPM (Vale), Transposição do Rio São Francisco (Serveng) e Ferrovia Norte-Sul (VLI).
- **Clientes (`clientes.html`)**: Principais clientes (Alumar, Camargo Corrêa, Vale, Mendes Júnior, Petrobras, VLI, Porto do Itaqui/EMAP, Governo do MA, SNEF, Maity, Eletronorte, Serveng) e parceiro J&D Comercial.
- **Nossa Política (`nossa-politica.html`)**: 5 diretrizes de Gestão Integrada (Saúde Ocupacional, Segurança do Trabalho, Meio Ambiente, Qualidade e Responsabilidade Social) + diagrama SGI.
- **Contatos (`contatos.html`)**: Endereço, telefones (inclui `(98) 99988-0520`), e-mail, mapa Google Maps embarcado e formulário PHP.
- **Trabalhe Conosco (`trabalhe-conosco.html`)**: Orientação para envio de currículo para `rh@ccglocacao.com.br`.

### 2. Diagnóstico técnico e de conversão
- **Segurança & SEO**: Acesso HTTPS quebrado por mismatch de certificado; `robots.txt` retornando `404`; ausência de `canonical`, Open Graph e dados estruturados (`Organization`/`LocalBusiness`); várias subpáginas sem `meta description` e título repetido (`CCG Construções`).
- **Acessibilidade & Texto Rasterizado**: Títulos de seção, itens de menu e **todas as especificações técnicas dos 30 cards de equipamentos** estavam renderizados dentro de arquivos JPG/PNG (`u185-6.png`, `cam_basculante.jpg`, etc.). Leitores de tela e buscadores não conseguem ler esses dados, e no mobile o texto fica ilegível.
- **Performance (LCP / CLS / INP)**: Depende de jQuery 1.8.3 + RequireJS + Muse widgets + imagens `blank.gif` com substituição tardia via JS, sem `srcset`, sem AVIF/WebP e sem layout responsivo mobile-first (layout absoluto de 1160 px do Adobe Muse).
- **Conversão**: O CTA da Home abre um modal oculto em vez de conduzir o visitante por provas reais (clientes, números, frota filtrável) até um orçamento rápido; não há botão flutuante de WhatsApp com mensagem contextual; e os erros de digitação ("contrução", "cofiaveis", "Traçaõ") reduzem credibilidade junto a grandes contratantes.

### 3. Matriz de Decisão (Preservar / Reescrever / Remover)
- **Preservar**: Todos os dados técnicos reais das máquinas (pesos, capacidades, modelos Hyundai/Komatsu/Case/Volvo/JCB/Lonking), todos os contatos (`(98) 3313-9550`, `(98) 99988-0545`, `(98) 99988-0523`, `(98) 99988-0520`, `contratos@ccglocacao.com.br`, `rh@ccglocacao.com.br`), endereço em Pedrinhas, histórico de obras (Barreirinhas, SNEF, Voltalia, Refinaria, S11D, VLI, Serveng), política SGI em 5 itens e lista completa de clientes.
- **Reescrever / Enriquecer com dados oficiais de `ccgconstrucoes.com`**: Atualizar os números e portfólio com dados reais da própria CCG (frota corporativa `+600` equipamentos, disponibilidade `> 95%`, idade `< 5 anos`, obras recentes Alumar Lagoas Babilônia/ARB, Anajatuba/São João Batista, Cedral, Ambev, Maity, CNPJ `05.638.550/0001-54`, redes sociais oficiais e novos equipamentos como Usina de Asfalto Móvel, Fresadora, Escavadeira Anfíbia e Rodoferroviária). Converter todas as fichas técnicas de imagem para HTML semântico.
- **Remover**: Runtime do Adobe Muse, jQuery 1.8.3, RequireJS, scripts PHP legados sem proteção CSRF/anti-spam, textos rasterizados em PNG/JPG e marcações de ano desatualizadas ("14 anos", "até 2023").

---

## Fase 2 — Referências de Classe Mundial e Design Brief

### Referências selecionadas e princípios aplicados
1. **Cat Rental Store (`catrentalstore.com`)**: Filtragem imediata da frota por família de máquina e especificações objetivas (tonelagem / m³) diretamente no card antes do clique.
2. **United Rentals (`unitedrentals.com`)**: Barra superior direta com telefone/contato, prova social corporativa logo abaixo da dobra e fluxo de cotação que pré-seleciona o equipamento escolhido.
3. **Armac / Mills (`armac.com.br` / `mills.com.br`)**: Clareza B2B entre locação de linha amarela e execução de obras pesadas, uso de métricas operacionais reais e integração imediata com WhatsApp comercial.

### Design Brief & Tokens (derivados de `https://ccgconstrucoes.com`)
- **Paleta**:
  - Primária escura (autoridade industrial): `--color-ccg-forest: #0b2416`
  - Verde institucional CCG: `--color-ccg-green-800: #105e2d` / `--color-ccg-green-600: #19a74e`
  - Acento Linha Amarela (contraste alto em fundo escuro): `--color-ccg-yellow-400: #f5d000`
  - Superfícies claras: `#f7f8f7` (canvas) e `#ffffff` (cards), borda `#dbe2dd`, texto `#111814` e `#3f4b44` (contraste AA/AAA).
- **Tipografia** (2 famílias variáveis self-hosted):
  - Display: `Archivo Variable` (títulos e números de impacto)
  - Corpo / UI: `Inter Variable` (corpo mínimo 16 px, entrelinha generosa)
- **Ritmo & Interação**:
  - Mobile-first testado para 360, 768, 1280 e 1920 px; alvos de toque >= 44 px; animações curtas (`200–320 ms`) via Motion respeitando `prefers-reduced-motion`.

---

## Mapa de Redirecionamentos 301 (URLs antigas -> novas)

Configurado em `astro.config.mjs` (Node/SSR) e `public/_redirects` (Cloudflare Pages):

| URL Antiga | Destino 301 |
|---|---|
| `/index.html` | `/` |
| `/equipamentos.html` | `/equipamentos` |
| `/escavadeira-hidraulica.html`, `/miniescavadeira.html` | `/equipamentos#escavadeiras` |
| `/carregadeiras.html`, `/minicarregadeira.html` | `/equipamentos#carregadeiras` |
| `/retroescavadeira.html` | `/equipamentos#retroescavadeiras` |
| `/motoniveladora.html` | `/equipamentos#tratores-e-nivelamento` |
| `/a-ccg.html` | `/sobre` |
| `/obras.html` | `/obras` |
| `/obra-barreirinhas.html` | `/obras#barreirinhas-sectur` |
| `/obra-sneff.html` | `/obras#areia-branca-snef` |
| `/obra-voltalia.html` | `/obras#oiapoque-voltalia` |
| `/obra-refinaria.html` | `/obras#refinaria-bacabeira` |
| `/sd11-(tfpm).html` | `/obras#cln-s11d-tfpm` |
| `/obra-vli.html` | `/obras#ferrovia-norte-sul-vli` |
| `/transposição-do-rio-são-francisco.html` | `/obras#transposicao-sao-francisco` |
| `/clientes.html` | `/clientes` |
| `/nossa-politica.html` | `/politica-integrada` |
| `/contatos.html` | `/contato` |
| `/trabalhe-conosco.html` | `/trabalhe-conosco` |
