import { z } from 'zod';

export const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const ALLOWED_RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;

export const VAGA_STATUS_OPTIONS = ['aberta', 'pausada', 'encerrada'] as const;
export type VagaStatus = (typeof VAGA_STATUS_OPTIONS)[number];

export const VAGA_MODALIDADE_OPTIONS = [
  'Presencial',
  'Obra em Campo',
  'Híbrido',
  'Remoto',
] as const;
export type VagaModalidade = (typeof VAGA_MODALIDADE_OPTIONS)[number];

export const VAGA_CONTRATO_OPTIONS = [
  'CLT',
  'PJ',
  'Temporário',
  'Estágio',
  'Jovem Aprendiz',
] as const;
export type VagaContrato = (typeof VAGA_CONTRATO_OPTIONS)[number];

export const CANDIDATURA_STATUS_OPTIONS = [
  'nova',
  'em_analise',
  'entrevista',
  'aprovada',
  'banco_talentos',
  'recusada',
] as const;
export type CandidaturaStatus = (typeof CANDIDATURA_STATUS_OPTIONS)[number];

export const CANDIDATURA_STATUS_LABELS: Record<CandidaturaStatus, string> = {
  nova: 'Nova',
  em_analise: 'Em análise',
  entrevista: 'Entrevista',
  aprovada: 'Aprovada',
  banco_talentos: 'Banco de talentos',
  recusada: 'Não selecionada',
};

export const VAGA_STATUS_LABELS: Record<VagaStatus, string> = {
  aberta: 'Aberta',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
};

export const VAGA_AREAS_SUGERIDAS = [
  'Operação de Máquinas Pesadas',
  'Motoristas e Logística',
  'Manutenção e Oficina',
  'Engenharia e Obras',
  'Segurança do Trabalho (SSMA)',
  'Administrativo e Financeiro',
  'Comercial e Contratos',
  'Recursos Humanos',
] as const;

export interface Vaga {
  id: string;
  slug: string;
  titulo: string;
  area: string;
  localidade: string;
  modalidade: VagaModalidade;
  tipoContrato: VagaContrato;
  faixaSalarial: string | null;
  quantidade: number;
  resumo: string;
  descricao: string;
  requisitos: string;
  diferenciais: string | null;
  beneficios: string | null;
  status: VagaStatus;
  destaque: boolean;
  createdAt: string;
  updatedAt: string;
  totalCandidaturas?: number;
}

export interface Candidatura {
  id: string;
  vagaId: string | null;
  vagaTitulo: string;
  nome: string;
  email: string;
  telefone: string;
  cidadeUf: string;
  cpf: string | null;
  cnh: string | null;
  experienciaResumo: string;
  pretensaoSalarial: string | null;
  linkedinUrl: string | null;
  mensagem: string | null;
  curriculoUrl: string;
  curriculoPathname: string;
  curriculoNome: string;
  curriculoTipo: string;
  curriculoTamanho: number;
  curriculoStorage: 'vercel_blob' | 'local';
  consentimentoLgpd: boolean;
  status: CandidaturaStatus;
  notasRh: string | null;
  createdAt: string;
  updatedAt: string;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isAllowedResumeFile(fileName: string, mimeType?: string): boolean {
  const lower = fileName.trim().toLowerCase();
  const hasValidExt = ALLOWED_RESUME_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!hasValidExt) return false;
  if (!mimeType || mimeType === 'application/octet-stream') return true;
  return (ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(mimeType);
}

export const vagaInputSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(3, 'Informe o título da vaga (mínimo 3 caracteres).')
    .max(140, 'Título muito longo (máximo 140 caracteres).'),
  slug: z.string().trim().max(100).optional(),
  area: z
    .string()
    .trim()
    .min(2, 'Informe a área ou departamento.')
    .max(100, 'Área muito longa.'),
  localidade: z
    .string()
    .trim()
    .min(2, 'Informe a cidade/estado ou frente de obra.')
    .max(120, 'Localidade muito longa.'),
  modalidade: z.enum(VAGA_MODALIDADE_OPTIONS),
  tipoContrato: z.enum(VAGA_CONTRATO_OPTIONS),
  faixaSalarial: z.string().trim().max(100).optional().nullable(),
  quantidade: z.coerce
    .number()
    .int()
    .min(1, 'Informe pelo menos 1 vaga.')
    .max(999, 'Quantidade inválida.')
    .default(1),
  resumo: z
    .string()
    .trim()
    .min(10, 'Escreva um resumo objetivo da vaga (mínimo 10 caracteres).')
    .max(400, 'Resumo muito longo (máximo 400 caracteres).'),
  descricao: z
    .string()
    .trim()
    .min(15, 'Descreva as principais atividades da vaga (mínimo 15 caracteres).')
    .max(5000, 'Descrição excedeu 5000 caracteres.'),
  requisitos: z
    .string()
    .trim()
    .min(5, 'Informe os requisitos da vaga.')
    .max(3000, 'Requisitos excederam 3000 caracteres.'),
  diferenciais: z.string().trim().max(2000).optional().nullable(),
  beneficios: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(VAGA_STATUS_OPTIONS).default('aberta'),
  destaque: z.boolean().default(false),
});

