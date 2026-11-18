import type { APIRoute } from 'astro';

export const prerender = false;

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({ ok: true, status: 'up', timestamp: new Date().toISOString() }),
    { status: 200, headers }
  );
};

export const HEAD: APIRoute = () => {
  return new Response(null, { status: 200, headers });
};
