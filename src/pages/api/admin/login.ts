import type { APIRoute } from 'astro';
import {
  createSessionCookieHeader,
  verifyAdminCredentials,
} from '@/lib/adminAuth';

export const prerender = false;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    clientAddress ||
    'unknown';

  if (!checkLoginRateLimit(ip)) {
    return new Response(
      JSON.stringify({ ok: false, message: 'Muitas tentativas de login. Aguarde um minuto.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { user?: string; password?: string };
  try {
    body = (await request.json()) as { user?: string; password?: string };
  } catch {
    return new Response(
      JSON.stringify({ ok: false, message: 'Dados de login inválidos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const user = String(body.user || '').trim();
  const password = String(body.password || '');
  const result = verifyAdminCredentials(user, password);

  if (!result.ok) {
    return new Response(
      JSON.stringify({ ok: false, message: result.reason || 'Credenciais inválidas.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cookie = createSessionCookieHeader(user, request);
  return new Response(
    JSON.stringify({ ok: true, user }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    }
  );
};
