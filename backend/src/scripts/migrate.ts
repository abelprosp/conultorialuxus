import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { logDbError } from '../utils/db-error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDb(): Promise<void> {
  console.log(`[migrate] Aguardando Postgres (até ${MAX_ATTEMPTS} tentativas)...`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log(`[migrate] Conexão OK (tentativa ${attempt}/${MAX_ATTEMPTS})`);
      return;
    } catch (err) {
      logDbError(`conexão tentativa ${attempt}/${MAX_ATTEMPTS}`, err);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error('Postgres indisponível após todas as tentativas');
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function verifySchema(): Promise<boolean> {
  const result = await pool.query<{ clientes: string | null }>(
    `SELECT to_regclass('public.clientes') AS clientes`
  );
  return result.rows[0]?.clientes !== null;
}

export async function runMigration(): Promise<void> {
  const dbHost = process.env.DATABASE_URL?.match(/@([^:/]+)/)?.[1] ?? 'unknown';

  console.log(`[migrate] DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'unset'} host=${dbHost}`);

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida — não é possível executar migrations');
  }

  await waitForDb();

  const schemaPath = resolve(__dirname, '../../migrations/001_schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');

  console.log(`[migrate] Executando ${schemaPath}...`);
  await pool.query(sql);

  const ready = await verifySchema();
  if (!ready) {
    throw new Error('Migration executou mas tabela public.clientes não existe');
  }

  console.log('[migrate] Migration concluída — schema verificado.');
}

async function main() {
  try {
    await runMigration();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logDbError('migration fatal', err);
  process.exit(1);
});
