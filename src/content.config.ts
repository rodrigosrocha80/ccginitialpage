import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const equipamentos = defineCollection({
  loader: file('src/data/equipamentos.json'),
  schema: z.object({
    id: z.string(),
    nome: z.string(),
    categoria: z.enum([
      'Escavadeiras',
      'Carregadeiras',
      'Retroescavadeiras',
      'Tratores e Nivelamento',
      'Compactação',
      'Pavimentação',
      'Caminhões e Logística',
      'Veículos de Apoio',
    ]),
    imagem: z.string(),
    resumo: z.string(),
    especificacoes: z.array(
      z.object({
        label: z.string(),
        valor: z.string(),
      })
    ),
    modelosDetalhados: z
      .array(
        z.object({
          modelo: z.string(),
          detalhes: z.array(z.string()),
        })
      )
      .optional(),
    destaque: z.boolean().default(false),
    ordem: z.number(),
  }),
});

const servicos = defineCollection({
  loader: file('src/data/servicos.json'),
  schema: z.object({
    id: z.string(),
    titulo: z.string(),
    beneficio: z.string(),
    descricao: z.string(),
    entregas: z.array(z.string()),
    icone: z.string(),
    ordem: z.number(),
  }),
});

const obras = defineCollection({
  loader: file('src/data/obras.json'),
  schema: z.object({
    id: z.string(),
    titulo: z.string(),
    cliente: z.string(),
    local: z.string(),
    estado: z.string(),
    setor: z.string(),
    imagem: z.string(),
    contexto: z.string(),
    resultados: z.array(z.string()),
    destaque: z.boolean().default(false),
    ordem: z.number(),
  }),
});

const faq = defineCollection({
  loader: file('src/data/faq.json'),
  schema: z.object({
    id: z.string(),
    pergunta: z.string(),
    resposta: z.string(),
    ordem: z.number(),
  }),
});

const depoimentos = defineCollection({
  loader: file('src/data/depoimentos.json'),
  schema: z.object({
    id: z.string(),
    status: z.enum(['placeholder', 'verificado']),
    nome: z.string(),
    cargo: z.string(),
    empresa: z.string(),
    obraRelacionada: z.string(),
    texto: z.string(),
    ordem: z.number(),
  }),
});

const clientes = defineCollection({
  loader: file('src/data/clientes.json'),
  schema: z.object({
    id: z.string(),
    nome: z.string(),
    logo: z.string(),
    segmento: z.string(),
    destaque: z.boolean().default(false),
    ordem: z.number(),
  }),
});

const certificados = defineCollection({
  loader: file('src/data/certificados.json'),
  schema: z.object({
    id: z.enum(['procem', 'iso-9001', 'iso-14001']),
    sigla: z.string(),
    norma: z.string(),
    nome: z.string(),
    categoria: z.string(),
    pilarSgi: z.string(),
    resumo: z.string(),
    destaques: z.array(z.string()),
    registro: z.string().optional(),
    certificadora: z.string().optional(),
    validade: z.string().optional(),
    arquivoPdf: z.string().optional(),
    ordem: z.number(),
  }),
});

export const collections = {
  equipamentos,
  servicos,
  obras,
  faq,
  depoimentos,
  clientes,
  certificados,
};
