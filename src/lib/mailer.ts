import nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendMailResult {
  sent: boolean;
  messageId?: string;
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
  return getSmtpConfig() !== null;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const config = getSmtpConfig();
  if (!config) {
    return { sent: false };
  }

  const transporter = nodemailer.createTransport({
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
      messageId: info.messageId,
    };
  } finally {
    transporter.close();
  }
}
