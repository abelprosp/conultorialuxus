import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import clientesRouter from './routes/clientes.js';
import solicitacoesRouter from './routes/solicitacoes.js';
import dashboardRouter from './routes/dashboard.js';

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

  app.use('/api/clientes', clientesRouter);
  app.use('/api/solicitacoes', solicitacoesRouter);
  app.use('/api/dashboard', dashboardRouter);

  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.resolve(__dirname, '../../frontend/dist');
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  console.log(
    `[startup] PORT=${PORT} HOST=${HOST} NODE_ENV=${process.env.NODE_ENV ?? 'unset'} DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'unset'}`
  );

  app.listen(PORT, HOST, () => {
    console.log(`API rodando em http://${HOST}:${PORT}`);
  }).on('error', (err) => {
    console.error('[fatal] falha ao abrir porta:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('[fatal] erro no startup:', err);
  process.exit(1);
}
