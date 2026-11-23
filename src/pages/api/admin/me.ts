import type { APIRoute } from 'astro';
import { getAdminConfig, getAdminSession } from '@/lib/adminAuth';
import { isPostgresConfigured, isUsingLocalFallback } from '@/lib/careersDb';
import { isVercelBlobConfigured } from '@/lib/resumeStorage';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = getAdminSession(request);
  const cfg = getAdminConfig();

  return new Response(
    JSON.stringify({
      ok: true,
      authenticated: Boolean(session),
      user: session?.user || null,
      isDevFallbackPassword: cfg.isDevFallbackPassword,
      environment: {
        postgresConfigured: isPostgresConfigured(),
        blobConfigured: isVercelBlobConfigured(),
        localFallback: isUsingLocalFallback(),
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};
