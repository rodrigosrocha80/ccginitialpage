import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { candidaturaUpdateSchema } from '@/lib/careersSchema';
import { deleteCandidatura, updateCandidatura } from '@/lib/careersDb';
import { deleteStoredResume } from '@/lib/resumeStorage';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ ok: false, message: 'ID da candidatura ausente.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'JSON inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = candidaturaUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, message: 'Dados de atualização inválidos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const candidatura = await updateCandidatura(id, parsed.data);
    if (!candidatura) {
      return new Response(JSON.stringify({ ok: false, message: 'Candidatura não encontrada.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, candidatura }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/candidaturas PATCH]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao atualizar candidatura.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ ok: false, message: 'ID da candidatura ausente.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const removed = await deleteCandidatura(id);
    if (!removed) {
      return new Response(JSON.stringify({ ok: false, message: 'Candidatura não encontrada.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await deleteStoredResume({
      storage: removed.curriculoStorage,
      url: removed.curriculoUrl,
      pathname: removed.curriculoPathname,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/candidaturas DELETE]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao excluir candidatura.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
