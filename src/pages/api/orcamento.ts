import type { APIRoute } from 'astro';
import { escapeHtml, isMailerConfigured, sendMail } from '@/lib/mailer';
import { quoteSchema } from '@/lib/quoteSchema';
import { SITE } from '@/lib/site';

export const prerender = false;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_REQUESTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

async function verifyTurnstile(token: string | undefined, secret: string, ip: string): Promise<boolean> {
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
        message: 'Muitas solicitações em sequência. Aguarde um minuto ou fale diretamente pelo WhatsApp.',
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

  const parsed = quoteSchema.safeParse(body);
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

  // Se o honeypot foi preenchido, responde 200 silenciosamente sem disparar e-mail
  if (data.website && data.website.length > 0) {
    return new Response(
      JSON.stringify({ ok: true, message: 'Solicitação recebida com sucesso.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
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

  const toEmail =
    import.meta.env.QUOTE_TO_EMAIL ||
    process.env.QUOTE_TO_EMAIL ||
    SITE.emailContratos;
  const subjectEquip = data.equipamentoInteresse
    ? ` — ${data.equipamentoInteresse}`
    : '';

  if (isMailerConfigured()) {
    try {
      const textLines = [
        'Nova solicitação de orçamento — CCG Locações',
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

      await sendMail({
        to: toEmail,
        replyTo: data.email,
        subject: `[Orçamento Site CCG] ${data.nome}${subjectEquip}`,
        text: textLines.join('\n'),
        html: `
          <div style="font-family: Arial, sans-serif; color: #111814; max-width: 600px;">
            <h2 style="color: #105e2d; margin-bottom: 12px;">Nova solicitação de orçamento — CCG Locações</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
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
    } catch (err) {
      console.error('[orcamento] Erro ao enviar via SMTP:', err);
      return new Response(
        JSON.stringify({
          ok: false,
          message: 'Não foi possível concluir o envio automático agora. Por favor, acione nosso WhatsApp comercial.',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    console.info('[orcamento] Lead validado (configure SMTP_HOST, SMTP_USER e SMTP_PASS para envio real):', {
      nome: data.nome,
      telefone: data.telefone,
      email: data.email,
      equipamentoInteresse: data.equipamentoInteresse,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Recebemos sua solicitação! Nossa equipe técnica responderá em até 24 horas úteis.',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
