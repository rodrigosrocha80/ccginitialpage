import type { APIRoute } from 'astro';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { ALLOWED_RESUME_MIME_TYPES, MAX_RESUME_BYTES } from '@/lib/careersSchema';
import { isVercelBlobConfigured } from '@/lib/resumeStorage';

export const prerender = false;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 15;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!isVercelBlobConfigured()) {
    return new Response(
      JSON.stringify({
        error: 'Vercel Blob não configurado (BLOB_READ_WRITE_TOKEN ausente).',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    clientAddress ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: 'Muitos envios em sequência. Aguarde um minuto e tente novamente.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Requisição de upload inválida.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('curriculos/')) {
          throw new Error('Caminho de upload inválido.');
        }

        return {
          allowedContentTypes: [...ALLOWED_RESUME_MIME_TYPES],
          maximumSizeInBytes: MAX_RESUME_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.info('[curriculos/upload] Currículo armazenado no Vercel Blob:', blob.pathname);
      },
    });

    return new Response(JSON.stringify(jsonResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao autorizar upload do currículo.';
    console.error('[curriculos/upload] Erro:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
