import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { vagaInputSchema } from '@/lib/careersSchema';
import { deleteVaga, updateVaga } from '@/lib/careersDb';
import { isValidUuid, jsonResponse, readJsonBody, verifySameOrigin } from '@/lib/security';

export const prerender = false;

export const PUT: APIRoute = async ({ request, params }) => {
  if (!verifySameOrigin(request, { requireOrigin: true })) {
    return jsonResponse(
      { ok: false, message: 'Origem da requisição não autorizada.' },
      403,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const id = params.id;
  if (!isValidUuid(id)) {
    return jsonResponse(
      { ok: false, message: 'ID da vaga inválido.' },
      400,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const bodyResult = await readJsonBody(request, 65_536);
  if (!bodyResult.ok) {
    return jsonResponse(
      { ok: false, message: bodyResult.message },
      bodyResult.status,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const parsed = vagaInputSchema.partial().safeParse(bodyResult.data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'geral');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return jsonResponse(
      {
        ok: false,
        message: 'Revise os campos da vaga.',
        fieldErrors,
      },
      400,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  try {
    const vaga = await updateVaga(id!, parsed.data);
    if (!vaga) {
      return jsonResponse(
        { ok: false, message: 'Vaga não encontrada.' },
        404,
        { 'Cache-Control': 'private, no-store' }
      );
    }
    return jsonResponse({ ok: true, vaga }, 200, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    console.error('[admin/vagas PUT]', err);
    return jsonResponse(
      { ok: false, message: 'Erro ao atualizar vaga.' },
      500,
      { 'Cache-Control': 'private, no-store' }
    );
  }
};

export const PATCH = PUT;

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!verifySameOrigin(request, { requireOrigin: true })) {
    return jsonResponse(
      { ok: false, message: 'Origem da requisição não autorizada.' },
      403,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const id = params.id;
  if (!isValidUuid(id)) {
    return jsonResponse(
      { ok: false, message: 'ID da vaga inválido.' },
      400,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  try {
    const deleted = await deleteVaga(id!);
    if (!deleted) {
      return jsonResponse(
        { ok: false, message: 'Vaga não encontrada.' },
        404,
        { 'Cache-Control': 'private, no-store' }
      );
    }
    return jsonResponse({ ok: true }, 200, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    console.error('[admin/vagas DELETE]', err);
    return jsonResponse(
      { ok: false, message: 'Erro ao excluir vaga.' },
      500,
      { 'Cache-Control': 'private, no-store' }
    );
  }
};
