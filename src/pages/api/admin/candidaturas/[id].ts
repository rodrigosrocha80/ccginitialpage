import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { candidaturaUpdateSchema } from '@/lib/careersSchema';
import { deleteCandidatura, updateCandidatura } from '@/lib/careersDb';
import { deleteStoredResume } from '@/lib/resumeStorage';
import { isValidUuid, jsonResponse, readJsonBody, verifySameOrigin } from '@/lib/security';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
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
      { ok: false, message: 'ID da candidatura inválido.' },
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

  const parsed = candidaturaUpdateSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, message: 'Dados de atualização inválidos.' },
      400,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  try {
    const candidatura = await updateCandidatura(id!, parsed.data);
    if (!candidatura) {
      return jsonResponse(
        { ok: false, message: 'Candidatura não encontrada.' },
        404,
        { 'Cache-Control': 'private, no-store' }
      );
    }
    return jsonResponse({ ok: true, candidatura }, 200, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    console.error('[admin/candidaturas PATCH]', err);
    return jsonResponse(
      { ok: false, message: 'Erro ao atualizar candidatura.' },
      500,
      { 'Cache-Control': 'private, no-store' }
    );
  }
};

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
      { ok: false, message: 'ID da candidatura inválido.' },
      400,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  try {
    const removed = await deleteCandidatura(id!);
    if (!removed) {
      return jsonResponse(
        { ok: false, message: 'Candidatura não encontrada.' },
        404,
        { 'Cache-Control': 'private, no-store' }
      );
    }

    await deleteStoredResume({
      storage: removed.curriculoStorage,
      url: removed.curriculoUrl,
      pathname: removed.curriculoPathname,
    });

    return jsonResponse({ ok: true }, 200, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    console.error('[admin/candidaturas DELETE]', err);
    return jsonResponse(
      { ok: false, message: 'Erro ao excluir candidatura.' },
      500,
      { 'Cache-Control': 'private, no-store' }
    );
  }
};
