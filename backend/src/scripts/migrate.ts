import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const schemaPath = resolve(__dirname, '../../migrations/001_schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');

  console.log('Executando migration...');
  await pool.query(sql);
  console.log('Migration concluída com sucesso.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Erro na migration:', err);
  process.exit(1);
});
