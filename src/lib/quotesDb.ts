import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPostgresPool, isUsingLocalFallback } from './careersDb';
import type { QuoteInput } from './quoteSchema';

export interface OrcamentoRecord {
  id: string;
  protocolo: string;
  nome: string;
  telefone: string;
  email: string;
  equipamentoInteresse: string | null;
  mensagem: string;
  consentimentoLgpd: boolean;
  origem: string;
  status: string;
  emailEnviado: boolean;
  crmSyncStatus: 'pendente' | 'sincronizado' | 'erro';
  crmExternalId: string | null;
  crmSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

let _orcamentosSchemaReady = false;

async function ensureOrcamentosSchema() {
  const pool = getPostgresPool();
  if (_orcamentosSchemaReady) return pool;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orcamentos (
      id UUID PRIMARY KEY,
      protocolo TEXT NOT NULL,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      email TEXT NOT NULL,
      equipamento_interesse TEXT,
      mensagem TEXT NOT NULL,
      consentimento_lgpd BOOLEAN NOT NULL DEFAULT true,
      origem TEXT NOT NULL DEFAULT 'site_orcamento',
      status TEXT NOT NULL DEFAULT 'novo',
      email_enviado BOOLEAN NOT NULL DEFAULT false,
      crm_sync_status TEXT NOT NULL DEFAULT 'pendente',
      crm_external_id TEXT,
      crm_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_orcamentos_created_at ON orcamentos(created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_orcamentos_crm_sync_status ON orcamentos(crm_sync_status)`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON orcamentos(status)`);

  _orcamentosSchemaReady = true;
  return pool;
}

function mapOrcamentoRow(row: Record<string, unknown>): OrcamentoRecord {
  const syncRaw = String(row.crm_sync_status || 'pendente');
  const crmSyncStatus =
    syncRaw === 'sincronizado' || syncRaw === 'erro' ? syncRaw : 'pendente';

  return {
    id: String(row.id),
    protocolo: String(row.protocolo),
    nome: String(row.nome),
    telefone: String(row.telefone),
    email: String(row.email),
    equipamentoInteresse: row.equipamento_interesse ? String(row.equipamento_interesse) : null,
    mensagem: String(row.mensagem),
    consentimentoLgpd: Boolean(row.consentimento_lgpd),
    origem: String(row.origem || 'site_orcamento'),
    status: String(row.status || 'novo'),
    emailEnviado: Boolean(row.email_enviado),
    crmSyncStatus,
    crmExternalId: row.crm_external_id ? String(row.crm_external_id) : null,
    crmSyncedAt: row.crm_synced_at ? new Date(String(row.crm_synced_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function getLocalOrcamentosPath(): string {
  return path.join(process.cwd(), '.local-data', 'orcamentos.json');
}

async function readLocalOrcamentos(): Promise<OrcamentoRecord[]> {
  try {
    const raw = await readFile(getLocalOrcamentosPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as OrcamentoRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeLocalOrcamentos(items: OrcamentoRecord[]): Promise<void> {
  const filePath = getLocalOrcamentosPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(items, null, 2), 'utf8');
}

export async function createOrcamento(input: QuoteInput): Promise<OrcamentoRecord> {
  const id = randomUUID();
  const protocolo = id.slice(0, 8).toUpperCase();

  if (isUsingLocalFallback()) {
    const items = await readLocalOrcamentos();
    const now = new Date().toISOString();
    const record: OrcamentoRecord = {
      id,
      protocolo,
      nome: input.nome,
      telefone: input.telefone,
      email: input.email,
      equipamentoInteresse: input.equipamentoInteresse || null,
      mensagem: input.mensagem,
      consentimentoLgpd: input.consentimentoLgpd,
      origem: 'site_orcamento',
      status: 'novo',
      emailEnviado: false,
      crmSyncStatus: 'pendente',
      crmExternalId: null,
      crmSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(record);
    await writeLocalOrcamentos(items);
    return record;
  }

  const pool = await ensureOrcamentosSchema();
  const { rows } = await pool.query(
    `
      INSERT INTO orcamentos (
        id, protocolo, nome, telefone, email, equipamento_interesse, mensagem, consentimento_lgpd
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      id,
      protocolo,
      input.nome,
      input.telefone,
      input.email,
      input.equipamentoInteresse || null,
      input.mensagem,
      input.consentimentoLgpd,
    ]
  );
  return mapOrcamentoRow(rows[0] as Record<string, unknown>);
}

export async function markOrcamentoEmailSent(id: string): Promise<void> {
  if (isUsingLocalFallback()) {
    const items = await readLocalOrcamentos();
    const idx = items.findIndex((item) => item.id === id);
    if (idx !== -1) {
      items[idx] = {
        ...items[idx],
        emailEnviado: true,
        updatedAt: new Date().toISOString(),
      };
      await writeLocalOrcamentos(items);
    }
    return;
  }

  const pool = await ensureOrcamentosSchema();
  await pool.query(
    `UPDATE orcamentos SET email_enviado = true, updated_at = NOW() WHERE id = $1::uuid`,
    [id]
  );
}
