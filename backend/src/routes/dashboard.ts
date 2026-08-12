import { Router } from 'express';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import { getOrCreateCompetencia } from '../services/faturamento.js';
import { requireAuth } from '../middleware/auth.js';
import type { DashboardStats } from '../types.js';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const now = new Date();
    const ano = now.getFullYear();
    const mes = now.getMonth() + 1;
    const competenciaId = await getOrCreateCompetencia(ano, mes);

    const [totals, porProduto, porSolicitante, porCategoria, mensal, liberacoesPendentes, prazoVencido] =
      await Promise.all([
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
      query<{
        total: string;
        prontos: string;
        aguardando: string;
        rascunho: string;
        valor_total: string;
      }>(
        `SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'pronto_emissao')::text AS prontos,
          COUNT(*) FILTER (WHERE status = 'aguardando_liberacao')::text AS aguardando,
          COUNT(*) FILTER (WHERE status = 'rascunho')::text AS rascunho,
          COALESCE(SUM(valor_total) FILTER (WHERE status = 'pronto_emissao'), 0)::text AS valor_total
         FROM faturamentos_mensais WHERE competencia_id = $1`,
        [competenciaId]
      ),
      query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM faturamento_liberacoes fl
         JOIN faturamentos_mensais fm ON fm.id = fl.faturamento_id
         WHERE fm.competencia_id = $1 AND fl.status = 'pendente'`,
        [competenciaId]
      ),
      query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM faturamentos_mensais fm
         JOIN clientes_config cc ON cc.cliente_id = fm.cliente_id
         WHERE fm.competencia_id = $1
           AND cc.dia_limite_emissao IS NOT NULL
           AND EXTRACT(DAY FROM NOW()) > cc.dia_limite_emissao`,
        [competenciaId]
      ),
    ]);

    const stats: DashboardStats = {
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
      mensal: {
        ano,
        mes,
        total_clientes: parseInt(mensal.rows[0]?.total ?? '0', 10),
        prontos: parseInt(mensal.rows[0]?.prontos ?? '0', 10),
        aguardando_liberacao: parseInt(mensal.rows[0]?.aguardando ?? '0', 10),
        rascunho: parseInt(mensal.rows[0]?.rascunho ?? '0', 10),
        valor_total_prontos: parseFloat(mensal.rows[0]?.valor_total ?? '0'),
        liberacoes_pendentes: parseInt(liberacoesPendentes.rows[0]?.total ?? '0', 10),
        prazo_emissao_vencido: parseInt(prazoVencido.rows[0]?.total ?? '0', 10),
      },
    };

    res.json(stats);
  } catch (err) {
    logDbError('GET /api/dashboard', err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

export default router;
