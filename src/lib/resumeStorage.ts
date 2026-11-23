import { del, get } from '@vercel/blob';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_RESUME_BYTES, isAllowedResumeFile } from './careersSchema';

function getEnv(key: string): string | undefined {
  const fromImportMeta = (import.meta.env as Record<string, string | undefined>)[key];
  return fromImportMeta || process.env[key];
}

export function isVercelBlobConfigured(): boolean {
  return Boolean(getEnv('BLOB_READ_WRITE_TOKEN')?.trim());
}

export function getBlobAccessMode(): 'private' | 'public' {
  const raw = (getEnv('BLOB_ACCESS') || 'private').trim().toLowerCase();
  return raw === 'public' ? 'public' : 'private';
}

export function getLocalResumesDir(): string {
  return path.join(process.cwd(), '.local-data', 'curriculos');
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'curriculo.pdf';
}

export async function saveLocalResume(file: File): Promise<{
  url: string;
  pathname: string;
  fileName: string;
  contentType: string;
  size: number;
  storage: 'local';
}> {
  if (!isAllowedResumeFile(file.name, file.type)) {
    throw new Error('Formato não suportado. Envie apenas PDF, DOC ou DOCX.');
  }
  if (file.size <= 0 || file.size > MAX_RESUME_BYTES) {
    throw new Error('O arquivo deve ter entre 1 byte e 10 MB.');
  }

  const dir = getLocalResumesDir();
  await mkdir(dir, { recursive: true });

  const safeName = sanitizeFileName(file.name);
  const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
  const fullPath = path.join(dir, storedName);
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(fullPath, Buffer.from(arrayBuffer));

  const pathname = `curriculos/${storedName}`;
  return {
    url: `local://${pathname}`,
    pathname,
    fileName: file.name,
    contentType: file.type || 'application/pdf',
    size: file.size,
    storage: 'local',
  };
}

export async function readResumeForDownload(opts: {
  storage: 'vercel_blob' | 'local';
  url: string;
  pathname: string;
  contentType: string;
}): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null> {
  if (opts.storage === 'local') {
    const fileName = path.basename(opts.pathname);
    const fullPath = path.join(getLocalResumesDir(), fileName);
    try {
      const buf = await readFile(fullPath);
      return { body: buf, contentType: opts.contentType || 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  const access = getBlobAccessMode();
  const result = await get(opts.pathname, { access });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  return {
    body: result.stream,
    contentType: result.blob.contentType || opts.contentType || 'application/octet-stream',
  };
}

export async function deleteStoredResume(opts: {
  storage: 'vercel_blob' | 'local';
  url: string;
  pathname: string;
}): Promise<void> {
  try {
    if (opts.storage === 'local') {
      const fileName = path.basename(opts.pathname);
      const fullPath = path.join(getLocalResumesDir(), fileName);
      await unlink(fullPath);
      return;
    }
    if (isVercelBlobConfigured()) {
      await del(opts.url);
    }
  } catch (err) {
    console.warn('[resumeStorage] Não foi possível remover o arquivo do storage:', err);
  }
}
