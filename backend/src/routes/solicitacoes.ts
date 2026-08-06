import { Router } from 'express';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import type { FiltrosSolicitacao, SolicitacaoCobranca, status_cobranca } from '../types.js';
import { solicitacaoSelectQuery } from './solicitacoes-select.js';
import {
  getOrCreateCliente,
  normalizeCnpj,
  resolveCategoria,
  resolveEmpresaId,
  resolveSolicitanteId,
  resolveTipoProdutoId,
  upsertClienteConfig,
} from '../services/entities.js';

const router = Router();

function buildFilters(filtros: FiltrosSolicitacao) {
  const params: unknown[] = [];
  const conditions: string[] = ['1=1'];

  if (filtros.busca) {
    params.push(`%${filtros.busca}%`);
    conditions.push(
      `(c.razao_social ILIKE $${params.length} OR c.cnpj ILIKE $${params.length} OR s.motivo_original ILIKE $${params.length})`
    );
  }
  if (filtros.tipo_produto) {
    params.push(filtros.tipo_produto);
    conditions.push(`tp.nome_normalizado = $${params.length}`);
  }
  if (filtros.categoria_motivo) {
    params.push(filtros.categoria_motivo);
    conditions.push(`cm.codigo = $${params.length}`);
  }
  if (filtros.status) {
    params.push(filtros.status);
    conditions.push(`s.status = $${params.length}`);
  }
  if (filtros.solicitante) {
    params.push(filtros.solicitante);
    conditions.push(`sol.nome = $${params.length}`);
  }
  if (filtros.empresa_emissora) {
    params.push(filtros.empresa_emissora);
    conditions.push(`ee.nome = $${params.length}`);
  }
  if (filtros.cliente_novo === 'true') {
    conditions.push('s.cliente_novo = TRUE');
  } else if (filtros.cliente_novo === 'false') {
    conditions.push('s.cliente_novo = FALSE');
  }
  if (filtros.vencimento_de) {
    params.push(filtros.vencimento_de);
    conditions.push(`s.data_vencimento >= $${params.length}::date`);
  }
  if (filtros.vencimento_ate) {
    params.push(filtros.vencimento_ate);
    conditions.push(`s.data_vencimento <= $${params.length}::date`);
  }

  return { where: conditions.join(' AND '), params };
}

const selectQuery = solicitacaoSelectQuery;

