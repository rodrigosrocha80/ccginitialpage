import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { vagaInputSchema } from '@/lib/careersSchema';
import { deleteVaga, updateVaga } from '@/lib/careersDb';

export const prerender = false;

export const PUT: APIRoute = async ({ request, params }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ ok: false, message: 'ID da vaga ausente.' }), {
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

  const parsed = vagaInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'geral');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Revise os campos da vaga.',
        fieldErrors,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const vaga = await updateVaga(id, parsed.data);
    if (!vaga) {
      return new Response(JSON.stringify({ ok: false, message: 'Vaga não encontrada.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, vaga }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/vagas PUT]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao atualizar vaga.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PATCH = PUT;

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ ok: false, message: 'ID da vaga ausente.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const deleted = await deleteVaga(id);
    if (!deleted) {
      return new Response(JSON.stringify({ ok: false, message: 'Vaga não encontrada.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/vagas DELETE]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao excluir vaga.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
