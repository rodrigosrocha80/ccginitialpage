import type { APIRoute } from 'astro';
import path from 'node:path';
import { requireAdmin } from '@/lib/adminAuth';
import { getCandidaturaById } from '@/lib/careersDb';
import { readResumeForDownload } from '@/lib/resumeStorage';
import { isValidUuid, sanitizeHeaderValue } from '@/lib/security';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const forceDownload = url.searchParams.get('download') === '1';

  if (!isValidUuid(id)) {
    return new Response('ID da candidatura inválido.', {
      status: 400,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const candidatura = await getCandidaturaById(id!);
  if (!candidatura) {
    return new Response('Candidatura não encontrada.', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const file = await readResumeForDownload({
      storage: candidatura.curriculoStorage,
      url: candidatura.curriculoUrl,
      pathname: candidatura.curriculoPathname,
      contentType: candidatura.curriculoTipo,
    });

    if (!file) {
      return new Response('Arquivo de currículo não encontrado.', {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const baseName = path.basename(candidatura.curriculoNome);
    const safeFileName =
      sanitizeHeaderValue(baseName, 160).replace(/["\\/;]/g, '_') || 'curriculo.pdf';
    const isPdf = file.contentType === 'application/pdf';
    const disposition =
      !forceDownload && isPdf
        ? `inline; filename="${safeFileName}"`
        : `attachment; filename="${safeFileName}"`;

    return new Response(file.body as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': disposition,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (err) {
    console.error('[admin/curriculo GET]', err);
    return new Response('Erro ao baixar currículo.', {
      status: 500,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
};
