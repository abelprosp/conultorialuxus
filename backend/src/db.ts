import pg from 'pg';
import dotenv from 'dotenv';
import { logDbError } from './utils/db-error.js';

dotenv.config();

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

function isUnresolvedReference(value: string): boolean {
  return /^\$\{\{[^}]+\}\}$/.test(value.trim());
}

function buildUrlFromPgEnv(): string | undefined {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) return undefined;
  const port = PGPORT || '5432';
  const user = encodeURIComponent(PGUSER);
  const pass = encodeURIComponent(PGPASSWORD);
  return `postgresql://${user}:${pass}@${PGHOST}:${port}/${PGDATABASE}`;
}

export function resolveDatabaseUrl(): string | undefined {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_PUBLIC_URL,
  ];

  for (const url of candidates) {
    if (url && !isUnresolvedReference(url)) return url;
  }

  return buildUrlFromPgEnv();
}

function shouldUseSsl(connectionString: string): boolean {
  if (process.env.PGSSLMODE === 'require') return true;
  if (/sslmode=(require|verify-full|verify-ca)/i.test(connectionString)) return true;

  // Railway Postgres (URL pública ou rede interna) exige SSL
  if (/\.railway\.(app|internal)/i.test(connectionString)) return true;

  return false;
}

function buildPoolConfig(): pg.PoolConfig {
  const connectionString =
    resolveDatabaseUrl() ??
    'postgresql://assessoria:assessoria@localhost:55432/assessoria_cobrancas';

  const config: pg.PoolConfig = {
    connectionString,
    connectionTimeoutMillis: 5_000,
  };

  if (shouldUseSsl(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function logConnectionTarget(connectionString: string): void {
  const host = connectionString.match(/@([^:/]+)/)?.[1] ?? 'unknown';
  const hasEnv = Boolean(resolveDatabaseUrl());
  console.log(`[db] host=${host} env=${hasEnv ? 'set' : 'unset (fallback dev)'}`);
  if (shouldUseSsl(connectionString)) {
    console.log('[db] SSL habilitado para conexão Postgres');
  }
}

export function getPool(): pg.Pool {
  if (!poolInstance) {
    const config = buildPoolConfig();
    logConnectionTarget(config.connectionString as string);
    poolInstance = new Pool(config);
    poolInstance.on('error', (err) => {
      logDbError('pool error (cliente idle)', err);
    });
  }
  return poolInstance;
}

/** @deprecated Use getPool() — mantido para compatibilidade */
export const pool = {
  query: ((...args: Parameters<pg.Pool['query']>) =>
    getPool().query(...args)) as pg.Pool['query'],
  end: () => closePool(),
};

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}

export type DbHealthStatus = {
  connected: boolean;
  schemaReady: boolean;
  error?: string;
};

export async function checkDbHealth(): Promise<DbHealthStatus> {
  try {
    await getPool().query('SELECT 1');
    const tables = await getPool().query<{ clientes: string | null }>(
      `SELECT to_regclass('public.clientes') AS clientes`
    );
    const schemaReady = tables.rows[0]?.clientes !== null;
    return { connected: true, schemaReady };
  } catch (err) {
    logDbError('checkDbHealth', err);
    const message = err instanceof Error ? err.message : String(err);
    return { connected: false, schemaReady: false, error: message };
  }
}

export function assertDatabaseUrl(scriptName: string): void {
  if (resolveDatabaseUrl()) return;

  const raw = process.env.DATABASE_URL;
  console.error(`[${scriptName}] Não foi possível resolver URL do Postgres.`);
  console.error(`[${scriptName}] Diagnóstico:`);
  console.error(`  DATABASE_URL=${raw ? (isUnresolvedReference(raw) ? 'referência não resolvida (${{...}})' : 'presente mas inválida') : 'ausente'}`);
  console.error(`  DATABASE_PRIVATE_URL=${process.env.DATABASE_PRIVATE_URL ? 'presente' : 'ausente'}`);
  console.error(`  PGHOST=${process.env.PGHOST ?? 'ausente'}`);
  console.error(`  PGUSER=${process.env.PGUSER ? 'presente' : 'ausente'}`);
  console.error(`[${scriptName}] No Railway:`);
  console.error('  1. Apague variável errada "Postgres" (só deve existir DATABASE_URL como referência)');
  console.error('  2. DATABASE_URL = Add Reference → serviço Postgres → DATABASE_URL');
  console.error('  3. Nome do serviço Postgres no canvas deve ser exatamente "Postgres"');
  console.error('  4. Redeploy → Shell novo → cd /app && echo $DATABASE_URL');
  console.error('  5. Ou copie DATABASE_URL do Postgres → cole literal no backend');
  process.exit(1);
}
