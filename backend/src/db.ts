import pg from 'pg';
import dotenv from 'dotenv';
import { logDbError } from './utils/db-error.js';

dotenv.config();

const { Pool } = pg;

function shouldUseSsl(connectionString: string): boolean {
  if (process.env.PGSSLMODE === 'require') return true;
  if (/sslmode=(require|verify-full|verify-ca)/i.test(connectionString)) return true;

  // Railway Postgres (URL pública ou rede interna) exige SSL
  if (/\.railway\.(app|internal)/i.test(connectionString)) return true;

  return false;
}

function buildPoolConfig(): pg.PoolConfig {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://assessoria:assessoria@localhost:55432/assessoria_cobrancas';

  const config: pg.PoolConfig = {
    connectionString,
    connectionTimeoutMillis: 5_000,
  };

  if (shouldUseSsl(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
    console.log('[db] SSL habilitado para conexão Postgres');
  }

  return config;
}

export const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  logDbError('pool error (cliente idle)', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}

export type DbHealthStatus = {
  connected: boolean;
  schemaReady: boolean;
  error?: string;
};

export async function checkDbHealth(): Promise<DbHealthStatus> {
  try {
    await pool.query('SELECT 1');
    const tables = await pool.query<{ clientes: string | null }>(
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
