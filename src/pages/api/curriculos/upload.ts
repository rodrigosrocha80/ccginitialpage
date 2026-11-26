import type { APIRoute } from 'astro';
import { issueSignedToken } from '@vercel/blob';
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from '@vercel/blob/client';
import { ALLOWED_RESUME_MIME_TYPES, MAX_RESUME_BYTES } from '@/lib/careersSchema';
import { getVercelBlobUploadProtocol, isVercelBlobConfigured } from '@/lib/resumeStorage';
import {
  checkRateLimit,
  createUploadTicketCookie,
  getClientIp,
  getEnv,
  isSafeResumePathname,
  isTurnstileConfigured,
  jsonResponse,
  rateLimitHeaders,
  readJsonBody,
  verifySameOrigin,
  verifyTurnstileToken,
} from '@/lib/security';

export const prerender = false;

type UploadRouteBody = HandleUploadBody | HandleUploadPresignedBody;

const SAFE_UPLOAD_ERRORS = new Set([
  'Caminho de upload inválido.',
  'Falha na verificação anti-spam. Atualize o desafio e tente novamente.',
]);

async function validateAndAuthorizeUpload(
  pathname: string,
  clientPayload: string | null,
  ip: string
): Promise<{ turnstileVerified: boolean }> {
  if (!isSafeResumePathname(pathname)) {
    throw new Error('Caminho de upload inválido.');
  }

  let turnstileVerified = false;
  if (isTurnstileConfigured()) {
    let token: string | undefined;
    if (clientPayload) {
      try {
        const parsed = JSON.parse(clientPayload) as { turnstileToken?: string };
        token = typeof parsed.turnstileToken === 'string' ? parsed.turnstileToken : undefined;
      } catch {
        token = undefined;
      }
    }
    const check = await verifyTurnstileToken(token, ip);
    if (!check.ok) {
      throw new Error('Falha na verificação anti-spam. Atualize o desafio e tente novamente.');
    }
    turnstileVerified = true;
  }

  return { turnstileVerified };
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!isVercelBlobConfigured()) {
    return jsonResponse(
      { error: 'Upload de currículos temporariamente indisponível.' },
      503
    );
  }

  const bodyResult = await readJsonBody<UploadRouteBody>(request, 16_384);
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.message }, bodyResult.status);
  }

  const body = bodyResult.data;
  const isBrowserUploadInit =
    body?.type === 'blob.generate-client-token' ||
    body?.type === 'blob.generate-presigned-url';
  const ip = getClientIp(request, clientAddress);

  if (isBrowserUploadInit) {
    if (!verifySameOrigin(request)) {
      return jsonResponse({ error: 'Origem da requisição não autorizada.' }, 403);
    }

    const limit = await checkRateLimit({
      namespace: 'curriculos_upload',
      key: ip,
      maxRequests: 8,
      windowMs: 60_000,
    });

    if (!limit.allowed) {
      return jsonResponse(
        { error: 'Muitos envios em sequência. Aguarde um minuto e tente novamente.' },
        429,
        rateLimitHeaders(limit.retryAfterSeconds)
      );
    }
  }

  let requestedPathname = '';
  let turnstileVerified = false;

  const usePresigned =
    body?.type === 'blob.generate-presigned-url' ||
    (body?.type === 'blob.upload-completed' && getVercelBlobUploadProtocol() === 'presigned');

  try {
    const jsonResult = usePresigned
      ? await handleUploadPresigned({
          body: body as HandleUploadPresignedBody,
          request,
          webhookPublicKey: getEnv('BLOB_WEBHOOK_PUBLIC_KEY')?.trim() || undefined,
          getSignedToken: async (pathname, clientPayload) => {
            const auth = await validateAndAuthorizeUpload(pathname, clientPayload, ip);
            requestedPathname = pathname;
            turnstileVerified = auth.turnstileVerified;

            const validUntil = Date.now() + 5 * 60 * 1000;
            const storeId = getEnv('BLOB_STORE_ID')?.trim();
            const token = await issueSignedToken({
              pathname,
              operations: ['put'],
              allowedContentTypes: [...ALLOWED_RESUME_MIME_TYPES],
              maximumSizeInBytes: MAX_RESUME_BYTES,
              validUntil,
              ...(storeId ? { storeId } : {}),
            });

            return {
              token,
              urlOptions: {
                validUntil,
                allowedContentTypes: [...ALLOWED_RESUME_MIME_TYPES],
                maximumSizeInBytes: MAX_RESUME_BYTES,
                addRandomSuffix: true,
                allowOverwrite: false,
              },
            };
          },
          onUploadCompleted: async ({ blob }) => {
            console.info('[curriculos/upload] Currículo armazenado:', blob.pathname);
          },
        })
      : await handleUpload({
          body: body as HandleUploadBody,
          request,
          onBeforeGenerateToken: async (pathname, clientPayload) => {
            const auth = await validateAndAuthorizeUpload(pathname, clientPayload, ip);
            requestedPathname = pathname;
            turnstileVerified = auth.turnstileVerified;

            return {
              allowedContentTypes: [...ALLOWED_RESUME_MIME_TYPES],
              maximumSizeInBytes: MAX_RESUME_BYTES,
              addRandomSuffix: true,
              allowOverwrite: false,
              validUntil: Date.now() + 5 * 60 * 1000,
            };
          },
          onUploadCompleted: async ({ blob }) => {
            console.info('[curriculos/upload] Currículo armazenado:', blob.pathname);
          },
        });

    const extraHeaders: Record<string, string> = {};
    if (isBrowserUploadInit && requestedPathname) {
      extraHeaders['Set-Cookie'] = createUploadTicketCookie({
        pathname: requestedPathname,
        turnstileVerified,
        request,
      });
    }

    return jsonResponse(jsonResult, 200, extraHeaders);
  } catch (err) {
    console.error('[curriculos/upload] Erro:', err);
    const rawMsg = err instanceof Error ? err.message : '';
    const safeMsg = SAFE_UPLOAD_ERRORS.has(rawMsg)
      ? rawMsg
      : 'Não foi possível autorizar o envio do currículo.';
    return jsonResponse({ error: safeMsg }, 400);
  }
};
