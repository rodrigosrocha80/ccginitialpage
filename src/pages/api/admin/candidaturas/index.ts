import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { listCandidaturas } from '@/lib/careersDb';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const vagaId = url.searchParams.get('vagaId') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;

  try {
    const candidaturas = await listCandidaturas({ vagaId, status, search });
    return new Response(JSON.stringify({ ok: true, candidaturas }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[admin/candidaturas GET]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao carregar candidaturas.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
