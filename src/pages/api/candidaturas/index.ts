import type { APIRoute } from 'astro';
import {
  candidaturaInputSchema,
  formatBytes,
  isAllowedResumeFile,
} from '@/lib/careersSchema';
import { createCandidatura, getVagaById } from '@/lib/careersDb';
import { escapeHtml, isMailerConfigured, sendMail } from '@/lib/mailer';
import { SITE } from '@/lib/site';

export const prerender = false;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 6;
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

async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  ip: string
): Promise<boolean> {
  if (!token) return false;
  const form = new URLSearchParams({ secret, response: token, remoteip: ip });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    clientAddress ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Muitas candidaturas em sequência. Aguarde um minuto e tente novamente.',
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, message: 'Formato de requisição inválido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const parsed = candidaturaInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'geral');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Verifique os campos destacados abaixo.',
        fieldErrors,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const data = parsed.data;

  // Honeypot
  if (data.website && data.website.length > 0) {
    return new Response(
      JSON.stringify({ ok: true, message: 'Candidatura registrada com sucesso.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!isAllowedResumeFile(data.curriculoNome, data.curriculoTipo)) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Formato de currículo não suportado. Envie PDF, DOC ou DOCX.',
        fieldErrors: { curriculo: 'Envie um arquivo em PDF, DOC ou DOCX (até 10 MB).' },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const turnstileSecret = import.meta.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const valid = await verifyTurnstile(data.turnstileToken, turnstileSecret, ip);
    if (!valid) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Falha na verificação anti-spam. Tente novamente.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  let resolvedVagaTitulo = 'Banco de Talentos';
  if (data.vagaId) {
    try {
      const vaga = await getVagaById(data.vagaId);
      if (!vaga || vaga.status !== 'aberta') {
        return new Response(
          JSON.stringify({
            ok: false,
            message: 'Esta vaga não está mais aberta para novas candidaturas.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      resolvedVagaTitulo = vaga.titulo;
    } catch (err) {
      console.error('[candidaturas] Erro ao validar vaga:', err);
      return new Response(
        JSON.stringify({ ok: false, message: 'Vaga selecionada inválida.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (data.vagaTitulo) {
    resolvedVagaTitulo = data.vagaTitulo;
  }

  let saved;
  try {
    saved = await createCandidatura(data, resolvedVagaTitulo);
  } catch (err) {
    console.error('[candidaturas] Erro ao salvar candidatura no banco:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Não foi possível registrar sua candidatura agora. Tente novamente em instantes.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const protocolo = saved.id.slice(0, 8).toUpperCase();
  const toEmail =
    import.meta.env.RH_TO_EMAIL ||
    process.env.RH_TO_EMAIL ||
    SITE.emailCurriculos;

  if (isMailerConfigured()) {
    try {
      const siteUrl = (
        import.meta.env.PUBLIC_SITE_URL ||
        process.env.PUBLIC_SITE_URL ||
        SITE.domain
      ).replace(/\/$/, '');
      const adminUrl = `${siteUrl}/admin/vagas`;
      const textLines = [
        'Nova candidatura recebida — CCG Locações',
        `Vaga: ${resolvedVagaTitulo}`,
        `Candidato: ${data.nome}`,
        `E-mail: ${data.email}`,
        `Telefone / WhatsApp: ${data.telefone}`,
        `Cidade / UF: ${data.cidadeUf}`,
        ...(data.cnh ? [`CNH: ${data.cnh}`] : []),
        ...(data.pretensaoSalarial ? [`Pretensão salarial: ${data.pretensaoSalarial}`] : []),
        `Currículo anexado: ${data.curriculoNome} (${formatBytes(data.curriculoTamanho)})`,
        '',
        'Resumo de experiência:',
        data.experienciaResumo,
        ...(data.mensagem ? ['', 'Observações do candidato:', data.mensagem] : []),
        '',
        `Abrir Gestor de Vagas: ${adminUrl}`,
        `Protocolo: ${protocolo} • Consentimento LGPD confirmado.`,
      ];

      await sendMail({
        to: toEmail,
        replyTo: data.email,
        subject: `[Currículo CCG] ${resolvedVagaTitulo} — ${data.nome}`,
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
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Currículo anexado:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.curriculoNome)} (${escapeHtml(formatBytes(data.curriculoTamanho))})</td></tr>
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
    } catch (emailErr) {
      console.error('[candidaturas] Erro ao enviar notificação via SMTP:', emailErr);
    }
  } else {
    console.info('[candidaturas] Nova candidatura registrada (configure SMTP_HOST, SMTP_USER e SMTP_PASS para envio real):', {
      protocolo,
      vaga: resolvedVagaTitulo,
      nome: data.nome,
      curriculo: data.curriculoNome,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      protocolo: saved.id.slice(0, 8).toUpperCase(),
      message:
        'Candidatura enviada com sucesso! Nosso time de Recursos Humanos analisará seu currículo.',
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
};
