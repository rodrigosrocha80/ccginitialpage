import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getEnv } from './security';

export const ADMIN_COOKIE_NAME = 'ccg_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 horas
let _warnedMissingSessionSecret = false;

export function isProdEnvironment(): boolean {
  return Boolean(import.meta.env.PROD || process.env.NODE_ENV === 'production');
}

export function getAdminConfig() {
  const user = (getEnv('ADMIN_USER') || 'admin').trim();
  const configuredPassword = getEnv('ADMIN_PASSWORD')?.trim();
  const isDevFallbackPassword = !configuredPassword && !isProdEnvironment();
  const password = configuredPassword || (isDevFallbackPassword ? 'ccg-admin-dev' : '');
  const configuredSecret = getEnv('ADMIN_SESSION_SECRET')?.trim();

  if (isProdEnvironment() && !configuredSecret && !_warnedMissingSessionSecret) {
    _warnedMissingSessionSecret = true;
    console.warn(
      '[adminAuth] ADMIN_SESSION_SECRET não definido em produção; defina uma chave aleatória independente.'
    );
  }

  const secret =
    configuredSecret ||
    (password ? createHmac('sha256', 'ccg-vagas-session-salt').update(password).digest('hex') : '');

  return {
    user,
    password,
    secret,
    isConfigured: Boolean(password),
    isDevFallbackPassword,
  };
}

function safeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function verifyAdminCredentials(user: string, password: string): {
  ok: boolean;
  reason?: string;
} {
  const cfg = getAdminConfig();
  if (!cfg.isConfigured) {
    return {
      ok: false,
      reason: 'Autenticação administrativa indisponível neste ambiente.',
    };
  }
  const validUser = safeEqual(user.trim(), cfg.user);
  const validPass = safeEqual(password, cfg.password);
  if (!validUser || !validPass) {
    return { ok: false, reason: 'Usuário ou senha inválidos.' };
  }
  return { ok: true };
}

interface SessionPayload {
  sub: string;
  exp: number;
  jti: string;
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createSessionToken(username: string): string {
  const cfg = getAdminConfig();
  if (!cfg.secret) {
    throw new Error('Configuração de sessão administrativa ausente.');
  }
  const payload: SessionPayload = {
    sub: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    jti: randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(payloadB64, cfg.secret);
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const cfg = getAdminConfig();
  if (!cfg.secret || !cfg.isConfigured) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = signPayload(payloadB64, cfg.secret);
  if (!safeEqual(sig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (!parsed.sub || typeof parsed.exp !== 'number' || typeof parsed.jti !== 'string') {
      return null;
    }
    if (!safeEqual(parsed.sub, cfg.user)) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function getAdminSession(request: Request): { user: string } | null {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const token = cookies[ADMIN_COOKIE_NAME];
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return { user: payload.sub };
}

export function createSessionCookieHeader(username: string, request: Request): string {
  const token = createSessionToken(username);
  const url = new URL(request.url);
  const isSecure = url.protocol === 'https:' || isProdEnvironment();
  const attrs = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isSecure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearSessionCookieHeader(request: Request): string {
  const url = new URL(request.url);
  const isSecure = url.protocol === 'https:' || isProdEnvironment();
  const attrs = [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecure) attrs.push('Secure');
  return attrs.join('; ');
}

export function requireAdmin(request: Request): { user: string } | Response {
  const session = getAdminSession(request);
  if (!session) {
    return new Response(
      JSON.stringify({ ok: false, message: 'Sessão expirada ou não autenticada.' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
        },
      }
    );
  }
  return session;
}
