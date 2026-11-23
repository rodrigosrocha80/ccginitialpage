import { Pool, type PoolConfig } from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  slugify,
  type Candidatura,
  type CandidaturaInput,
  type CandidaturaStatus,
  type CandidaturaUpdateInput,
  type Vaga,
  type VagaContrato,
  type VagaInput,
  type VagaModalidade,
  type VagaStatus,
} from './careersSchema';
import { isProdEnvironment } from './adminAuth';

function getEnv(key: string): string | undefined {
  const fromImportMeta = (import.meta.env as Record<string, string | undefined>)[key];
  return fromImportMeta || process.env[key];
}

function getDatabaseUrl(): string | undefined {
  return (
    getEnv('DATABASE_URL')?.trim() ||
    getEnv('POSTGRES_URL')?.trim() ||
    getEnv('NEON_DATABASE_URL')?.trim()
  );
}

function hasDiscretePgConfig(): boolean {
  return Boolean(getEnv('PGHOST')?.trim() && getEnv('PGUSER')?.trim());
}

export function isPostgresConfigured(): boolean {
  return Boolean(getDatabaseUrl() || hasDiscretePgConfig());
}

export function isUsingLocalFallback(): boolean {
  return !isPostgresConfigured() && !isProdEnvironment();
}

function resolveSslOption(connectionString?: string): PoolConfig['ssl'] {
  const pgSsl = getEnv('PGSSL')?.trim().toLowerCase();
  if (pgSsl === 'true' || pgSsl === '1' || pgSsl === 'require') {
    return { rejectUnauthorized: false };
  }
  if (pgSsl === 'false' || pgSsl === '0' || pgSsl === 'disable') {
    return false;
  }
  if (connectionString) {
    if (
      connectionString.includes('sslmode=require') ||
      connectionString.includes('neon.tech') ||
      connectionString.includes('supabase.co')
    ) {
      return { rejectUnauthorized: false };
    }
  }
  return false;
}

let _pool: Pool | null = null;
let _schemaReady = false;

