import nodemailer from 'nodemailer';
import { SITE } from './site';

export interface SendMailInput {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

export type MailerProvider = 'brevo' | 'smtp';

export interface SendMailResult {
  sent: boolean;
  provider?: MailerProvider;
  messageId?: string;
}

export interface MailerSummary {
  configured: boolean;
  provider: MailerProvider | null;
  host: string | null;
  port: number | null;
  secure: boolean;
  from: string | null;
  quoteTo: string;
  rhTo: string;
}

interface BrevoConfig {
  apiKey: string;
  sender: {
    name: string;
    email: string;
  };
  fromFormatted: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function getEnv(name: string): string {
  const fromImportMeta = (import.meta.env as Record<string, string | undefined>)[name];
  const raw = fromImportMeta ?? process.env[name] ?? '';
  return raw.trim();
}

const EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function parseEmailAddress(raw: string): { name?: string; email: string } | null {
  const cleaned = raw.replace(/[\r\n]+/g, ' ').trim();
  if (!cleaned) return null;

  const angleMatch = cleaned.match(/^(.*?)<\s*([^<>]+)\s*>$/);
  if (angleMatch) {
    const rawName = angleMatch[1].replace(/^["']|["']$/g, '').trim().slice(0, 120);
    const email = angleMatch[2].trim().slice(0, 160);
    if (!EMAIL_REGEX.test(email)) return null;
    return rawName ? { name: rawName, email } : { email };
  }

  const email = cleaned.slice(0, 160);
  if (!EMAIL_REGEX.test(email)) return null;
  return { email };
}

function getBrevoConfig(): BrevoConfig | null {
  const apiKey = getEnv('BREVO_API_KEY');
  if (!apiKey) {
    return null;
  }

  const explicitSenderEmail = getEnv('BREVO_SENDER_EMAIL');
  const explicitSenderName = getEnv('BREVO_SENDER_NAME').replace(/[\r\n"]+/g, ' ').trim().slice(0, 120);
  const fromEnvParsed = parseEmailAddress(getEnv('QUOTE_FROM_EMAIL'));
  const smtpUserParsed = parseEmailAddress(getEnv('SMTP_USER'));

  let senderEmail = '';
  let senderName = explicitSenderName || 'Site CCG Locações';

  if (explicitSenderEmail && EMAIL_REGEX.test(explicitSenderEmail)) {
    senderEmail = explicitSenderEmail.slice(0, 160);
  } else if (fromEnvParsed) {
    senderEmail = fromEnvParsed.email;
    if (!explicitSenderName && fromEnvParsed.name) {
      senderName = fromEnvParsed.name;
    }
  } else if (smtpUserParsed) {
    senderEmail = smtpUserParsed.email;
  } else {
    senderEmail = 'naoresponder@ccglocacao.com.br';
  }

  return {
    apiKey,
    sender: {
      name: senderName,
      email: senderEmail,
    },
    fromFormatted: `${senderName} <${senderEmail}>`,
  };
}

function getSmtpConfig(): SmtpConfig | null {
  const host = getEnv('SMTP_HOST');
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');

  if (!host || !user || !pass) {
    return null;
  }

  const parsedPort = Number.parseInt(getEnv('SMTP_PORT') || '587', 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;

  const secureEnv = getEnv('SMTP_SECURE').toLowerCase();
  const secure =
    secureEnv === 'true' ? true : secureEnv === 'false' ? false : port === 465;

  const from = getEnv('QUOTE_FROM_EMAIL') || `Site CCG Locações <${user}>`;

  return { host, port, secure, user, pass, from };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isMailerConfigured(): boolean {
  return getBrevoConfig() !== null || getSmtpConfig() !== null;
}

export function getMailerSummary(): MailerSummary {
  const brevo = getBrevoConfig();
  const quoteTo = getEnv('QUOTE_TO_EMAIL') || SITE.emailContratos;
  const rhTo = getEnv('RH_TO_EMAIL') || SITE.emailCurriculos;

  if (brevo) {
    return {
      configured: true,
      provider: 'brevo',
      host: 'api.brevo.com',
      port: 443,
      secure: true,
      from: brevo.fromFormatted,
      quoteTo,
      rhTo,
    };
  }

  const config = getSmtpConfig();
  if (!config) {
    return {
      configured: false,
      provider: null,
      host: null,
      port: null,
      secure: false,
      from: null,
      quoteTo,
      rhTo,
    };
  }

  return {
    configured: true,
    provider: 'smtp',
    host: config.host,
    port: config.port,
    secure: config.secure,
    from: config.from,
    quoteTo,
    rhTo,
  };
}

async function readSafeBrevoError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; code?: string };
    const detail = [data.code, data.message].filter(Boolean).join(': ').trim();
    return detail.slice(0, 240) || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    pool: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export async function verifyMailerConnection(): Promise<{ ok: boolean; error?: string }> {
  const brevo = getBrevoConfig();
  if (brevo) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        method: 'GET',
        headers: {
          'api-key': brevo.apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok || res.status === 403) {
        // 403 em /v3/account indica chave válida com escopo restrito (ex.: apenas envio transacional)
        return { ok: true };
      }

      const detail = await readSafeBrevoError(res);
      return { ok: false, error: `Brevo API (${res.status}): ${detail}` };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha desconhecida ao conectar na API do Brevo.';
      return { ok: false, error: message };
    }
  }

  const config = getSmtpConfig();
  if (!config) {
    return {
      ok: false,
      error:
        'Serviço de e-mail não configurado (defina BREVO_API_KEY ou SMTP_HOST, SMTP_USER e SMTP_PASS).',
    };
  }

  const transporter = createTransporter(config);
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha desconhecida ao autenticar no SMTP.';
    return { ok: false, error: message };
  } finally {
    transporter.close();
  }
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const brevo = getBrevoConfig();
  if (brevo) {
    const parsedTo = parseEmailAddress(input.to);
    if (!parsedTo) {
      throw new Error('Endereço de destinatário inválido para envio via Brevo.');
    }

    const parsedReplyTo = input.replyTo ? parseEmailAddress(input.replyTo) : null;
    const safeSubject = input.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevo.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: brevo.sender.name,
          email: brevo.sender.email,
        },
        to: [
          {
            email: parsedTo.email,
            ...(parsedTo.name ? { name: parsedTo.name } : {}),
          },
        ],
        ...(parsedReplyTo ? { replyTo: { email: parsedReplyTo.email } } : {}),
        subject: safeSubject,
        htmlContent: input.html,
        ...(input.text ? { textContent: input.text } : {}),
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const detail = await readSafeBrevoError(res);
      throw new Error(`Brevo API (${res.status}): ${detail}`);
    }

    const json = (await res.json()) as { messageId?: string };
    return {
      sent: true,
      provider: 'brevo',
      messageId: json.messageId,
    };
  }

  const config = getSmtpConfig();
  if (!config) {
    return { sent: false };
  }

  const transporter = createTransporter(config);

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return {
      sent: true,
      provider: 'smtp',
      messageId: info.messageId,
    };
  } finally {
    transporter.close();
  }
}
