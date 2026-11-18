import { z } from 'zod';

export const quoteSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe seu nome completo ou nome do responsável.')
    .max(120, 'Nome muito longo.'),
  telefone: z
    .string()
    .trim()
    .min(8, 'Informe um telefone ou WhatsApp válido com DDD.')
    .max(30, 'Telefone inválido.'),
  email: z
    .email('Informe um e-mail corporativo ou pessoal válido.')
    .max(160, 'E-mail muito longo.'),
  mensagem: z
    .string()
    .trim()
    .min(5, 'Descreva brevemente o equipamento ou serviço desejado.')
    .max(2000, 'Mensagem excedeu o limite de 2000 caracteres.'),
  equipamentoInteresse: z.string().trim().max(160).optional(),
  consentimentoLgpd: z
    .boolean()
    .refine((v) => v === true, {
      message: 'É necessário concordar com a Política de Privacidade para enviar.',
    }),
  // Campo honeypot: deve permanecer vazio para envios humanos
  website: z.string().max(0).optional(),
  turnstileToken: z.string().optional(),
});

export type QuoteInput = z.infer<typeof quoteSchema>;
