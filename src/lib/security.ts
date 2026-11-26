import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SITE } from './site';

export const UPLOAD_TICKET_COOKIE_NAME = 'ccg_upload_ticket';
const UPLOAD_TICKET_TTL_SECONDS = 600;
const MAX_MEMORY_ENTRIES = 5000;

export function getEnv(key: string): string | undefined {
  const fromImportMeta = (import.meta.env as Record<string, string | undefined>)[key];
  return fromImportMeta || process.env[key];
}

function isProdEnv(): boolean {
  return Boolean(import.meta.env.PROD || process.env.NODE_ENV === 'production');
}

function safeEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function getClientIp(request: Request, clientAddress?: string): string {
  const trustCf = getEnv('TRUST_CLOUDFLARE_PROXY')?.trim().toLowerCase() === 'true';
  const raw =
    (trustCf ? request.headers.get('cf-connecting-ip') : null) ||
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    clientAddress ||
    'unknown';

  const cleaned = raw.trim().slice(0, 64);
  return cleaned || 'unknown';
}

interface MemoryRateEntry {
  count: number;
  resetAt: number;
}

const memoryRateStore = new Map<string, MemoryRateEntry>();

function pruneMemoryStore(now: number): void {
  for (const [k, entry] of memoryRateStore) {
    if (now > entry.resetAt) {
      memoryRateStore.delete(k);
    }
  }
  while (memoryRateStore.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryRateStore.keys().next().value;
    if (oldestKey === undefined) break;
    memoryRateStore.delete(oldestKey);
  }
}

function checkMemoryRateLimit(
  compositeKey: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  if (memoryRateStore.size > MAX_MEMORY_ENTRIES / 2) {
    pruneMemoryStore(now);
  }

  const existing = memoryRateStore.get(compositeKey);
  if (!existing || now > existing.resetAt) {
    if (memoryRateStore.size >= MAX_MEMORY_ENTRIES) {
      pruneMemoryStore(now);
    }
    memoryRateStore.set(compositeKey, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export async function checkRateLimit(opts: {
  namespace: string;
  key: string;
  maxRequests: number;
  windowMs: number;
}): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const { namespace, key, maxRequests, windowMs } = opts;
  const compositeKey = `rl:${namespace}:${key}`;

  const redisUrl = getEnv('UPSTASH_REDIS_REST_URL')?.trim().replace(/\/+$/, '');
  const redisToken = getEnv('UPSTASH_REDIS_REST_TOKEN')?.trim();

  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', compositeKey],
          ['PTTL', compositeKey],
        ]),
        signal: AbortSignal.timeout(2500),
      });

      if (res.ok) {
        const results = (await res.json()) as Array<{ result?: number; error?: string }>;
        const count = Number(results?.[0]?.result ?? 0);
        let pttl = Number(results?.[1]?.result ?? -1);

        if (count > 0 && pttl < 0) {
          await fetch(`${redisUrl}/pipeline`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${redisToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([['PEXPIRE', compositeKey, windowMs]]),
            signal: AbortSignal.timeout(2500),
          }).catch(() => undefined);
          pttl = windowMs;
        }

        if (count > 0) {
          const retryAfterSeconds = Math.max(1, Math.ceil((pttl > 0 ? pttl : windowMs) / 1000));
          return {
            allowed: count <= maxRequests,
            remaining: Math.max(0, maxRequests - count),
            retryAfterSeconds,
          };
        }
      }
    } catch {
      // Fall back to in-memory limiter if Upstash is temporarily unreachable
    }
  }

  return checkMemoryRateLimit(compositeKey, maxRequests, windowMs);
}

export function rateLimitHeaders(retryAfterSeconds: number): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Retry-After': String(Math.max(1, retryAfterSeconds)),
    'Cache-Control': 'no-store',
  };
}

export function isTurnstileConfigured(): boolean {
  return Boolean(getEnv('TURNSTILE_SECRET_KEY')?.trim());
}

