import { defineMiddleware } from 'astro:middleware';

const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com https://www.clarity.ms https://scripts.clarity.ms https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com https://c.clarity.ms https://c.bing.com",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com https://blob.vercel-storage.com https://*.blob.vercel-storage.com https://vercel.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://*.clarity.ms",
  "frame-src https://maps.google.com https://www.google.com https://challenges.cloudflare.com",
];

function buildCsp(includeUpgrade: boolean): string {
  return includeUpgrade
    ? [...BASE_CSP_DIRECTIVES, 'upgrade-insecure-requests'].join('; ')
    : BASE_CSP_DIRECTIVES.join('; ');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const isProd = Boolean(import.meta.env.PROD || process.env.NODE_ENV === 'production');
  const isHttps = context.url.protocol === 'https:';
  const pathname = context.url.pathname;

  const headers = new Headers(response.headers);

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('X-DNS-Prefetch-Control', 'off');

  if (isProd || isHttps) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', buildCsp(isProd || isHttps));
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
