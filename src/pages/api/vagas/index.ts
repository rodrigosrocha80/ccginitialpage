import type { APIRoute } from 'astro';
import { listPublicVagas } from '@/lib/careersDb';
import { checkRateLimit, getClientIp, jsonResponse, rateLimitHeaders } from '@/lib/security';

export const prerender = false;

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const ip = getClientIp(request, clientAddress);
  const limit = await checkRateLimit({
    namespace: 'public_vagas',
    key: ip,
    maxRequests: 60,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return jsonResponse(
      { ok: false, message: 'Muitas requisições em sequência. Aguarde um instante.', vagas: [] },
      429,
      rateLimitHeaders(limit.retryAfterSeconds)
    );
  }

  try {
    const vagas = await listPublicVagas();

    return new Response(
      JSON.stringify({
        ok: true,
        vagas,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    console.error('[api/vagas] Erro ao listar vagas:', err);
    return jsonResponse(
      {
        ok: false,
        message: 'Não foi possível carregar as vagas no momento.',
        vagas: [],
      },
      500
    );
  }
};
