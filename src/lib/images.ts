import type { ImageMetadata } from 'astro';

const allAssets = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{png,jpg,jpeg,webp,avif}',
  { eager: true }
);

export function getAssetImage(relativePath: string): ImageMetadata {
  const normalized = relativePath.startsWith('/src/assets/')
    ? relativePath
    : `/src/assets/${relativePath.replace(/^\/+/, '')}`;
  const mod = allAssets[normalized];
  if (!mod) {
    throw new Error(`Imagem não encontrada em src/assets: ${normalized}`);
  }
  return mod.default;
}
