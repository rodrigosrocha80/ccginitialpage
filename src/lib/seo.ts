import { SITE } from './site';

export interface CategorySeoMeta {
  slug: string;
  nome: string;
  shortTitle: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  intro: string;
}

export const EQUIPMENT_CATEGORIES: CategorySeoMeta[] = [
  {
    slug: 'escavadeiras',
    nome: 'Escavadeiras',
    shortTitle: 'Escavadeiras Hidráulicas',
    seoTitle: 'Locação de Escavadeira Hidráulica (16t a 38t, Mini e Braço Longo) | CCG',
    seoDescription:
      'Aluguel de escavadeira hidráulica com concha, rompedor, braço longo 15m, pneu, anfíbia, rodoferroviária e mini escavadeira. Frota Hyundai, Komatsu e Case no Maranhão e Brasil.',
    h1: 'Locação de Escavadeiras Hidráulicas',
    intro:
      'Escavadeiras de 4,2 t a 38,4 t com concha, rompedor hidráulico, braço longo de 15 m, versão anfíbia e rodoferroviária para escavação, drenagem, mineração e obras industriais.',
  },
  {
    slug: 'carregadeiras',
    nome: 'Carregadeiras',
    shortTitle: 'Pás Carregadeiras',
    seoTitle: 'Locação de Pá Carregadeira e Mini Carregadeira | CCG Locações',
    seoDescription:
      'Locação de pá carregadeira com concha (1,8 a 3,0 m³), carregadeira com garfo e mini carregadeira com vassoura. Equipamentos Hyundai e Lonking com manutenção em campo.',
    h1: 'Locação de Pás Carregadeiras e Mini Carregadeiras',
    intro:
      'Pás carregadeiras de 11,5 t a 18,9 t e mini carregadeiras versáteis para carregamento de agregados, bota-fora, movimentação de tubos e varrição mecanizada de pátios.',
  },
  {
    slug: 'retroescavadeiras',
    nome: 'Retroescavadeiras',
    shortTitle: 'Retroescavadeiras 4x4',
    seoTitle: 'Locação de Retroescavadeira 4x4 com Concha e Rompedor | CCG Locações',
    seoDescription:
      'Aluguel de retroescavadeira Case 580N, 580M e JCB 3C Plus 4x4 com concha ou rompedor hidráulico para saneamento, drenagem e infraestrutura em São Luís/MA e todo o Brasil.',
    h1: 'Locação de Retroescavadeiras 4x4',
    intro:
      'Retroescavadeiras tração 4x4 equipadas com concha ou rompedor hidráulico para abertura de valas, drenagem pluvial, saneamento e apoio versátil em canteiros urbanos e industriais.',
  },
  {
    slug: 'tratores-e-nivelamento',
    nome: 'Tratores e Nivelamento',
    shortTitle: 'Motoniveladoras e Tratores',
    seoTitle: 'Locação de Motoniveladora (Patrol) e Trator de Esteira | CCG Locações',
    seoDescription:
      'Locação de motoniveladora Volvo G930, trator de esteira (12,9 a 24 t) e trator agrícola para terraplenagem pesada, abertura de acessos e acabamento de subleito.',
    h1: 'Locação de Motoniveladoras e Tratores de Esteira',
    intro:
      'Equipamentos de alta precisão e força de empuxo para corte de taludes, supressão vegetal, espalhamento de aterros e nivelamento de base e sub-base rodoviária.',
  },
  {
    slug: 'compactacao',
    nome: 'Compactação',
    shortTitle: 'Rolos Compactadores',
    seoTitle: 'Locação de Rolo Compactador (Liso, Pé de Carneiro, Pneus e Tandem) | CCG',
    seoDescription:
      'Aluguel de rolo compactador vibratório pé de carneiro, liso, chapa tandem, pneus 21t e mini rolo para terraplenagem, aterros e pavimentação asfáltica.',
    h1: 'Locação de Rolos Compactadores',
    intro:
      'Linha completa de compactação de solos e asfalto: rolos pé de carneiro, liso, tandem de chapa, pneumático de 21 t e mini rolo com controle remoto para áreas confinadas.',
  },
  {
    slug: 'pavimentacao',
    nome: 'Pavimentação',
    shortTitle: 'Pavimentação e Asfalto',
    seoTitle: 'Locação de Equipamentos para Pavimentação e Usina de Asfalto Móvel | CCG',
    seoDescription:
      'Locação de vibroacabadora de asfalto (450 t/h), fresadora de pavimento, usina de asfalto móvel e caminhão espargidor para rodovias e pátios industriais.',
    h1: 'Equipamentos para Pavimentação Asfáltica',
    intro:
      'Conjunto completo para aplicação e restauração de pavimento em CBUQ: usina de asfalto móvel no canteiro, caminhão espargidor, vibroacabadora de 450 t/h e fresadora.',
  },
  {
    slug: 'caminhoes-e-logistica',
    nome: 'Caminhões e Logística',
    shortTitle: 'Caminhões Pesados',
    seoTitle: 'Locação de Caminhões (Basculante, Munck, Pipa, Comboio e Prancha) | CCG',
    seoDescription:
      'Locação de caminhão basculante 12/14m³, pipa 18/20m³, munck até 19,5t, comboio de lubrificação, betoneira, plataforma e carreta prancha até 45t no Maranhão e Brasil.',
    h1: 'Locação de Caminhões Pesados e Logística de Obra',
    intro:
      'Frota própria de caminhões basculantes, pipas, muncks, comboios de abastecimento, betoneiras, plataformas e carretas prancha (até 45 t) para manter sua frente de serviço autossuficiente.',
  },
  {
    slug: 'veiculos-de-apoio',
    nome: 'Veículos de Apoio',
    shortTitle: 'Veículos de Apoio',
    seoTitle: 'Locação de Caminhonete Hilux 4x4, Strada, Van e Micro-ônibus de Obra | CCG',
    seoDescription:
      'Locação de veículos de apoio operacional para contratos e obras: Toyota Hilux 4x4 Diesel, Fiat Strada, van de 16 lugares e micro-ônibus de 31 lugares.',
    h1: 'Veículos de Apoio e Transporte de Equipes',
    intro:
      'Picapes 4x4, utilitários leves, vans e micro-ônibus dedicados à mobilidade de engenharia, topografia, segurança do trabalho e transporte de equipes em contratos.',
  },
];

