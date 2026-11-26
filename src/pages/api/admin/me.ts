import type { APIRoute } from 'astro';
import { getAdminSession } from '@/lib/adminAuth';
import { isPostgresConfigured, isUsingLocalFallback } from '@/lib/careersDb';
import { getMailerSummary, isMailerConfigured } from '@/lib/mailer';
import { isVercelBlobConfigured } from '@/lib/resumeStorage';
import { jsonResponse } from '@/lib/security';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = getAdminSession(request);

  if (!session) {
    return jsonResponse(
      {
        ok: true,
        authenticated: false,
      },
      200,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  return jsonResponse(
    {
      ok: true,
      authenticated: true,
      user: session.user,
      environment: {
        postgresConfigured: isPostgresConfigured(),
        blobConfigured: isVercelBlobConfigured(),
        localFallback: isUsingLocalFallback(),
        smtpConfigured: isMailerConfigured(),
        mailer: getMailerSummary(),
      },
    },
    200,
    { 'Cache-Control': 'private, no-store' }
  );
};
