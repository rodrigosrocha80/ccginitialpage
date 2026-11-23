import { SITE } from './site';

export interface SharePayload {
  path: string;
  title: string;
  text: string;
}

export interface ShareLinks {
  url: string;
  whatsapp: string;
  linkedin: string;
  email: string;
}

export function resolveShareUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : SITE.domain;
  return new URL(pathOrUrl, base).toString();
}

export function buildShareLinks({ path, title, text }: SharePayload): ShareLinks {
  const url = resolveShareUrl(path);
  const whatsappText = `${text}\n${url}`;
  const emailBody = `${text}\n\n${url}`;

  return {
    url,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(whatsappText)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(emailBody)}`,
  };
}

export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall back to execCommand below
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function buildEquipmentShareData(item: {
  id: string;
  nome: string;
  categoria?: string;
}): SharePayload {
  const categoriaSuffix = item.categoria ? ` (${item.categoria})` : '';
  return {
    path: `/equipamentos/${item.id}`,
    title: `Locação de ${item.nome} | ${SITE.brandShort}`,
    text: `Confira ${item.nome}${categoriaSuffix} disponível para locação na ${SITE.brandShort}:`,
  };
}

export function buildVagaShareData(vaga: {
  slug: string;
  titulo: string;
  localidade: string;
  tipoContrato: string;
  modalidade: string;
}): SharePayload {
  return {
    path: `/trabalhe-conosco?vaga=${encodeURIComponent(vaga.slug)}`,
    title: `Vaga: ${vaga.titulo} — ${vaga.localidade} | ${SITE.brandShort}`,
    text: `Vaga aberta na ${SITE.brandShort}: ${vaga.titulo} (${vaga.localidade} • ${vaga.tipoContrato} • ${vaga.modalidade}). Confira os detalhes e candidate-se:`,
  };
}
