import { Router } from 'express';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import type { ClienteComConfig, FiltrosSolicitacao, SolicitacaoCobranca } from '../types.js';
import { solicitacaoSelectQuery } from './solicitacoes-select.js';
import {
  getOrCreateCliente,
  normalizeCnpj,
  resolveEmpresaId,
  resolveSolicitanteId,
  resolveTipoProdutoId,
} from '../services/entities.js';
import {
  loadClienteServicos,
  upsertClienteConfigExtended,
  upsertClienteServicos,
} from '../services/faturamento.js';

const router = Router();

async function fetchClienteCompleto(id: number) {
  const cliente = await query(
    `SELECT c.*, tp.nome AS tipo_produto, ee.nome AS empresa_emissora,
      cc.email_contato, cc.observacoes_padrao, cc.dia_limite_emissao,
      cc.vcto_obrigatorio, cc.vcto_obrigatorio_explicacao, cc.vcto_sugerido_dia,
      cc.motivo_padrao, cc.cliente_novo_padrao, sol.nome AS solicitante_padrao,
      cc.solicitante_padrao_id
     FROM clientes c
     LEFT JOIN clientes_config cc ON cc.cliente_id = c.id
     LEFT JOIN tipos_produto tp ON tp.id = cc.tipo_produto_id
     LEFT JOIN empresas_emissoras ee ON ee.id = cc.empresa_emissora_id
     LEFT JOIN solicitantes sol ON sol.id = cc.solicitante_padrao_id
     WHERE c.id = $1`,
    [id]
  );
  if (!cliente.rows[0]) return null;
  const servicos = await loadClienteServicos(id);
  return { ...cliente.rows[0], servicos };
}

async function saveClienteExtras(
  clienteId: number,
  body: Record<string, unknown>
): Promise<void> {
  const tipoProdutoId = body.tipo_produto !== undefined
    ? await resolveTipoProdutoId(body.tipo_produto as string)
    : body.tipo_produto_id !== undefined
      ? (body.tipo_produto_id as number | null)
      : undefined;
  const empresaId = body.empresa_emissora !== undefined
    ? await resolveEmpresaId(body.empresa_emissora as string)
    : body.empresa_emissora_id !== undefined
      ? (body.empresa_emissora_id as number | null)
      : undefined;
  const solicitantePadraoId = body.solicitante_padrao !== undefined
    ? await resolveSolicitanteId(body.solicitante_padrao as string)
    : body.solicitante_padrao_id !== undefined
      ? (body.solicitante_padrao_id as number | null)
      : undefined;

  const hasConfig =
    tipoProdutoId !== undefined ||
    empresaId !== undefined ||
    body.email_contato !== undefined ||
    body.observacoes_padrao !== undefined ||
    body.dia_limite_emissao !== undefined ||
    body.vcto_obrigatorio !== undefined ||
    body.vcto_obrigatorio_explicacao !== undefined ||
    body.vcto_sugerido_dia !== undefined ||
    body.motivo_padrao !== undefined ||
    solicitantePadraoId !== undefined ||
    body.cliente_novo_padrao !== undefined;

  if (hasConfig) {
    await upsertClienteConfigExtended(clienteId, {
      tipo_produto_id: tipoProdutoId ?? null,
      empresa_emissora_id: empresaId ?? null,
      email_contato: (body.email_contato as string | undefined)?.trim() ?? null,
      observacoes_padrao: (body.observacoes_padrao as string | undefined)?.trim() ?? null,
      dia_limite_emissao: body.dia_limite_emissao != null ? Number(body.dia_limite_emissao) : null,
      vcto_obrigatorio: body.vcto_obrigatorio !== undefined ? Boolean(body.vcto_obrigatorio) : undefined,
      vcto_obrigatorio_explicacao: (body.vcto_obrigatorio_explicacao as string | undefined) ?? null,
      vcto_sugerido_dia: body.vcto_sugerido_dia != null ? Number(body.vcto_sugerido_dia) : null,
      motivo_padrao: (body.motivo_padrao as string | undefined) ?? null,
      solicitante_padrao_id: solicitantePadraoId ?? null,
      cliente_novo_padrao: body.cliente_novo_padrao !== undefined ? Boolean(body.cliente_novo_padrao) : undefined,
    });
  }

  if (Array.isArray(body.servicos)) {
    await upsertClienteServicos(
      clienteId,
      body.servicos as {
        codigo: string;
        ativo: boolean;
        valor_fixo?: number | null;
        percentual?: number | null;
        valor_por_linha?: number | null;
        responsavel_id?: number | null;
      }[]
    );
  }
}

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

    await saveClienteExtras(clienteId, req.body as Record<string, unknown>);

    const completo = await fetchClienteCompleto(clienteId);
    res.status(201).json(completo);
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

    await saveClienteExtras(id, req.body as Record<string, unknown>);

    const cliente = await fetchClienteCompleto(id);
    res.json(cliente);
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
    const cliente = await fetchClienteCompleto(id);

    if (!cliente) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }

    const solicitacoes = await query<SolicitacaoCobranca>(
      `${solicitacaoSelectQuery}
      WHERE s.cliente_id = $1
      ORDER BY s.carimbo_data_hora DESC NULLS LAST, s.id DESC`,
      [id]
    );

    res.json({ ...cliente, solicitacoes: solicitacoes.rows });
  } catch (err) {
    logDbError('GET /api/clientes/:id', err);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

export default router;
