import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/adminAuth';
import { vagaInputSchema } from '@/lib/careersSchema';
import { createVaga, listAllVagasWithCounts } from '@/lib/careersDb';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const vagas = await listAllVagasWithCounts();
    return new Response(JSON.stringify({ ok: true, vagas }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[admin/vagas GET]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao listar vagas.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const auth = requireAdmin(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, message: 'JSON inválido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const parsed = vagaInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'geral');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Revise os campos obrigatórios da vaga.',
        fieldErrors,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const vaga = await createVaga(parsed.data);
    return new Response(JSON.stringify({ ok: true, vaga }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/vagas POST]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : 'Erro ao cadastrar vaga.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