export type VagaInput = z.infer<typeof vagaInputSchema>;

export const candidaturaInputSchema = z.object({
  vagaId: z.string().trim().optional().nullable(),
  vagaTitulo: z.string().trim().min(2).max(160).optional(),
  nome: z
    .string()
    .trim()
    .min(3, 'Informe seu nome completo.')
    .max(140, 'Nome muito longo.'),
  email: z
    .email('Informe um e-mail válido.')
    .max(160, 'E-mail muito longo.'),
  telefone: z
    .string()
    .trim()
    .min(8, 'Informe um telefone ou WhatsApp válido com DDD.')
    .max(30, 'Telefone inválido.'),
  cidadeUf: z
    .string()
    .trim()
    .min(2, 'Informe sua cidade e estado (ex.: São Luís - MA).')
    .max(100, 'Cidade/UF muito longa.'),
  cpf: z.string().trim().max(20).optional().nullable(),
  cnh: z.string().trim().max(40).optional().nullable(),
  experienciaResumo: z
    .string()
    .trim()
    .min(10, 'Resuma sua experiência profissional, máquinas operadas ou cursos.')
    .max(2500, 'Resumo excedeu 2500 caracteres.'),
  pretensaoSalarial: z.string().trim().max(80).optional().nullable(),
  linkedinUrl: z
    .string()
    .trim()
    .max(250)
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^https?:\/\/.+/i.test(val),
      'Informe uma URL válida começando com http:// ou https://'
    ),
  mensagem: z.string().trim().max(2000).optional().nullable(),
  curriculoUrl: z.string().trim().min(1, 'Envie seu currículo antes de finalizar.'),
  curriculoPathname: z.string().trim().min(1, 'Arquivo de currículo inválido.'),
  curriculoNome: z.string().trim().min(1).max(255),
  curriculoTipo: z.string().trim().min(1).max(120),
  curriculoTamanho: z
    .number()
    .int()
    .positive('O arquivo de currículo está vazio.')
    .max(MAX_RESUME_BYTES, 'O currículo deve ter no máximo 10 MB.'),
  curriculoStorage: z.enum(['vercel_blob', 'local']).default('vercel_blob'),
  consentimentoLgpd: z.boolean().refine((v) => v === true, {
    message: 'É necessário concordar com o tratamento de dados conforme a Política de Privacidade (LGPD).',
  }),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().optional(),
});

export type CandidaturaInput = z.infer<typeof candidaturaInputSchema>;

export const candidaturaUpdateSchema = z.object({
  status: z.enum(CANDIDATURA_STATUS_OPTIONS).optional(),
  notasRh: z.string().trim().max(4000).optional().nullable(),
});

export type CandidaturaUpdateInput = z.infer<typeof candidaturaUpdateSchema>;