function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = getDatabaseUrl();
  if (connectionString) {
    _pool = new Pool({
      connectionString,
      ssl: resolveSslOption(connectionString),
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
    return _pool;
  }

  if (hasDiscretePgConfig()) {
    const user = getEnv('PGUSER')!.trim();
    _pool = new Pool({
      host: getEnv('PGHOST')!.trim(),
      port: Number(getEnv('PGPORT') || 5432),
      user,
      password: getEnv('PGPASSWORD') || '',
      database: getEnv('PGDATABASE')?.trim() || user,
      ssl: resolveSslOption(),
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
    return _pool;
  }

  throw new Error(
    'Banco de dados PostgreSQL não configurado. Defina DATABASE_URL ou PGHOST/PGUSER/PGPASSWORD.'
  );
}

async function ensurePostgresSchema(): Promise<Pool> {
  const pool = getPool();
  if (_schemaReady) return pool;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vagas (
      id UUID PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      titulo TEXT NOT NULL,
      area TEXT NOT NULL,
      localidade TEXT NOT NULL,
      modalidade TEXT NOT NULL,
      tipo_contrato TEXT NOT NULL,
      faixa_salarial TEXT,
      quantidade INTEGER NOT NULL DEFAULT 1,
      resumo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      requisitos TEXT NOT NULL,
      diferenciais TEXT,
      beneficios TEXT,
      status TEXT NOT NULL DEFAULT 'aberta',
      destaque BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidaturas (
      id UUID PRIMARY KEY,
      vaga_id UUID REFERENCES vagas(id) ON DELETE SET NULL,
      vaga_titulo TEXT NOT NULL,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      telefone TEXT NOT NULL,
      cidade_uf TEXT NOT NULL,
      cpf TEXT,
      cnh TEXT,
      experiencia_resumo TEXT NOT NULL,
      pretensao_salarial TEXT,
      linkedin_url TEXT,
      mensagem TEXT,
      curriculo_url TEXT NOT NULL,
      curriculo_pathname TEXT NOT NULL,
      curriculo_nome TEXT NOT NULL,
      curriculo_tipo TEXT NOT NULL,
      curriculo_tamanho INTEGER NOT NULL,
      curriculo_storage TEXT NOT NULL DEFAULT 'vercel_blob',
      consentimento_lgpd BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'nova',
      notas_rh TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_candidaturas_vaga_id ON candidaturas(vaga_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_candidaturas_status ON candidaturas(status)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_candidaturas_created_at ON candidaturas(created_at DESC)`
  );

  _schemaReady = true;
  return pool;
}

// ---------- Fallback local JSON (apenas desenvolvimento sem DATABASE_URL) ----------

interface LocalStoreData {
  vagas: Vaga[];
  candidaturas: Candidatura[];
}

function getLocalDbPath(): string {
  return path.join(process.cwd(), '.local-data', 'careers.json');
}

async function readLocalStore(): Promise<LocalStoreData> {
  const filePath = getLocalDbPath();
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
    return {
      vagas: Array.isArray(parsed.vagas) ? parsed.vagas : [],
      candidaturas: Array.isArray(parsed.candidaturas) ? parsed.candidaturas : [],
    };
  } catch {
    return { vagas: [], candidaturas: [] };
  }
}

async function writeLocalStore(data: LocalStoreData): Promise<void> {
  const filePath = getLocalDbPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- Mappers SQL -> Domain ----------

function mapVagaRow(row: Record<string, unknown>): Vaga {
  return {
    id: String(row.id),
    slug: String(row.slug),
    titulo: String(row.titulo),
    area: String(row.area),
    localidade: String(row.localidade),
    modalidade: String(row.modalidade) as VagaModalidade,
    tipoContrato: String(row.tipo_contrato) as VagaContrato,
    faixaSalarial: row.faixa_salarial ? String(row.faixa_salarial) : null,
    quantidade: Number(row.quantidade ?? 1),
    resumo: String(row.resumo),
    descricao: String(row.descricao),
    requisitos: String(row.requisitos),
    diferenciais: row.diferenciais ? String(row.diferenciais) : null,
    beneficios: row.beneficios ? String(row.beneficios) : null,
    status: String(row.status) as VagaStatus,
    destaque: Boolean(row.destaque),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    totalCandidaturas:
      row.total_candidaturas !== undefined ? Number(row.total_candidaturas) : undefined,
  };
}

function mapCandidaturaRow(row: Record<string, unknown>): Candidatura {
  return {
    id: String(row.id),
    vagaId: row.vaga_id ? String(row.vaga_id) : null,
    vagaTitulo: String(row.vaga_titulo),
    nome: String(row.nome),
    email: String(row.email),
    telefone: String(row.telefone),
    cidadeUf: String(row.cidade_uf),
    cpf: row.cpf ? String(row.cpf) : null,
    cnh: row.cnh ? String(row.cnh) : null,
    experienciaResumo: String(row.experiencia_resumo),
    pretensaoSalarial: row.pretensao_salarial ? String(row.pretensao_salarial) : null,
    linkedinUrl: row.linkedin_url ? String(row.linkedin_url) : null,
    mensagem: row.mensagem ? String(row.mensagem) : null,
    curriculoUrl: String(row.curriculo_url),
    curriculoPathname: String(row.curriculo_pathname),
    curriculoNome: String(row.curriculo_nome),
    curriculoTipo: String(row.curriculo_tipo),
    curriculoTamanho: Number(row.curriculo_tamanho),
    curriculoStorage: row.curriculo_storage === 'local' ? 'local' : 'vercel_blob',
    consentimentoLgpd: Boolean(row.consentimento_lgpd),
    status: String(row.status) as CandidaturaStatus,
    notasRh: row.notas_rh ? String(row.notas_rh) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

// ---------- Vagas CRUD ----------

export async function listPublicVagas(): Promise<Vaga[]> {
  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    return store.vagas
      .filter((v) => v.status === 'aberta')
      .sort((a, b) => Number(b.destaque) - Number(a.destaque) || b.createdAt.localeCompare(a.createdAt));
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(`
    SELECT * FROM vagas
    WHERE status = 'aberta'
    ORDER BY destaque DESC, created_at DESC
  `);
  return rows.map((r) => mapVagaRow(r as Record<string, unknown>));
}

export async function listAllVagasWithCounts(): Promise<Vaga[]> {
  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    return store.vagas
      .map((v) => ({
        ...v,
        totalCandidaturas: store.candidaturas.filter((c) => c.vagaId === v.id).length,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(`
    SELECT
      v.*,
      COUNT(c.id)::int AS total_candidaturas
    FROM vagas v
    LEFT JOIN candidaturas c ON c.vaga_id = v.id
    GROUP BY v.id
    ORDER BY v.created_at DESC
  `);
  return rows.map((r) => mapVagaRow(r as Record<string, unknown>));
}

export async function getVagaById(id: string): Promise<Vaga | null> {
  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    return store.vagas.find((v) => v.id === id) || null;
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(`SELECT * FROM vagas WHERE id = $1::uuid LIMIT 1`, [id]);
  return rows[0] ? mapVagaRow(rows[0] as Record<string, unknown>) : null;
}

export async function createVaga(input: VagaInput): Promise<Vaga> {
  const id = randomUUID();
  const baseSlug = slugify(input.slug || input.titulo) || `vaga-${Date.now()}`;
  const uniqueSlug = `${baseSlug}-${id.slice(0, 6)}`;

  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    const now = new Date().toISOString();
    const vaga: Vaga = {
      id,
      slug: uniqueSlug,
      titulo: input.titulo,
      area: input.area,
      localidade: input.localidade,
      modalidade: input.modalidade,
      tipoContrato: input.tipoContrato,
      faixaSalarial: input.faixaSalarial || null,
      quantidade: input.quantidade,
      resumo: input.resumo,
      descricao: input.descricao,
      requisitos: input.requisitos,
      diferenciais: input.diferenciais || null,
      beneficios: input.beneficios || null,
      status: input.status,
      destaque: input.destaque,
      createdAt: now,
      updatedAt: now,
      totalCandidaturas: 0,
    };
    store.vagas.unshift(vaga);
    await writeLocalStore(store);
    return vaga;
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(
    `
      INSERT INTO vagas (
        id, slug, titulo, area, localidade, modalidade, tipo_contrato,
        faixa_salarial, quantidade, resumo, descricao, requisitos,
        diferenciais, beneficios, status, destaque
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16
      )
      RETURNING *
    `,
    [
      id,
      uniqueSlug,
      input.titulo,
      input.area,
      input.localidade,
      input.modalidade,
      input.tipoContrato,
      input.faixaSalarial || null,
      input.quantidade,
      input.resumo,
      input.descricao,
      input.requisitos,
      input.diferenciais || null,
      input.beneficios || null,
      input.status,
      input.destaque,
    ]
  );
  return { ...mapVagaRow(rows[0] as Record<string, unknown>), totalCandidaturas: 0 };
}

export async function updateVaga(id: string, input: Partial<VagaInput>): Promise<Vaga | null> {
  const existing = await getVagaById(id);
  if (!existing) return null;

  const merged: VagaInput = {
    titulo: input.titulo ?? existing.titulo,
    slug: input.slug ?? existing.slug,
    area: input.area ?? existing.area,
    localidade: input.localidade ?? existing.localidade,
    modalidade: input.modalidade ?? existing.modalidade,
    tipoContrato: input.tipoContrato ?? existing.tipoContrato,
    faixaSalarial: input.faixaSalarial !== undefined ? input.faixaSalarial : existing.faixaSalarial,
    quantidade: input.quantidade ?? existing.quantidade,
    resumo: input.resumo ?? existing.resumo,
    descricao: input.descricao ?? existing.descricao,
    requisitos: input.requisitos ?? existing.requisitos,
    diferenciais: input.diferenciais !== undefined ? input.diferenciais : existing.diferenciais,
    beneficios: input.beneficios !== undefined ? input.beneficios : existing.beneficios,
    status: input.status ?? existing.status,
    destaque: input.destaque ?? existing.destaque,
  };

  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    const idx = store.vagas.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    const updated: Vaga = {
      ...store.vagas[idx],
      ...merged,
      faixaSalarial: merged.faixaSalarial || null,
      diferenciais: merged.diferenciais || null,
      beneficios: merged.beneficios || null,
      updatedAt: new Date().toISOString(),
    };
    store.vagas[idx] = updated;
    await writeLocalStore(store);
    return {
      ...updated,
      totalCandidaturas: store.candidaturas.filter((c) => c.vagaId === id).length,
    };
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(
    `
      UPDATE vagas
      SET
        titulo = $1,
        area = $2,
        localidade = $3,
        modalidade = $4,
        tipo_contrato = $5,
        faixa_salarial = $6,
        quantidade = $7,
        resumo = $8,
        descricao = $9,
        requisitos = $10,
        diferenciais = $11,
        beneficios = $12,
        status = $13,
        destaque = $14,
        updated_at = NOW()
      WHERE id = $15::uuid
      RETURNING *
    `,
    [
      merged.titulo,
      merged.area,
      merged.localidade,
      merged.modalidade,
      merged.tipoContrato,
      merged.faixaSalarial || null,
      merged.quantidade,
      merged.resumo,
      merged.descricao,
      merged.requisitos,
      merged.diferenciais || null,
      merged.beneficios || null,
      merged.status,
      merged.destaque,
      id,
    ]
  );
  return rows[0] ? mapVagaRow(rows[0] as Record<string, unknown>) : null;
}

export async function deleteVaga(id: string): Promise<boolean> {
  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    const before = store.vagas.length;
    store.vagas = store.vagas.filter((v) => v.id !== id);
    if (store.vagas.length === before) return false;
    store.candidaturas = store.candidaturas.map((c) =>
      c.vagaId === id ? { ...c, vagaId: null } : c
    );
    await writeLocalStore(store);
    return true;
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(`DELETE FROM vagas WHERE id = $1::uuid RETURNING id`, [id]);
  return rows.length > 0;
}

// ---------- Candidaturas CRUD ----------

export async function createCandidatura(
  input: CandidaturaInput,
  resolvedVagaTitulo: string
): Promise<Candidatura> {
  const id = randomUUID();
  const vagaId = input.vagaId || null;

  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    const now = new Date().toISOString();
    const item: Candidatura = {
      id,
      vagaId,
      vagaTitulo: resolvedVagaTitulo,
      nome: input.nome,
      email: input.email,
      telefone: input.telefone,
      cidadeUf: input.cidadeUf,
      cpf: input.cpf || null,
      cnh: input.cnh || null,
      experienciaResumo: input.experienciaResumo,
      pretensaoSalarial: input.pretensaoSalarial || null,
      linkedinUrl: input.linkedinUrl || null,
      mensagem: input.mensagem || null,
      curriculoUrl: input.curriculoUrl,
      curriculoPathname: input.curriculoPathname,
      curriculoNome: input.curriculoNome,
      curriculoTipo: input.curriculoTipo,
      curriculoTamanho: input.curriculoTamanho,
      curriculoStorage: input.curriculoStorage,
      consentimentoLgpd: input.consentimentoLgpd,
      status: 'nova',
      notasRh: null,
      createdAt: now,
      updatedAt: now,
    };
    store.candidaturas.unshift(item);
    await writeLocalStore(store);
    return item;
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(
    `
      INSERT INTO candidaturas (
        id, vaga_id, vaga_titulo, nome, email, telefone, cidade_uf,
        cpf, cnh, experiencia_resumo, pretensao_salarial, linkedin_url, mensagem,
        curriculo_url, curriculo_pathname, curriculo_nome, curriculo_tipo,
        curriculo_tamanho, curriculo_storage, consentimento_lgpd
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20
      )
      RETURNING *
    `,
    [
      id,
      vagaId,
      resolvedVagaTitulo,
      input.nome,
      input.email,
      input.telefone,
      input.cidadeUf,
      input.cpf || null,
      input.cnh || null,
      input.experienciaResumo,
      input.pretensaoSalarial || null,
      input.linkedinUrl || null,
      input.mensagem || null,
      input.curriculoUrl,
      input.curriculoPathname,
      input.curriculoNome,
      input.curriculoTipo,
      input.curriculoTamanho,
      input.curriculoStorage,
      input.consentimentoLgpd,
    ]
  );
  return mapCandidaturaRow(rows[0] as Record<string, unknown>);
}

export async function listCandidaturas(filters?: {
  vagaId?: string;
  status?: string;
  search?: string;
}): Promise<Candidatura[]> {
  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    let list = [...store.candidaturas];
    if (filters?.vagaId === '__banco__') {
      list = list.filter((c) => !c.vagaId);
    } else if (filters?.vagaId) {
      list = list.filter((c) => c.vagaId === filters.vagaId);
    }
    if (filters?.status) {
      list = list.filter((c) => c.status === filters.status);
    }
    if (filters?.search) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.cidadeUf.toLowerCase().includes(q) ||
          c.vagaTitulo.toLowerCase().includes(q) ||
          c.experienciaResumo.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(`
    SELECT * FROM candidaturas
    ORDER BY created_at DESC
    LIMIT 500
  `);

  let list = rows.map((r) => mapCandidaturaRow(r as Record<string, unknown>));
  if (filters?.vagaId === '__banco__') {
    list = list.filter((c) => !c.vagaId);
  } else if (filters?.vagaId) {
    list = list.filter((c) => c.vagaId === filters.vagaId);
  }
  if (filters?.status) {
    list = list.filter((c) => c.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.cidadeUf.toLowerCase().includes(q) ||
        c.vagaTitulo.toLowerCase().includes(q) ||
        c.experienciaResumo.toLowerCase().includes(q)
    );
  }
  return list;
}

export async function getCandidaturaById(id: string): Promise<Candidatura | null> {
  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    return store.candidaturas.find((c) => c.id === id) || null;
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(`SELECT * FROM candidaturas WHERE id = $1::uuid LIMIT 1`, [id]);
  return rows[0] ? mapCandidaturaRow(rows[0] as Record<string, unknown>) : null;
}

export async function updateCandidatura(
  id: string,
  input: CandidaturaUpdateInput
): Promise<Candidatura | null> {
  const existing = await getCandidaturaById(id);
  if (!existing) return null;

  const status = input.status ?? existing.status;
  const notasRh = input.notasRh !== undefined ? input.notasRh : existing.notasRh;

  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    const idx = store.candidaturas.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated: Candidatura = {
      ...store.candidaturas[idx],
      status,
      notasRh: notasRh || null,
      updatedAt: new Date().toISOString(),
    };
    store.candidaturas[idx] = updated;
    await writeLocalStore(store);
    return updated;
  }

  const pool = await ensurePostgresSchema();
  const { rows } = await pool.query(
    `
      UPDATE candidaturas
      SET status = $1, notas_rh = $2, updated_at = NOW()
      WHERE id = $3::uuid
      RETURNING *
    `,
    [status, notasRh || null, id]
  );
  return rows[0] ? mapCandidaturaRow(rows[0] as Record<string, unknown>) : null;
}

export async function deleteCandidatura(id: string): Promise<Candidatura | null> {
  const existing = await getCandidaturaById(id);
  if (!existing) return null;

  if (isUsingLocalFallback()) {
    const store = await readLocalStore();
    store.candidaturas = store.candidaturas.filter((c) => c.id !== id);
    await writeLocalStore(store);
    return existing;
  }

  const pool = await ensurePostgresSchema();
  await pool.query(`DELETE FROM candidaturas WHERE id = $1::uuid`, [id]);
  return existing;
}
