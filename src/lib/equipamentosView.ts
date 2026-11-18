import { getImage } from 'astro:assets';
import { getCollection } from 'astro:content';
import { getAssetImage } from './images';

export interface EquipamentoView {
  id: string;
  nome: string;
  categoria: string;
  resumo: string;
  especificacoes: { label: string; valor: string }[];
  modelosDetalhados?: { modelo: string; detalhes: string[] }[];
  destaque: boolean;
  ordem: number;
  imageSrc: string;
  imageSrcSet: string;
  imageWidth: number;
  imageHeight: number;
}

export async function loadEquipamentosView(options?: { compact?: boolean }): Promise<EquipamentoView[]> {
  const compact = options?.compact ?? false;
  const entries = (await getCollection('equipamentos')).sort(
    (a, b) => a.data.ordem - b.data.ordem
  );

  return Promise.all(
    entries.map(async (entry) => {
      const meta = getAssetImage(entry.data.imagem);
      const optimized = await getImage({
        src: meta,
        widths: compact ? [360] : [320, 560],
        formats: ['webp'],
        quality: 80,
      });

      return {
        id: entry.data.id,
        nome: entry.data.nome,
        categoria: entry.data.categoria,
        resumo: entry.data.resumo,
        especificacoes: entry.data.especificacoes,
        modelosDetalhados: compact ? undefined : entry.data.modelosDetalhados,
        destaque: entry.data.destaque,
        ordem: entry.data.ordem,
        imageSrc: optimized.src,
        imageSrcSet: compact ? '' : (optimized.srcSet.attribute ?? ''),
        imageWidth: Number(optimized.attributes.width ?? 360),
        imageHeight: Number(optimized.attributes.height ?? 360),
      };
    })
  );
}