export async function verifyTurnstileToken(
  token: string | undefined,
  ip: string
): Promise<{ ok: boolean; required: boolean }> {
  const secret = getEnv('TURNSTILE_SECRET_KEY')?.trim();
  if (!secret) {
    return { ok: true, required: false };
  }
  if (!token || !token.trim()) {
    return { ok: false, required: true };
  }

  try {
    const form = new URLSearchParams({
      secret,
      response: token.trim(),
      ...(ip && ip !== 'unknown' ? { remoteip: ip } : {}),
    });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, required: true };
    }
    const data = (await res.json()) as { success?: boolean };
    return { ok: Boolean(data.success), required: true };
  } catch {
    return { ok: false, required: true };
  }
}

interface UploadTicketPayload {
  basePrefix: string;
  ext: string;
  turnstileVerified: boolean;
  exp: number;
}

function getUploadTicketSigningKey(): string {
  const baseSecret =
    getEnv('ADMIN_SESSION_SECRET')?.trim() ||
    getEnv('TURNSTILE_SECRET_KEY')?.trim() ||
    getEnv('BLOB_READ_WRITE_TOKEN')?.trim() ||
    'dev-local-upload-ticket-key';

  return createHmac('sha256', 'ccg-upload-ticket-v1').update(baseSecret).digest('hex');
}

function extractResumeExt(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.docx')) return '.docx';
  if (lower.endsWith('.doc')) return '.doc';
  if (lower.endsWith('.pdf')) return '.pdf';
  return '';
}

export function createUploadTicketCookie(opts: {
  pathname: string;
  turnstileVerified: boolean;
  request: Request;
}): string {
  const ext = extractResumeExt(opts.pathname);
  const basePrefix = ext ? opts.pathname.slice(0, -ext.length) : opts.pathname;
  const payload: UploadTicketPayload = {
    basePrefix,
    ext,
    turnstileVerified: opts.turnstileVerified,
    exp: Math.floor(Date.now() / 1000) + UPLOAD_TICKET_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getUploadTicketSigningKey())
    .update(payloadB64)
    .digest('base64url');
  const token = `${payloadB64}.${sig}`;

  const url = new URL(opts.request.url);
  const isSecure = url.protocol === 'https:' || isProdEnv();
  const attrs = [
    `${UPLOAD_TICKET_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/api/candidaturas',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${UPLOAD_TICKET_TTL_SECONDS}`,
  ];
  if (isSecure) attrs.push('Secure');
  return attrs.join('; ');
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        cookies[k] = decodeURIComponent(v);
      } catch {
        cookies[k] = v;
      }
    }
  }
  return cookies;
}

export function verifyUploadTicketCookie(
  request: Request,
  submittedPathname: string
): { valid: boolean; turnstileVerified: boolean } {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies[UPLOAD_TICKET_COOKIE_NAME];
  if (!token) return { valid: false, turnstileVerified: false };

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, turnstileVerified: false };
  const [payloadB64, sig] = parts;

  const expectedSig = createHmac('sha256', getUploadTicketSigningKey())
    .update(payloadB64)
    .digest('base64url');
  if (!safeEqual(sig, expectedSig)) {
    return { valid: false, turnstileVerified: false };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as UploadTicketPayload;
    if (
      !parsed ||
      typeof parsed.basePrefix !== 'string' ||
      typeof parsed.ext !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return { valid: false, turnstileVerified: false };
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, turnstileVerified: false };
    }
    const matchesPath =
      parsed.ext.length > 0 &&
      submittedPathname.startsWith(parsed.basePrefix) &&
      submittedPathname.toLowerCase().endsWith(parsed.ext);

    if (!matchesPath) {
      return { valid: false, turnstileVerified: false };
    }

    return { valid: true, turnstileVerified: Boolean(parsed.turnstileVerified) };
  } catch {
    return { valid: false, turnstileVerified: false };
  }
}

export function clearUploadTicketCookie(request: Request): string {
  const url = new URL(request.url);
  const isSecure = url.protocol === 'https:' || isProdEnv();
  const attrs = [
    `${UPLOAD_TICKET_COOKIE_NAME}=`,
    'Path=/api/candidaturas',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecure) attrs.push('Secure');
  return attrs.join('; ');
}

