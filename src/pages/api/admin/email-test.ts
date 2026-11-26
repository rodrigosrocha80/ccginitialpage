import type { APIRoute } from 'astro';
import { getAdminSession } from '@/lib/adminAuth';
import {
  escapeHtml,
  getMailerSummary,
  isMailerConfigured,
  sendMail,
  verifyMailerConnection,
} from '@/lib/mailer';
import {
  checkRateLimit,
  getClientIp,
  jsonResponse,
  rateLimitHeaders,
  readJsonBody,
  sanitizeHeaderValue,
  verifySameOrigin,
} from '@/lib/security';

export const prerender = false;

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!verifySameOrigin(request, { requireOrigin: true })) {
    return jsonResponse(
      { ok: false, message: 'Origem da requisição não autorizada.' },
      403,
      NO_STORE_HEADERS
    );
  }

  const session = getAdminSession(request);
  if (!session) {
    return jsonResponse(
      { ok: false, message: 'Sessão administrativa expirada ou não autenticada.' },
      401,
      NO_STORE_HEADERS
    );
  }

  const ip = getClientIp(request, clientAddress);
  const limit = await checkRateLimit({
    namespace: 'admin-email-test',
    key: ip,
    maxRequests: 5,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return jsonResponse(
      {
        ok: false,
        message: 'Muitos testes de e-mail em sequência. Aguarde um minuto.',
      },
      429,
      { ...NO_STORE_HEADERS, ...rateLimitHeaders(limit.retryAfterSeconds) }
    );
  }

  const bodyResult = await readJsonBody(request, 2048);
  if (!bodyResult.ok) {
    return jsonResponse(
      { ok: false, message: bodyResult.message },
      bodyResult.status,
      NO_STORE_HEADERS
    );
  }

  const rawTarget = (bodyResult.data as { target?: unknown } | null)?.target;
  if (rawTarget !== undefined && rawTarget !== 'orcamento' && rawTarget !== 'rh') {
    return jsonResponse(
      { ok: false, message: 'Destino de teste inválido. Utilize "orcamento" ou "rh".' },
      400,
      NO_STORE_HEADERS
    );
  }

  const target: 'orcamento' | 'rh' = rawTarget === 'orcamento' ? 'orcamento' : 'rh';

  if (!isMailerConfigured()) {
    return jsonResponse(
      {
        ok: false,
        message:
          'Serviço de e-mail não configurado. Defina BREVO_API_KEY (recomendado) ou SMTP_HOST, SMTP_USER e SMTP_PASS nas variáveis de ambiente.',
      },
      400,
      NO_STORE_HEADERS
    );
  }

  const summary = getMailerSummary();
  if (summary.provider === 'smtp') {
    const verification = await verifyMailerConnection();
    if (!verification.ok) {
      console.error('[admin/email-test] Falha ao verificar serviço de e-mail:', verification.error);
      return jsonResponse(
        {
          ok: false,
          message: `Falha ao autenticar no serviço de e-mail: ${verification.error || 'verifique as credenciais configuradas.'}`,
        },
        502,
        NO_STORE_HEADERS
      );
    }
  }

  const to = target === 'orcamento' ? summary.quoteTo : summary.rhTo;
  const label = target === 'orcamento' ? 'Orçamentos' : 'RH / Currículos';
  const providerLabel =
    summary.provider === 'brevo'
      ? 'Brevo API (api.brevo.com:443)'
      : `SMTP (${summary.host}:${summary.port})`;
  const sentAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  try {
    const result = await sendMail({
      to,
      subject: sanitizeHeaderValue(`[Teste de E-mail — Site CCG] Confirmação de envio (${label})`),
      text: [
        `Teste de envio de e-mail — Site CCG Locações (${label})`,
        `Provedor: ${providerLabel}`,
        `Remetente: ${summary.from || 'Padrão'}`,
        `Destinatário configurado: ${to}`,
        `Disparado por: ${session.user}`,
        `Data/hora (BRT): ${sentAt}`,
        '',
        'Se você recebeu esta mensagem, o envio automático dos formulários do site está operacional.',
      ].join('\n'),
      html: `
        <div style="font-family: Arial, sans-serif; color: #111814; max-width: 600px;">
          <h2 style="color: #105e2d; margin-bottom: 12px;">Teste de e-mail confirmado — Site CCG Locações</h2>
          <p style="font-size: 14px; color: #3f4b44;">
            Este e-mail confirma que o envio automático para o fluxo de <strong>${escapeHtml(label)}</strong> está operacional.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Provedor:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(providerLabel)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Remetente:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(summary.from || 'Padrão')}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Destinatário:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(to)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Disparado por:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(session.user)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Data/hora (BRT):</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(sentAt)}</td></tr>
          </table>
        </div>
      `,
    });

    if (!result.sent) {
      return jsonResponse(
        { ok: false, message: 'Não foi possível concluir o envio de teste.' },
        502,
        NO_STORE_HEADERS
      );
    }

    console.info('[admin/email-test] E-mail de teste enviado:', {
      provider: result.provider,
      target,
      to,
      messageId: result.messageId,
      by: session.user,
    });

    return jsonResponse(
      {
        ok: true,
        provider: result.provider,
        target,
        to,
        messageId: result.messageId,
        message: `E-mail de teste enviado com sucesso para ${to}!`,
      },
      200,
      NO_STORE_HEADERS
    );
  } catch (err) {
    console.error('[admin/email-test] Erro ao enviar e-mail de teste:', err);
    const errMsg = err instanceof Error ? err.message : 'Erro desconhecido no provedor de e-mail.';
    return jsonResponse(
      {
        ok: false,
        message: `Erro ao enviar e-mail de teste para ${to}: ${errMsg}`,
      },
      502,
      NO_STORE_HEADERS
    );
  }
};
