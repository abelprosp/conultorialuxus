import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

function buildPoolConfig(): pg.PoolConfig {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://assessoria:assessoria@localhost:55432/assessoria_cobrancas';

  const config: pg.PoolConfig = {
    connectionString,
    // Evita hang indefinido no startup/migrate quando o Postgres ainda não está pronto
    connectionTimeoutMillis: 5_000,
  };

  if (
    process.env.PGSSLMODE === 'require' ||
    /sslmode=(require|verify-full|verify-ca)/i.test(connectionString)
  ) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

export const pool = new Pool(buildPoolConfig());

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}
