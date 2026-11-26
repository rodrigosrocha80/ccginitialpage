import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { listCandidaturas } from '@/lib/careersDb';
import { jsonResponse } from '@/lib/security';

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
    return jsonResponse({ ok: true, candidaturas }, 200, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    console.error('[admin/candidaturas GET]', err);
    return jsonResponse(
      { ok: false, message: 'Erro ao carregar candidaturas.' },
      500,
      { 'Cache-Control': 'private, no-store' }
    );
  }
};
