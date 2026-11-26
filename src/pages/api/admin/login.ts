import type { APIRoute } from 'astro';
import {
  createSessionCookieHeader,
  verifyAdminCredentials,
} from '@/lib/adminAuth';
import {
  checkRateLimit,
  getClientIp,
  isTurnstileConfigured,
  jsonResponse,
  rateLimitHeaders,
  readJsonBody,
  verifySameOrigin,
  verifyTurnstileToken,
} from '@/lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!verifySameOrigin(request, { requireOrigin: true })) {
    return jsonResponse(
      { ok: false, message: 'Origem da requisição não autorizada.' },
      403,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const ip = getClientIp(request, clientAddress);
  const limit = await checkRateLimit({
    namespace: 'admin_login',
    key: ip,
    maxRequests: 5,
    windowMs: 5 * 60_000,
  });

  if (!limit.allowed) {
    return jsonResponse(
      { ok: false, message: 'Muitas tentativas de login. Aguarde alguns minutos.' },
      429,
      rateLimitHeaders(limit.retryAfterSeconds)
    );
  }

  const bodyResult = await readJsonBody<{
    user?: string;
    password?: string;
    turnstileToken?: string;
  }>(request, 4_096);
  if (!bodyResult.ok) {
    return jsonResponse(
      { ok: false, message: 'Dados de login inválidos.' },
      bodyResult.status,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const body = bodyResult.data;

  if (isTurnstileConfigured()) {
    const check = await verifyTurnstileToken(body.turnstileToken, ip);
    if (!check.ok) {
      return jsonResponse(
        { ok: false, message: 'Falha na verificação de segurança. Tente novamente.' },
        400,
        { 'Cache-Control': 'private, no-store' }
      );
    }
  }

  const user = String(body.user || '').trim();
  const password = String(body.password || '');
  const result = verifyAdminCredentials(user, password);

  if (!result.ok) {
    return jsonResponse(
      { ok: false, message: result.reason || 'Credenciais inválidas.' },
      401,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const cookie = createSessionCookieHeader(user, request);
  return jsonResponse(
    { ok: true, user },
    200,
    {
      'Cache-Control': 'private, no-store',
      'Set-Cookie': cookie,
    }
  );
};