router.post('/', async (req, res) => {
  try {
    const body = req.body as {
      cliente_id?: number;
      razao_social?: string;
      cnpj?: string;
      valor_boleto?: number | string;
      data_vencimento?: string;
      tipo_produto?: string;
      motivo: string;
      categoria_motivo?: string;
      solicitante?: string;
      cliente_novo?: boolean;
      observacoes?: string;
      empresa_emissora?: string;
      email_contato?: string;
      status?: status_cobranca;
    };

    const motivo = body.motivo?.trim();
    if (!motivo) {
      res.status(400).json({ error: 'Motivo é obrigatório' });
      return;
    }

    let clienteId = body.cliente_id;
    if (!clienteId) {
      const razaoSocial = body.razao_social?.trim();
      if (!razaoSocial) {
        res.status(400).json({ error: 'Informe cliente_id ou razão social' });
        return;
      }
      const cnpj = normalizeCnpj(body.cnpj);
      clienteId = await getOrCreateCliente(razaoSocial, cnpj);
    } else {
      const exists = await query('SELECT id FROM clientes WHERE id = $1', [clienteId]);
      if (!exists.rows[0]) {
        res.status(404).json({ error: 'Cliente não encontrado' });
        return;
      }
    }

    const tipoProdutoId = await resolveTipoProdutoId(body.tipo_produto);
    const empresaId = await resolveEmpresaId(body.empresa_emissora);
    const solicitanteId = await resolveSolicitanteId(body.solicitante);
    const { categoriaId, status: inferredStatus } = await resolveCategoria(motivo, body.categoria_motivo);

    const validStatuses: status_cobranca[] = [
      'pendente', 'em_processamento', 'emitido', 'cancelado', 'alterado', 'correcao',
    ];
    const status = body.status && validStatuses.includes(body.status) ? body.status : inferredStatus;

    let valorBoleto: number | null = null;
    if (body.valor_boleto != null && body.valor_boleto !== '') {
      const parsed = typeof body.valor_boleto === 'number'
        ? body.valor_boleto
        : parseFloat(String(body.valor_boleto).replace(/\./g, '').replace(',', '.'));
      valorBoleto = Number.isFinite(parsed) ? parsed : null;
    }

    const dataVencimento = body.data_vencimento?.trim() || null;
    const email = body.email_contato?.trim() || null;
    const observacoes = body.observacoes?.trim() || null;
    const now = new Date();

    const inserted = await query<{ id: number }>(
      `INSERT INTO solicitacoes_cobranca (
        cliente_id, carimbo_data_hora,
        valor_boleto, data_vencimento,
        tipo_produto_id, motivo_original, categoria_motivo_id,
        solicitante_id, cliente_novo, observacoes,
        empresa_emissora_id, email_contato, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id`,
      [
        clienteId,
        now,
        valorBoleto,
        dataVencimento,
        tipoProdutoId,
        motivo,
        categoriaId,
        solicitanteId,
        body.cliente_novo ?? false,
        observacoes,
        empresaId,
        email,
        status,
      ]
    );

    await upsertClienteConfig(clienteId, tipoProdutoId, empresaId, email, observacoes);

    const result = await query<SolicitacaoCobranca>(
      `${selectQuery} WHERE s.id = $1`,
      [inserted.rows[0].id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logDbError('POST /api/solicitacoes', err);
    res.status(500).json({ error: 'Erro ao criar solicitação' });
  }
});

router.get('/', async (req, res) => {
  try {
    const filtros: FiltrosSolicitacao = {
      busca: req.query.busca as string,
      tipo_produto: req.query.tipo_produto as string,
      categoria_motivo: req.query.categoria_motivo as string,
      status: req.query.status as string,
      solicitante: req.query.solicitante as string,
      empresa_emissora: req.query.empresa_emissora as string,
      cliente_novo: req.query.cliente_novo as string,
      vencimento_de: req.query.vencimento_de as string,
      vencimento_ate: req.query.vencimento_ate as string,
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
    };

    const { where, params } = buildFilters(filtros);
    const offset = (filtros.page! - 1) * filtros.limit!;

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM solicitacoes_cobranca s
       JOIN clientes c ON c.id = s.cliente_id
       LEFT JOIN tipos_produto tp ON tp.id = s.tipo_produto_id
       LEFT JOIN categorias_motivo cm ON cm.id = s.categoria_motivo_id
       LEFT JOIN solicitantes sol ON sol.id = s.solicitante_id
       LEFT JOIN empresas_emissoras ee ON ee.id = s.empresa_emissora_id
       WHERE ${where}`,
      params
    );

    const dataParams = [...params, filtros.limit, offset];
    const result = await query<SolicitacaoCobranca>(
      `${selectQuery}
       WHERE ${where}
       ORDER BY s.carimbo_data_hora DESC NULLS LAST, s.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      page: filtros.page,
      limit: filtros.limit,
    });
  } catch (err) {
    logDbError('GET /api/solicitacoes', err);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

router.get('/filtros', async (_req, res) => {
  try {
    const [tipos, categorias, solicitantes, empresas, statuses] = await Promise.all([
      query<{ nome: string; nome_normalizado: string }>(
        'SELECT nome, nome_normalizado FROM tipos_produto ORDER BY nome'
      ),
      query<{ codigo: string; descricao: string }>(
        'SELECT codigo, descricao FROM categorias_motivo ORDER BY id'
      ),
      query<{ nome: string }>('SELECT nome FROM solicitantes ORDER BY nome'),
      query<{ nome: string }>('SELECT nome FROM empresas_emissoras ORDER BY nome'),
      query<{ status: status_cobranca }>(
        "SELECT unnest(enum_range(NULL::status_cobranca))::text AS status"
      ),
    ]);

    res.json({
      tipos_produto: tipos.rows,
      categorias_motivo: categorias.rows,
      solicitantes: solicitantes.rows.map((r) => r.nome),
      empresas_emissoras: empresas.rows.map((r) => r.nome),
      statuses: statuses.rows.map((r) => r.status),
    });
  } catch (err) {
    logDbError('GET /api/solicitacoes/filtros', err);
    res.status(500).json({ error: 'Erro ao carregar filtros' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body as { status: status_cobranca };

    const validStatuses: status_cobranca[] = [
      'pendente', 'em_processamento', 'emitido', 'cancelado', 'alterado', 'correcao',
    ];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }

    const result = await query(
      'UPDATE solicitacoes_cobranca SET status = $1 WHERE id = $2 RETURNING id',
      [status, id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Solicitação não encontrada' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logDbError('PATCH /api/solicitacoes/:id/status', err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query<SolicitacaoCobranca>(
      `${selectQuery} WHERE s.id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Solicitação não encontrada' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    logDbError('GET /api/solicitacoes/:id', err);
    res.status(500).json({ error: 'Erro ao buscar solicitação' });
  }
});

export default router;
