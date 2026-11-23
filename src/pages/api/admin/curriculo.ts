import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { getCandidaturaById } from '@/lib/careersDb';
import { readResumeForDownload } from '@/lib/resumeStorage';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const forceDownload = url.searchParams.get('download') === '1';

  if (!id) {
    return new Response('ID da candidatura ausente.', { status: 400 });
  }

  const candidatura = await getCandidaturaById(id);
  if (!candidatura) {
    return new Response('Candidatura não encontrada.', { status: 404 });
  }

  try {
    const file = await readResumeForDownload({
      storage: candidatura.curriculoStorage,
      url: candidatura.curriculoUrl,
      pathname: candidatura.curriculoPathname,
      contentType: candidatura.curriculoTipo,
    });

    if (!file) {
      return new Response('Arquivo de currículo não encontrado no storage.', { status: 404 });
    }

    const safeFileName = candidatura.curriculoNome.replace(/["\r\n]/g, '');
    const isPdf =
      file.contentType.includes('pdf') || safeFileName.toLowerCase().endsWith('.pdf');
    const disposition =
      !forceDownload && isPdf
        ? `inline; filename="${safeFileName}"`
        : `attachment; filename="${safeFileName}"`;

    return new Response(file.body as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[admin/curriculo GET]', err);
    return new Response('Erro ao baixar currículo.', { status: 500 });
  }
};
