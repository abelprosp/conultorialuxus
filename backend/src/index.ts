import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import clientesRouter from './routes/clientes.js';
import solicitacoesRouter from './routes/solicitacoes.js';
import dashboardRouter from './routes/dashboard.js';
import { checkDbHealth } from './db.js';

dotenv.config();

function resolvePort(): number {
  const raw = process.env.PORT;
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    console.error(`[startup] PORT inválido: "${raw}" — usando fallback`);
  }
  return process.env.NODE_ENV === 'production' ? 8080 : 47291;
}

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  process.exit(1);
});

try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const app = express();
  const PORT = resolvePort();
  const HOST = '0.0.0.0';

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'assessoria-cobrancas' });
  });

  app.get('/api/health/db', async (_req, res) => {
    const health = await checkDbHealth();
    if (!health.connected) {
      res.status(503).json({
        status: 'error',
        db: 'disconnected',
        migration_status: process.env.MIGRATION_STATUS ?? 'unknown',
        hint: 'Confira PGHOST/PGUSER/PGPASSWORD/PGDATABASE ou DATABASE_URL no .env e logs do container',
      });
      return;
    }
    if (!health.schemaReady) {
      res.status(503).json({
        status: 'error',
        db: 'connected',
        schema: 'missing',
        migration_status: process.env.MIGRATION_STATUS ?? 'unknown',
        hint: 'Rode migrations: docker compose -f docker-compose.prod.yml exec app node backend/dist/scripts/migrate.js',
      });
      return;
    }
    res.json({
      status: 'ok',
      db: 'connected',
      schema: 'ready',
      migration_status: process.env.MIGRATION_STATUS ?? 'unknown',
    });
  });

  app.use('/api/clientes', clientesRouter);
  app.use('/api/solicitacoes', solicitacoesRouter);
  app.use('/api/dashboard', dashboardRouter);

  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.resolve(__dirname, '../../frontend/dist');
    const indexHtml = path.join(frontendDist, 'index.html');
    const distExists = fs.existsSync(frontendDist);
    const indexExists = fs.existsSync(indexHtml);

    console.log(
      `[startup] frontend dist=${frontendDist} exists=${distExists} index.html=${indexExists}`
    );

    if (!distExists || !indexExists) {
      console.error(
        '[startup] AVISO: frontend/dist ausente — a UI não será servida. Confirme Root Directory vazio e Dockerfile na raiz do repo.'
      );
    }

    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  console.log(
    `[startup] PORT=${PORT} HOST=${HOST} NODE_ENV=${process.env.NODE_ENV ?? 'unset'} DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'unset'} MIGRATION_STATUS=${process.env.MIGRATION_STATUS ?? 'unknown'}`
  );

  app.listen(PORT, HOST, async () => {
    console.log(`API rodando em http://${HOST}:${PORT}`);

    if (process.env.DATABASE_URL) {
      const health = await checkDbHealth();
      if (health.connected && health.schemaReady) {
        console.log('[startup] Banco OK — schema pronto');
      } else if (health.connected) {
        console.error('[startup] Banco conectado mas schema ausente — rode migrations');
      } else {
        console.error('[startup] Banco indisponível:', health.error ?? 'erro desconhecido');
      }
    } else {
      console.error('[startup] DATABASE_URL ausente — rotas que usam Postgres falharão');
    }
  }).on('error', (err) => {
    console.error('[fatal] falha ao abrir porta:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('[fatal] erro no startup:', err);
  process.exit(1);
}