export function verifySameOrigin(
  request: Request,
  opts?: { requireOrigin?: boolean }
): boolean {
  const allowedOrigins = new Set<string>();

  try {
    allowedOrigins.add(new URL(request.url).origin);
  } catch {
    // ignore malformed URL
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = request.headers.get('host')?.trim();
  for (const h of [forwardedHost, host]) {
    if (!h) continue;
    allowedOrigins.add(`https://${h}`);
    if (!isProdEnv()) {
      allowedOrigins.add(`http://${h}`);
    }
  }

  const publicSiteUrl = getEnv('PUBLIC_SITE_URL')?.trim();
  for (const base of [publicSiteUrl, SITE.domain]) {
    if (!base) continue;
    try {
      const u = new URL(base);
      allowedOrigins.add(u.origin);
      if (u.hostname.startsWith('www.')) {
        allowedOrigins.add(`${u.protocol}//${u.hostname.slice(4)}`);
      } else {
        allowedOrigins.add(`${u.protocol}//www.${u.hostname}`);
      }
    } catch {
      // ignore
    }
  }

  const originHeader = request.headers.get('origin')?.trim();
  const refererHeader = request.headers.get('referer')?.trim();

  let requestOrigin = '';
  if (originHeader) {
    if (originHeader === 'null') return false;
    try {
      requestOrigin = new URL(originHeader).origin;
    } catch {
      return false;
    }
  } else if (refererHeader) {
    try {
      requestOrigin = new URL(refererHeader).origin;
    } catch {
      return false;
    }
  } else {
    return !opts?.requireOrigin;
  }

  return allowedOrigins.has(requestOrigin);
}

export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes = 32_768
): Promise<{ ok: true; data: T } | { ok: false; status: 400 | 413; message: string }> {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return {
        ok: false,
        status: 413,
        message: 'Corpo da requisição excede o limite permitido.',
      };
    }
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return {
      ok: false,
      status: 400,
      message: 'Formato de requisição inválido.',
    };
  }

  if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
    return {
      ok: false,
      status: 413,
      message: 'Corpo da requisição excede o limite permitido.',
    };
  }

  try {
    const data = JSON.parse(rawText) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      status: 400,
      message: 'Formato de requisição inválido.',
    };
  }
}

export function sanitizeHeaderValue(value: string, maxLen = 200): string {
  return value
    .replace(/[\r\n\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function isSafeResumePathname(pathname: string): boolean {
  if (!pathname || pathname.includes('..') || pathname.includes('\\')) {
    return false;
  }
  if (!/^curriculos\/[a-zA-Z0-9._-]+$/.test(pathname)) {
    return false;
  }
  const lower = pathname.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.docx');
}

export function isAllowedBlobUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    return (
      u.hostname === 'blob.vercel-storage.com' ||
      u.hostname.endsWith('.blob.vercel-storage.com')
    );
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | undefined | null): boolean {
  return Boolean(value && UUID_RE.test(value.trim()));
}

export function validateResumeMagicBytes(buf: Uint8Array, fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  if (buf.length < 4) return false;

  if (lower.endsWith('.pdf')) {
    // %PDF-
    return (
      buf.length >= 5 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46 &&
      buf[4] === 0x2d
    );
  }

  if (lower.endsWith('.doc')) {
    // OLE2 Compound Document (D0 CF 11 E0) or RTF ({\rtf)
    const isOle2 =
      buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    const isRtf =
      buf.length >= 5 &&
      buf[0] === 0x7b &&
      buf[1] === 0x5c &&
      buf[2] === 0x72 &&
      buf[3] === 0x74 &&
      buf[4] === 0x66;
    return isOle2 || isRtf;
  }

  if (lower.endsWith('.docx')) {
    // ZIP/OOXML (PK\x03\x04)
    return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  }

  return false;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string | string[]>
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });

  if (extraHeaders) {
    for (const [key, val] of Object.entries(extraHeaders)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          headers.append(key, item);
        }
      } else {
        headers.set(key, val);
      }
    }
  }

  return new Response(JSON.stringify(body), { status, headers });
}
