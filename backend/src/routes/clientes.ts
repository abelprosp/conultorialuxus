import { Router } from 'express';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import type { ClienteComConfig, FiltrosSolicitacao, SolicitacaoCobranca } from '../types.js';
import { solicitacaoSelectQuery } from './solicitacoes-select.js';
import {
  getOrCreateCliente,
  normalizeCnpj,
  resolveEmpresaId,
  resolveTipoProdutoId,
  upsertClienteConfig,
} from '../services/entities.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const body = req.body as {
      razao_social: string;
      cnpj?: string;
      tipo_produto?: string;
      empresa_emissora?: string;
      email_contato?: string;
      observacoes_padrao?: string;
    };

    const razaoSocial = body.razao_social?.trim();
    if (!razaoSocial) {
      res.status(400).json({ error: 'Razão social é obrigatória' });
      return;
    }

    const cnpj = normalizeCnpj(body.cnpj);
    const clienteId = await getOrCreateCliente(razaoSocial, cnpj);

    const tipoProdutoId = await resolveTipoProdutoId(body.tipo_produto);
    const empresaId = await resolveEmpresaId(body.empresa_emissora);
    const email = body.email_contato?.trim() || null;
    const observacoes = body.observacoes_padrao?.trim() || null;

    if (tipoProdutoId || empresaId || email || observacoes) {
      await upsertClienteConfig(clienteId, tipoProdutoId, empresaId, email, observacoes);
    }

    const result = await query<ClienteComConfig>(
      `SELECT
        c.id, c.razao_social, c.cnpj, c.created_at, c.updated_at,
        tp.nome AS tipo_produto,
        ee.nome AS empresa_emissora,
        cc.email_contato,
        0::int AS total_solicitacoes,
        NULL::timestamptz AS ultima_solicitacao
      FROM clientes c
      LEFT JOIN clientes_config cc ON cc.cliente_id = c.id
      LEFT JOIN tipos_produto tp ON tp.id = cc.tipo_produto_id
      LEFT JOIN empresas_emissoras ee ON ee.id = cc.empresa_emissora_id
      WHERE c.id = $1`,
      [clienteId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logDbError('POST /api/clientes', err);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body as {
      razao_social?: string;
      cnpj?: string;
      tipo_produto?: string;
      empresa_emissora?: string;
      email_contato?: string;
      observacoes_padrao?: string;
    };

    const exists = await query('SELECT id FROM clientes WHERE id = $1', [id]);
    if (!exists.rows[0]) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }

    if (body.razao_social?.trim()) {
      await query(
        'UPDATE clientes SET razao_social = $1, updated_at = NOW() WHERE id = $2',
        [body.razao_social.trim(), id]
      );
    }

    if (body.cnpj !== undefined) {
      await query(
        'UPDATE clientes SET cnpj = $1, updated_at = NOW() WHERE id = $2',
        [normalizeCnpj(body.cnpj), id]
      );
    }

    const tipoProdutoId = body.tipo_produto !== undefined
      ? await resolveTipoProdutoId(body.tipo_produto)
      : null;
    const empresaId = body.empresa_emissora !== undefined
      ? await resolveEmpresaId(body.empresa_emissora)
      : null;

    if (
      body.tipo_produto !== undefined ||
      body.empresa_emissora !== undefined ||
      body.email_contato !== undefined ||
      body.observacoes_padrao !== undefined
    ) {
      await upsertClienteConfig(
        id,
        tipoProdutoId,
        empresaId,
        body.email_contato?.trim() ?? null,
        body.observacoes_padrao?.trim() ?? null
      );
    }

    const cliente = await query(
      `SELECT c.*, tp.nome AS tipo_produto, ee.nome AS empresa_emissora, cc.email_contato, cc.observacoes_padrao
       FROM clientes c
       LEFT JOIN clientes_config cc ON cc.cliente_id = c.id
       LEFT JOIN tipos_produto tp ON tp.id = cc.tipo_produto_id
       LEFT JOIN empresas_emissoras ee ON ee.id = cc.empresa_emissora_id
       WHERE c.id = $1`,
      [id]
    );

    res.json(cliente.rows[0]);
  } catch (err) {
    logDbError('PUT /api/clientes/:id', err);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

router.get('/', async (req, res) => {
  try {
    const busca = (req.query.busca as string)?.trim();
    const tipoProduto = req.query.tipo_produto as string;
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (busca) {
      params.push(`%${busca}%`);
      where += ` AND (c.razao_social ILIKE $${params.length} OR c.cnpj ILIKE $${params.length})`;
    }

    if (tipoProduto) {
      params.push(tipoProduto);
      where += ` AND tp.nome_normalizado = $${params.length}`;
    }

    const result = await query<ClienteComConfig>(
      `SELECT
        c.id, c.razao_social, c.cnpj, c.created_at, c.updated_at,
        tp.nome AS tipo_produto,
        ee.nome AS empresa_emissora,
        cc.email_contato,
        COUNT(s.id)::int AS total_solicitacoes,
        MAX(s.carimbo_data_hora) AS ultima_solicitacao
      FROM clientes c
      LEFT JOIN clientes_config cc ON cc.cliente_id = c.id
      LEFT JOIN tipos_produto tp ON tp.id = cc.tipo_produto_id
      LEFT JOIN empresas_emissoras ee ON ee.id = cc.empresa_emissora_id
      LEFT JOIN solicitacoes_cobranca s ON s.cliente_id = c.id
      ${where}
      GROUP BY c.id, tp.nome, ee.nome, cc.email_contato
      ORDER BY c.razao_social`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    logDbError('GET /api/clientes', err);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cliente = await query(
      `SELECT c.*, tp.nome AS tipo_produto, ee.nome AS empresa_emissora, cc.email_contato, cc.observacoes_padrao
       FROM clientes c
       LEFT JOIN clientes_config cc ON cc.cliente_id = c.id
       LEFT JOIN tipos_produto tp ON tp.id = cc.tipo_produto_id
       LEFT JOIN empresas_emissoras ee ON ee.id = cc.empresa_emissora_id
       WHERE c.id = $1`,
      [id]
    );

    if (!cliente.rows[0]) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }

    const solicitacoes = await query<SolicitacaoCobranca>(
      `${solicitacaoSelectQuery}
      WHERE s.cliente_id = $1
      ORDER BY s.carimbo_data_hora DESC NULLS LAST, s.id DESC`,
      [id]
    );

    res.json({ ...cliente.rows[0], solicitacoes: solicitacoes.rows });
  } catch (err) {
    logDbError('GET /api/clientes/:id', err);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

export default router;
