import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { assertDatabaseUrl, closePool, getPool, resolveDatabaseUrl } from '../db.js';
import { logDbError } from '../utils/db-error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../migrations');

const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForDb(): Promise<void> {
  console.log(`[migrate] Aguardando Postgres (até ${MAX_ATTEMPTS} tentativas)...`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await getPool().query('SELECT 1');
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
  const result = await getPool().query<{ clientes: string | null }>(
    `SELECT to_regclass('public.clientes') AS clientes`
  );
  return result.rows[0]?.clientes !== null;
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => resolve(MIGRATIONS_DIR, f));
}

export async function runMigration(): Promise<void> {
  const dbHost = resolveDatabaseUrl()?.match(/@([^:/]+)/)?.[1] ?? 'unknown';

  console.log(`[migrate] DATABASE_URL=${resolveDatabaseUrl() ? 'set' : 'unset'} host=${dbHost}`);

  if (!resolveDatabaseUrl()) {
    throw new Error('DATABASE_URL não definida — não é possível executar migrations');
  }

  await waitForDb();

  const files = listMigrationFiles();
  for (const schemaPath of files) {
    const sql = readFileSync(schemaPath, 'utf-8');
    console.log(`[migrate] Executando ${schemaPath}...`);
    try {
      await getPool().query(sql);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '42710' && schemaPath.endsWith('001_schema.sql')) {
        console.log('[migrate] 001 já aplicada (tipos/tabelas existentes) — continuando');
        continue;
      }
      throw err;
    }
  }

  const ready = await verifySchema();
  if (!ready) {
    throw new Error('Migration executou mas tabela public.clientes não existe');
  }

  console.log('[migrate] Migrations concluídas — schema verificado.');
}

async function main() {
  assertDatabaseUrl('migrate');
  try {
    await runMigration();
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  logDbError('migration fatal', err);
  process.exit(1);
});
