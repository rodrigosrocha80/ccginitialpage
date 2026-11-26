import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { vagaInputSchema } from '@/lib/careersSchema';
import { createVaga, listAllVagasWithCounts } from '@/lib/careersDb';
import { jsonResponse, readJsonBody, verifySameOrigin } from '@/lib/security';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const vagas = await listAllVagasWithCounts();
    return jsonResponse({ ok: true, vagas }, 200, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    console.error('[admin/vagas GET]', err);
    return jsonResponse(
      { ok: false, message: 'Erro ao listar vagas.' },
      500,
      { 'Cache-Control': 'private, no-store' }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!verifySameOrigin(request, { requireOrigin: true })) {
    return jsonResponse(
      { ok: false, message: 'Origem da requisição não autorizada.' },
      403,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const bodyResult = await readJsonBody(request, 65_536);
  if (!bodyResult.ok) {
    return jsonResponse(
      { ok: false, message: bodyResult.message },
      bodyResult.status,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const parsed = vagaInputSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'geral');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return jsonResponse(
      {
        ok: false,
        message: 'Revise os campos obrigatórios da vaga.',
        fieldErrors,
      },
      400,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  try {
    const vaga = await createVaga(parsed.data);
    return jsonResponse({ ok: true, vaga }, 201, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    console.error('[admin/vagas POST]', err);
    return jsonResponse(
      { ok: false, message: 'Erro ao cadastrar vaga.' },
      500,
      { 'Cache-Control': 'private, no-store' }
    );
  }
};
