import type { APIRoute } from 'astro';
import { clearSessionCookieHeader } from '@/lib/adminAuth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookieHeader(request),
    },
  });
};
