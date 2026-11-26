import type { APIRoute } from 'astro';
import {
  candidaturaInputSchema,
  formatBytes,
  isAllowedResumeFile,
} from '@/lib/careersSchema';
import { createCandidatura, getVagaById } from '@/lib/careersDb';
import { isProdEnvironment } from '@/lib/adminAuth';
import { escapeHtml, isMailerConfigured, sendMail } from '@/lib/mailer';
import { verifyStoredResume } from '@/lib/resumeStorage';
import {
  checkRateLimit,
  clearUploadTicketCookie,
  getClientIp,
  getEnv,
  isTurnstileConfigured,
  isValidUuid,
  jsonResponse,
  rateLimitHeaders,
  readJsonBody,
  sanitizeHeaderValue,
  verifySameOrigin,
  verifyTurnstileToken,
  verifyUploadTicketCookie,
} from '@/lib/security';
import { SITE } from '@/lib/site';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!verifySameOrigin(request)) {
    return jsonResponse({ ok: false, message: 'Origem da requisição não autorizada.' }, 403);
  }

  const ip = getClientIp(request, clientAddress);
  const limit = await checkRateLimit({
    namespace: 'candidaturas',
    key: ip,
    maxRequests: 5,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return jsonResponse(
      {
        ok: false,
        message: 'Muitas candidaturas em sequência. Aguarde um minuto e tente novamente.',
      },
      429,
      rateLimitHeaders(limit.retryAfterSeconds)
    );
  }

  const bodyResult = await readJsonBody(request, 32_768);
  if (!bodyResult.ok) {
    return jsonResponse({ ok: false, message: bodyResult.message }, bodyResult.status);
  }

  const parsed = candidaturaInputSchema.safeParse(bodyResult.data);
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

  // Honeypot
  if (data.website && data.website.trim().length > 0) {
    return jsonResponse({ ok: true, message: 'Candidatura registrada com sucesso.' }, 200);
  }

  if (!isAllowedResumeFile(data.curriculoNome, data.curriculoTipo)) {
    return jsonResponse(
      {
        ok: false,
        message: 'Formato de currículo não suportado. Envie PDF, DOC ou DOCX.',
        fieldErrors: { curriculo: 'Envie um arquivo em PDF, DOC ou DOCX (até 10 MB).' },
      },
      400
    );
  }

  const ticket = verifyUploadTicketCookie(request, data.curriculoPathname);
  const clearCookie = clearUploadTicketCookie(request);

  if (isTurnstileConfigured()) {
    if (!(ticket.valid && ticket.turnstileVerified)) {
      const check = await verifyTurnstileToken(data.turnstileToken, ip);
      if (!check.ok) {
        return jsonResponse(
          { ok: false, message: 'Falha na verificação anti-spam. Tente novamente.' },
          400,
          { 'Set-Cookie': clearCookie }
        );
      }
    }
  }

  const verifiedResume = await verifyStoredResume({
    storage: data.curriculoStorage,
    pathname: data.curriculoPathname,
    url: data.curriculoUrl,
    fileName: data.curriculoNome,
    contentType: data.curriculoTipo,
    size: data.curriculoTamanho,
    isProd: isProdEnvironment(),
  });

  if (!verifiedResume.ok) {
    return jsonResponse(
      {
        ok: false,
        message: verifiedResume.message,
        fieldErrors: { curriculo: verifiedResume.message },
      },
      400,
      { 'Set-Cookie': clearCookie }
    );
  }

  let resolvedVagaTitulo = 'Banco de Talentos';
  if (data.vagaId) {
    if (!isValidUuid(data.vagaId)) {
      return jsonResponse(
        { ok: false, message: 'Vaga selecionada inválida.' },
        400,
        { 'Set-Cookie': clearCookie }
      );
    }
    try {
      const vaga = await getVagaById(data.vagaId);
      if (!vaga || vaga.status !== 'aberta') {
        return jsonResponse(
          {
            ok: false,
            message: 'Esta vaga não está mais aberta para novas candidaturas.',
          },
          400,
          { 'Set-Cookie': clearCookie }
        );
      }
      resolvedVagaTitulo = vaga.titulo;
    } catch (err) {
      console.error('[candidaturas] Erro ao validar vaga:', err);
      return jsonResponse(
        { ok: false, message: 'Vaga selecionada inválida.' },
        400,
        { 'Set-Cookie': clearCookie }
      );
    }
  }

  const authoritativeInput = {
    ...data,
    cpf: null,
    curriculoUrl: verifiedResume.url,
    curriculoPathname: verifiedResume.pathname,
    curriculoTipo: verifiedResume.contentType,
    curriculoTamanho: verifiedResume.size,
    curriculoStorage: verifiedResume.storage,
  };

  let saved;
  try {
    saved = await createCandidatura(authoritativeInput, resolvedVagaTitulo);
  } catch (err) {
    console.error('[candidaturas] Erro ao salvar candidatura no banco:', err);
    return jsonResponse(
      {
        ok: false,
        message: 'Não foi possível registrar sua candidatura agora. Tente novamente em instantes.',
      },
      500,
      { 'Set-Cookie': clearCookie }
    );
  }

  const protocolo = saved.id.slice(0, 8).toUpperCase();
  const toEmail = getEnv('RH_TO_EMAIL')?.trim() || SITE.emailCurriculos;
  let emailSent = false;

  if (isMailerConfigured()) {
    try {
      const siteUrl = (getEnv('PUBLIC_SITE_URL')?.trim() || SITE.domain).replace(/\/$/, '');
      const adminUrl = `${siteUrl}/admin/vagas`;
      const safeSubject = sanitizeHeaderValue(
        `[Currículo CCG] ${resolvedVagaTitulo} — ${data.nome}`
      );
      const textLines = [
        'Nova candidatura recebida — CCG Locações',
        `Vaga: ${resolvedVagaTitulo}`,
        `Candidato: ${data.nome}`,
        `E-mail: ${data.email}`,
        `Telefone / WhatsApp: ${data.telefone}`,
        `Cidade / UF: ${data.cidadeUf}`,
        ...(data.cnh ? [`CNH: ${data.cnh}`] : []),
        ...(data.pretensaoSalarial ? [`Pretensão salarial: ${data.pretensaoSalarial}`] : []),
        `Currículo anexado: ${data.curriculoNome} (${formatBytes(verifiedResume.size)})`,
        '',
        'Resumo de experiência:',
        data.experienciaResumo,
        ...(data.mensagem ? ['', 'Observações do candidato:', data.mensagem] : []),
        '',
        `Abrir Gestor de Vagas: ${adminUrl}`,
        `Protocolo: ${protocolo} • Consentimento LGPD confirmado.`,
      ];

      const mailResult = await sendMail({
        to: toEmail,
        replyTo: sanitizeHeaderValue(data.email, 160),
        subject: safeSubject,
        text: textLines.join('\n'),
        html: `
          <div style="font-family: Arial, sans-serif; color: #111814; max-width: 640px;">
            <h2 style="color: #105e2d; margin-bottom: 12px;">Nova candidatura recebida — CCG Locações</h2>
            <p style="margin: 0 0 16px; font-size: 14px; color: #3f4b44;">
              Vaga: <strong>${escapeHtml(resolvedVagaTitulo)}</strong>
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Candidato:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.nome)}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>E-mail:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.email)}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Telefone / WhatsApp:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.telefone)}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Cidade / UF:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.cidadeUf)}</td></tr>
              ${data.cnh ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>CNH:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.cnh)}</td></tr>` : ''}
              ${data.pretensaoSalarial ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Pretensão salarial:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.pretensaoSalarial)}</td></tr>` : ''}
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Currículo anexado:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.curriculoNome)} (${escapeHtml(formatBytes(verifiedResume.size))})</td></tr>
            </table>
            <p style="margin-top: 16px;"><strong>Resumo de experiência:</strong></p>
            <p style="white-space: pre-wrap; background: #f3faf5; padding: 12px; border-radius: 6px; font-size: 14px;">${escapeHtml(data.experienciaResumo)}</p>
            ${data.mensagem ? `<p style="margin-top: 12px;"><strong>Observações do candidato:</strong></p><p style="white-space: pre-wrap; background: #f7f8f7; padding: 12px; border-radius: 6px; font-size: 14px;">${escapeHtml(data.mensagem)}</p>` : ''}
            <p style="margin-top: 20px;">
              <a href="${escapeHtml(adminUrl)}" style="display: inline-block; background: #105e2d; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 20px; border-radius: 8px;">
                Abrir Gestor de Vagas e Baixar Currículo
              </a>
            </p>
            <p style="font-size: 12px; color: #5a675f; margin-top: 16px;">Protocolo: ${escapeHtml(protocolo)} • Consentimento LGPD confirmado.</p>
          </div>
        `,
      });

      if (mailResult.sent) {
        emailSent = true;
        console.info('[candidaturas] E-mail enviado:', {
          provider: mailResult.provider,
          protocolo,
          to: toEmail,
          messageId: mailResult.messageId,
        });
      }
    } catch (emailErr) {
      console.error('[candidaturas] Erro ao enviar e-mail:', emailErr);
    }
  } else {
    console.info('[candidaturas] Nova candidatura registrada (serviço de e-mail não configurado):', {
      protocolo,
      vaga: resolvedVagaTitulo,
    });
  }

  return jsonResponse(
    {
      ok: true,
      protocolo,
      emailSent,
      message:
        'Candidatura enviada com sucesso! Nosso time de Recursos Humanos analisará seu currículo.',
    },
    201,
    { 'Set-Cookie': clearCookie }
  );
};