export function getCategoryBySlug(slug: string): CategorySeoMeta | undefined {
  return EQUIPMENT_CATEGORIES.find((c) => c.slug === slug);
}

export function getCategoryByName(nome: string): CategorySeoMeta | undefined {
  return EQUIPMENT_CATEGORIES.find((c) => c.nome === nome);
}

export function buildBreadcrumbSchema(
  items: { label: string; href?: string }[],
  currentPath: string
): Record<string, unknown> {
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Início',
      item: `${SITE.domain}/`,
    },
    ...items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 2,
      name: item.label,
      item: new URL(item.href ?? currentPath, SITE.domain).toString(),
    })),
  ];

  return {
    '@type': 'BreadcrumbList',
    itemListElement,
  };
}

export function buildFaqSchema(
  items: { pergunta: string; resposta: string }[]
): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((faq) => ({
      '@type': 'Question',
      name: faq.pergunta,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.resposta,
      },
    })),
  };
}

export function buildServiceCatalogSchema(params: {
  name: string;
  description: string;
  url: string;
  serviceTypes: string[];
}): Record<string, unknown> {
  return {
    '@type': 'Service',
    name: params.name,
    description: params.description,
    url: params.url,
    serviceType: params.serviceTypes,
    provider: { '@id': `${SITE.domain}/#localbusiness` },
    areaServed: ['Maranhão', 'Pará', 'Rio Grande do Norte', 'Amapá', 'Ceará', 'Minas Gerais', 'Brasil'],
  };
}
