import { del, get, head } from '@vercel/blob';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ALLOWED_RESUME_MIME_TYPES,
  MAX_RESUME_BYTES,
  isAllowedResumeFile,
} from './careersSchema';
import {
  getEnv,
  isAllowedBlobUrl,
  isSafeResumePathname,
  validateResumeMagicBytes,
} from './security';

const MAX_BLOB_AGE_MS = 30 * 60 * 1000;

export function isVercelBlobReadWriteTokenConfigured(): boolean {
  return Boolean(getEnv('BLOB_READ_WRITE_TOKEN')?.trim());
}

export function isVercelBlobOidcConfigured(): boolean {
  return Boolean(getEnv('BLOB_STORE_ID')?.trim());
}

export function isVercelBlobConfigured(): boolean {
  return isVercelBlobReadWriteTokenConfigured() || isVercelBlobOidcConfigured();
}

export function getVercelBlobUploadProtocol(): 'presigned' | 'client_token' {
  return isVercelBlobOidcConfigured() && !isVercelBlobReadWriteTokenConfigured()
    ? 'presigned'
    : 'client_token';
}

function getBlobAuthOptions(): { storeId?: string } {
  if (!isVercelBlobReadWriteTokenConfigured()) {
    const storeId = getEnv('BLOB_STORE_ID')?.trim();
    if (storeId) return { storeId };
  }
  return {};
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

function mimeFromExtension(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

function whitelistResumeContentType(rawType: string | undefined, pathname: string): string {
  const normalized = (rawType || '').split(';')[0].trim().toLowerCase();
  if ((ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return mimeFromExtension(pathname);
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

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!validateResumeMagicBytes(bytes, file.name)) {
    throw new Error('O conteúdo do arquivo não corresponde a um documento PDF, DOC ou DOCX válido.');
  }

  const dir = getLocalResumesDir();
  await mkdir(dir, { recursive: true });

  const safeName = sanitizeFileName(file.name);
  const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
  const fullPath = path.join(dir, storedName);
  await writeFile(fullPath, Buffer.from(bytes));

  const pathname = `curriculos/${storedName}`;
  return {
    url: `local://${pathname}`,
    pathname,
    fileName: file.name,
    contentType: whitelistResumeContentType(file.type, pathname),
    size: file.size,
    storage: 'local',
  };
}

export async function verifyStoredResume(opts: {
  storage: 'vercel_blob' | 'local';
  pathname: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
  isProd: boolean;
}): Promise<
  | {
      ok: true;
      url: string;
      pathname: string;
      contentType: string;
      size: number;
      storage: 'vercel_blob' | 'local';
    }
  | { ok: false; message: string }
> {
  if (!isSafeResumePathname(opts.pathname)) {
    return { ok: false, message: 'Caminho do arquivo de currículo inválido.' };
  }

  if (isVercelBlobConfigured() || opts.isProd) {
    if (opts.storage !== 'vercel_blob') {
      return { ok: false, message: 'Tipo de armazenamento inválido para este ambiente.' };
    }
    if (!isVercelBlobConfigured()) {
      return { ok: false, message: 'Armazenamento de currículos indisponível.' };
    }

    try {
      const meta = await head(opts.pathname, getBlobAuthOptions());
      if (!meta || !isSafeResumePathname(meta.pathname)) {
        return { ok: false, message: 'Currículo enviado não encontrado no armazenamento.' };
      }
      if (!Number.isFinite(meta.size) || meta.size <= 0 || meta.size > MAX_RESUME_BYTES) {
        return { ok: false, message: 'Tamanho do arquivo de currículo inválido.' };
      }
      if (Date.now() - meta.uploadedAt.getTime() > MAX_BLOB_AGE_MS) {
        return {
          ok: false,
          message: 'O upload do currículo expirou. Envie o arquivo novamente.',
        };
      }

      const rawMetaType = (meta.contentType || '').split(';')[0].trim().toLowerCase();
      if (
        rawMetaType &&
        rawMetaType !== 'application/octet-stream' &&
        !(ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(rawMetaType)
      ) {
        return { ok: false, message: 'Tipo de arquivo de currículo não permitido.' };
      }

      const resolvedMime = whitelistResumeContentType(meta.contentType, meta.pathname);
      return {
        ok: true,
        url: meta.url,
        pathname: meta.pathname,
        contentType: resolvedMime,
        size: meta.size,
        storage: 'vercel_blob',
      };
    } catch {
      return {
        ok: false,
        message: 'Não foi possível validar o currículo enviado. Faça o upload novamente.',
      };
    }
  }

  if (opts.storage !== 'local') {
    return { ok: false, message: 'Tipo de armazenamento inválido.' };
  }

  const fileName = path.basename(opts.pathname);
  const fullPath = path.join(getLocalResumesDir(), fileName);
  try {
    const st = await stat(fullPath);
    if (!st.isFile() || st.size <= 0 || st.size > MAX_RESUME_BYTES) {
      return { ok: false, message: 'Arquivo de currículo inválido.' };
    }
    return {
      ok: true,
      url: `local://${opts.pathname}`,
      pathname: opts.pathname,
      contentType: whitelistResumeContentType(opts.contentType, opts.pathname),
      size: st.size,
      storage: 'local',
    };
  } catch {
    return { ok: false, message: 'Currículo não encontrado. Faça o upload novamente.' };
  }
}

export async function readResumeForDownload(opts: {
  storage: 'vercel_blob' | 'local';
  url: string;
  pathname: string;
  contentType: string;
}): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null> {
  if (!isSafeResumePathname(opts.pathname)) {
    return null;
  }

  if (opts.storage === 'local') {
    const fileName = path.basename(opts.pathname);
    const fullPath = path.join(getLocalResumesDir(), fileName);
    try {
      const buf = await readFile(fullPath);
      return {
        body: buf,
        contentType: whitelistResumeContentType(opts.contentType, opts.pathname),
      };
    } catch {
      return null;
    }
  }

  const access = getBlobAccessMode();
  const result = await get(opts.pathname, { access, ...getBlobAuthOptions() });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  return {
    body: result.stream,
    contentType: whitelistResumeContentType(
      result.blob.contentType || opts.contentType,
      opts.pathname
    ),
  };
}

export async function deleteStoredResume(opts: {
  storage: 'vercel_blob' | 'local';
  url: string;
  pathname: string;
}): Promise<void> {
  if (!isSafeResumePathname(opts.pathname)) {
    return;
  }

  try {
    if (opts.storage === 'local') {
      const fileName = path.basename(opts.pathname);
      const fullPath = path.join(getLocalResumesDir(), fileName);
      await unlink(fullPath);
      return;
    }
    if (isVercelBlobConfigured()) {
      const authOpts = getBlobAuthOptions();
      if (isSafeResumePathname(opts.pathname)) {
        await del(opts.pathname, authOpts);
      } else if (isAllowedBlobUrl(opts.url)) {
        await del(opts.url, authOpts);
      }
    }
  } catch (err) {
    console.warn('[resumeStorage] Não foi possível remover o arquivo do storage:', err);
  }
}
