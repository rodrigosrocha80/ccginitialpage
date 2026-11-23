-- Schema para o Gestor de Vagas e Captação de Currículos (CCG Locações)
-- Compatível com PostgreSQL padrão (KingHost, VPS, Neon, etc.), sem exigir extensões de superusuário.
-- Observação: a aplicação também executa CREATE TABLE IF NOT EXISTS automaticamente na primeira chamada.

CREATE TABLE IF NOT EXISTS vagas (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  titulo TEXT NOT NULL,
  area TEXT NOT NULL,
  localidade TEXT NOT NULL,
  modalidade TEXT NOT NULL,
  tipo_contrato TEXT NOT NULL,
  faixa_salarial TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  resumo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  requisitos TEXT NOT NULL,
  diferenciais TEXT,
  beneficios TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',
  destaque BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidaturas (
  id UUID PRIMARY KEY,
  vaga_id UUID REFERENCES vagas(id) ON DELETE SET NULL,
  vaga_titulo TEXT NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  cidade_uf TEXT NOT NULL,
  cpf TEXT,
  cnh TEXT,
  experiencia_resumo TEXT NOT NULL,
  pretensao_salarial TEXT,
  linkedin_url TEXT,
  mensagem TEXT,
  curriculo_url TEXT NOT NULL,
  curriculo_pathname TEXT NOT NULL,
  curriculo_nome TEXT NOT NULL,
  curriculo_tipo TEXT NOT NULL,
  curriculo_tamanho INTEGER NOT NULL,
  curriculo_storage TEXT NOT NULL DEFAULT 'vercel_blob',
  consentimento_lgpd BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'nova',
  notas_rh TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas(status);
CREATE INDEX IF NOT EXISTS idx_candidaturas_vaga_id ON candidaturas(vaga_id);
CREATE INDEX IF NOT EXISTS idx_candidaturas_status ON candidaturas(status);
CREATE INDEX IF NOT EXISTS idx_candidaturas_created_at ON candidaturas(created_at DESC);
