import type { APIRoute } from 'astro';
import { listPublicVagas } from '@/lib/careersDb';
import { getBlobAccessMode, isVercelBlobConfigured } from '@/lib/resumeStorage';
import { isProdEnvironment } from '@/lib/adminAuth';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const vagas = await listPublicVagas();
    const uploadMode = isVercelBlobConfigured()
      ? 'vercel_blob'
      : isProdEnvironment()
        ? 'unconfigured'
        : 'local';

    return new Response(
      JSON.stringify({
        ok: true,
        vagas,
        uploadMode,
        blobAccess: getBlobAccessMode(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err) {
    console.error('[api/vagas] Erro ao listar vagas:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Não foi possível carregar as vagas no momento.',
        vagas: [],
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
