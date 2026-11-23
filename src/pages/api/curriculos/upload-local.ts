import type { APIRoute } from 'astro';
import { isProdEnvironment } from '@/lib/adminAuth';
import { isVercelBlobConfigured, saveLocalResume } from '@/lib/resumeStorage';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (isProdEnvironment() || isVercelBlobConfigured()) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Upload local indisponível neste ambiente. Utilize o upload via Vercel Blob.',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Nenhum arquivo de currículo foi enviado.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const saved = await saveLocalResume(file);
    return new Response(JSON.stringify({ ok: true, ...saved }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar currículo localmente.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
