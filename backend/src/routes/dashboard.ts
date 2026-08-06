import { Router } from 'express';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import type { DashboardStats } from '../types.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [totals, porProduto, porSolicitante, porCategoria] = await Promise.all([
      query<{ total_clientes: string; total_solicitacoes: string; pendentes: string; cancelados: string }>(
        `SELECT
          (SELECT COUNT(*) FROM clientes)::text AS total_clientes,
          (SELECT COUNT(*) FROM solicitacoes_cobranca)::text AS total_solicitacoes,
          (SELECT COUNT(*) FROM solicitacoes_cobranca WHERE status = 'pendente')::text AS pendentes,
          (SELECT COUNT(*) FROM solicitacoes_cobranca WHERE status = 'cancelado')::text AS cancelados`
      ),
      query<{ produto: string; total: string }>(
        `SELECT COALESCE(tp.nome_normalizado, 'N/A') AS produto, COUNT(*)::text AS total
         FROM solicitacoes_cobranca s
         LEFT JOIN tipos_produto tp ON tp.id = s.tipo_produto_id
         GROUP BY tp.nome_normalizado
         ORDER BY COUNT(*) DESC`
      ),
      query<{ solicitante: string; total: string }>(
        `SELECT COALESCE(sol.nome, 'N/A') AS solicitante, COUNT(*)::text AS total
         FROM solicitacoes_cobranca s
         LEFT JOIN solicitantes sol ON sol.id = s.solicitante_id
         GROUP BY sol.nome
         ORDER BY COUNT(*) DESC`
      ),
      query<{ categoria: string; descricao: string; total: string }>(
        `SELECT COALESCE(cm.codigo, 'outros') AS categoria, COALESCE(cm.descricao, 'Outros') AS descricao, COUNT(*)::text AS total
         FROM solicitacoes_cobranca s
         LEFT JOIN categorias_motivo cm ON cm.id = s.categoria_motivo_id
         GROUP BY cm.codigo, cm.descricao
         ORDER BY COUNT(*) DESC`
      ),
    ]);

    const stats: DashboardStats & { por_categoria: { categoria: string; descricao: string; total: number }[] } = {
      total_clientes: parseInt(totals.rows[0].total_clientes, 10),
      total_solicitacoes: parseInt(totals.rows[0].total_solicitacoes, 10),
      pendentes: parseInt(totals.rows[0].pendentes, 10),
      cancelados: parseInt(totals.rows[0].cancelados, 10),
      por_produto: porProduto.rows.map((r) => ({ produto: r.produto, total: parseInt(r.total, 10) })),
      por_solicitante: porSolicitante.rows.map((r) => ({ solicitante: r.solicitante, total: parseInt(r.total, 10) })),
      por_categoria: porCategoria.rows.map((r) => ({
        categoria: r.categoria,
        descricao: r.descricao,
        total: parseInt(r.total, 10),
      })),
    };

    res.json(stats);
  } catch (err) {
    logDbError('GET /api/dashboard', err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

export default router;
