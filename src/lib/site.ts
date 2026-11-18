export const SITE = {
  brandShort: 'CCG Locações',
  legalName: 'CCG Construções e Terraplenagem LTDA',
  cnpj: '05.638.550/0001-54',
  foundedYear: 2003,
  yearsInMarket: '20+',
  domain: 'https://ccglocacao.com.br',
  institutionalSite: 'https://ccgconstrucoes.com',
  emailContratos: 'contratos@ccglocacao.com.br',
  emailCurriculos: 'curriculos@ccglocacao.com.br',
  phoneLandline: '(98) 3313-9550',
  phoneLandlineHref: 'tel:+559833139550',
  whatsappPrimary: {
    display: '(98) 99988-0545',
    e164: '5598999880545',
  },
  whatsappSecondary: {
    display: '(98) 99988-0523',
    e164: '5598999880523',
  },
  phoneExtra: '(98) 99988-0520',
  address: {
    street: 'Av. Engenheiro Emiliano Macieira, nº 650',
    district: 'Pedrinhas',
    city: 'São Luís',
    state: 'MA',
    country: 'BR',
    full: 'Av. Engenheiro Emiliano Macieira, nº 650, Pedrinhas, São Luís - MA',
    mapsQueryUrl:
      'https://www.google.com/maps/search/?api=1&query=CCG+Constru%C3%A7%C3%B5es,+Av.+Engenheiro+Emiliano+Macieira,+650,+Pedrinhas,+S%C3%A3o+Lu%C3%ADs+-+MA',
    mapsEmbedUrl:
      'https://maps.google.com/maps?f=q&source=s_q&hl=pt-BR&q=ccg+constru%C3%A7%C3%B5es,+Engenheiro+Emiliano+Macieira,+650,+Pedrinhas,+S%C3%A3o+Lu%C3%ADs,+Maranh%C3%A3o&ie=UTF8&t=m&z=16&iwloc=A&output=embed',
  },
  social: {
    instagram: 'https://www.instagram.com/ccgconstrucoes_oficial/',
    facebook: 'https://www.facebook.com/profile.php?id=61577607395877',
    youtube: 'https://www.youtube.com/@ccgconstrucoes383',
  },
  metrics: [
    {
      value: '+600',
      label: 'Equipamentos no grupo CCG',
      detail: 'Mais de 200 máquinas pesadas dedicadas à unidade de locação e contratos contínuos',
    },
    {
      value: '> 95%',
      label: 'Disponibilidade operacional',
      detail: 'Comprovada em contratos industriais críticos como Alumar Lagoas Babilônia e ARB',
    },
    {
      value: '< 5 anos',
      label: 'Idade média da frota',
      detail: 'Manutenção preditiva, preventiva e corretiva periódica em oficina e campo',
    },
    {
      value: '2003',
      label: 'Fundada em São Luís/MA',
      detail: 'Mais de duas décadas atendendo infraestrutura, portos, ferrovias, energia e mineração',
    },
  ],
  statesCovered: ['MA', 'PA', 'RN', 'AP', 'CE', 'MG'],
} as const;

export function buildWhatsAppUrl(message?: string): string {
  const defaultMsg =
    'Olá! Vim pelo site da CCG Locações e gostaria de solicitar um orçamento de equipamentos/terraplenagem.';
  const text = encodeURIComponent(message || defaultMsg);
  return `https://wa.me/${SITE.whatsappPrimary.e164}?text=${text}`;
}
