import type { APIRoute } from 'astro';
import { clearSessionCookieHeader } from '@/lib/adminAuth';
import { jsonResponse, verifySameOrigin } from '@/lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!verifySameOrigin(request, { requireOrigin: true })) {
    return jsonResponse(
      { ok: false, message: 'Origem da requisição não autorizada.' },
      403,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  return jsonResponse(
    { ok: true },
    200,
    {
      'Cache-Control': 'private, no-store',
      'Set-Cookie': clearSessionCookieHeader(request),
    }
  );
};
