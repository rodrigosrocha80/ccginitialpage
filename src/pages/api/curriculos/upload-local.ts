import type { APIRoute } from 'astro';
import { isProdEnvironment } from '@/lib/adminAuth';
import { isVercelBlobConfigured, saveLocalResume } from '@/lib/resumeStorage';
import {
  checkRateLimit,
  createUploadTicketCookie,
  getClientIp,
  isTurnstileConfigured,
  jsonResponse,
  rateLimitHeaders,
  verifySameOrigin,
  verifyTurnstileToken,
} from '@/lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (isProdEnvironment() || isVercelBlobConfigured()) {
    return jsonResponse(
      {
        ok: false,
        message: 'Upload local indisponível neste ambiente.',
      },
      403
    );
  }

  if (!verifySameOrigin(request)) {
    return jsonResponse({ ok: false, message: 'Origem da requisição não autorizada.' }, 403);
  }

  const ip = getClientIp(request, clientAddress);
  const limit = await checkRateLimit({
    namespace: 'curriculos_upload_local',
    key: ip,
    maxRequests: 10,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return jsonResponse(
      { ok: false, message: 'Muitos envios em sequência. Aguarde um minuto e tente novamente.' },
      429,
      rateLimitHeaders(limit.retryAfterSeconds)
    );
  }

  try {
    const formData = await request.formData();

    let turnstileVerified = false;
    if (isTurnstileConfigured()) {
      const token = formData.get('turnstileToken')?.toString();
      const check = await verifyTurnstileToken(token, ip);
      if (!check.ok) {
        return jsonResponse(
          { ok: false, message: 'Falha na verificação anti-spam. Tente novamente.' },
          400
        );
      }
      turnstileVerified = true;
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonResponse(
        { ok: false, message: 'Nenhum arquivo de currículo foi enviado.' },
        400
      );
    }

    const saved = await saveLocalResume(file);
    return jsonResponse(
      { ok: true, ...saved },
      200,
      {
        'Set-Cookie': createUploadTicketCookie({
          pathname: saved.pathname,
          turnstileVerified,
          request,
        }),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar currículo localmente.';
    return jsonResponse({ ok: false, message }, 400);
  }
};
