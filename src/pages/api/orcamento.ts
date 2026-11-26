import type { APIRoute } from 'astro';
import { escapeHtml, isMailerConfigured, sendMail } from '@/lib/mailer';
import { quoteSchema } from '@/lib/quoteSchema';
import {
  createOrcamento,
  markOrcamentoEmailSent,
  type OrcamentoRecord,
} from '@/lib/quotesDb';
import {
  checkRateLimit,
  getClientIp,
  getEnv,
  jsonResponse,
  rateLimitHeaders,
  readJsonBody,
  sanitizeHeaderValue,
  verifySameOrigin,
  verifyTurnstileToken,
} from '@/lib/security';
import { SITE } from '@/lib/site';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!verifySameOrigin(request)) {
    return jsonResponse({ ok: false, message: 'Origem da requisição não autorizada.' }, 403);
  }

  const ip = getClientIp(request, clientAddress);
  const limit = await checkRateLimit({
    namespace: 'orcamento',
    key: ip,
    maxRequests: 5,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return jsonResponse(
      {
        ok: false,
        message: 'Muitas solicitações em sequência. Aguarde um minuto ou fale diretamente pelo WhatsApp.',
      },
      429,
      rateLimitHeaders(limit.retryAfterSeconds)
    );
  }

  const bodyResult = await readJsonBody(request, 16_384);
  if (!bodyResult.ok) {
    return jsonResponse({ ok: false, message: bodyResult.message }, bodyResult.status);
  }

  const parsed = quoteSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'geral');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return jsonResponse(
      {
        ok: false,
        message: 'Verifique os campos destacados abaixo.',
        fieldErrors,
      },
      400
    );
  }

  const data = parsed.data;

  // Se o honeypot foi preenchido, responde 200 silenciosamente sem salvar no banco ou disparar e-mail
  if (data.website && data.website.trim().length > 0) {
    return jsonResponse({ ok: true, message: 'Solicitação recebida com sucesso.' }, 200);
  }

  const turnstile = await verifyTurnstileToken(data.turnstileToken, ip);
  if (!turnstile.ok) {
    return jsonResponse(
      { ok: false, message: 'Falha na verificação anti-spam. Tente novamente.' },
      400
    );
  }

  let savedRecord: OrcamentoRecord | null = null;
  try {
    savedRecord = await createOrcamento(data);
  } catch (dbErr) {
    console.error('[orcamento] Erro ao salvar no banco:', dbErr);
  }

  const protocolo = savedRecord?.protocolo || null;
  const mailerConfigured = isMailerConfigured();

  if (!mailerConfigured && !savedRecord) {
    return jsonResponse(
      {
        ok: false,
        message: 'Não foi possível concluir o envio agora. Por favor, acione nosso WhatsApp comercial.',
      },
      500
    );
  }

  const toEmail = getEnv('QUOTE_TO_EMAIL')?.trim() || SITE.emailContratos;
  const subjectEquip = data.equipamentoInteresse
    ? ` — ${data.equipamentoInteresse}`
    : '';
  const safeSubject = sanitizeHeaderValue(`[Orçamento Site CCG] ${data.nome}${subjectEquip}`);
  let emailSent = false;

  if (mailerConfigured) {
    try {
      const textLines = [
        'Nova solicitação de orçamento — CCG Locações',
        ...(protocolo ? [`Protocolo: ${protocolo}`] : []),
        `Nome / Responsável: ${data.nome}`,
        `Telefone / WhatsApp: ${data.telefone}`,
        `E-mail: ${data.email}`,
        ...(data.equipamentoInteresse
          ? [`Equipamento / Serviço: ${data.equipamentoInteresse}`]
          : []),
        '',
        'Descrição da demanda:',
        data.mensagem,
        '',
        'Consentimento LGPD confirmado pelo usuário.',
      ];

      const mailResult = await sendMail({
        to: toEmail,
        replyTo: sanitizeHeaderValue(data.email, 160),
        subject: safeSubject,
        text: textLines.join('\n'),
        html: `
          <div style="font-family: Arial, sans-serif; color: #111814; max-width: 600px;">
            <h2 style="color: #105e2d; margin-bottom: 12px;">Nova solicitação de orçamento — CCG Locações</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              ${protocolo ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Protocolo:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">#${escapeHtml(protocolo)}</td></tr>` : ''}
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Nome / Responsável:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.nome)}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Telefone / WhatsApp:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.telefone)}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>E-mail:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.email)}</td></tr>
              ${data.equipamentoInteresse ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Equipamento / Serviço:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.equipamentoInteresse)}</td></tr>` : ''}
            </table>
            <p style="margin-top: 16px;"><strong>Descrição da demanda:</strong></p>
            <p style="white-space: pre-wrap; background: #f3faf5; padding: 12px; border-radius: 6px;">${escapeHtml(data.mensagem)}</p>
            <p style="font-size: 12px; color: #5a675f; margin-top: 16px;">Consentimento LGPD confirmado pelo usuário.</p>
          </div>
        `,
      });

      if (mailResult.sent) {
        emailSent = true;
        console.info('[orcamento] E-mail enviado:', {
          provider: mailResult.provider,
          protocolo,
          to: toEmail,
          messageId: mailResult.messageId,
        });

        if (savedRecord) {
          try {
            await markOrcamentoEmailSent(savedRecord.id);
          } catch (markErr) {
            console.warn('[orcamento] E-mail enviado, mas falhou ao atualizar email_enviado:', markErr);
          }
        }
      }
    } catch (err) {
      console.error('[orcamento] Erro ao enviar e-mail:', err);
      if (!savedRecord) {
        return jsonResponse(
          {
            ok: false,
            message: 'Não foi possível concluir o envio automático agora. Por favor, acione nosso WhatsApp comercial.',
          },
          502
        );
      }
    }
  } else {
    console.info('[orcamento] Lead salvo no banco (serviço de e-mail não configurado):', {
      protocolo,
      equipamentoInteresse: data.equipamentoInteresse,
    });
  }

  return jsonResponse(
    {
      ok: true,
      emailSent,
      ...(protocolo ? { protocolo } : {}),
      message: 'Recebemos sua solicitação! Nossa equipe técnica responderá em até 24 horas úteis.',
    },
    200
  );
};
