import { Router } from 'express';
import { query } from '../db.js';
import { logDbError } from '../utils/db-error.js';
import {
  calcularValores,
  computeStatusFaturamento,
  getOrCreateCompetencia,
  loadClienteServicos,
  syncLiberacoes,
  vencimentoSugerido,
  type ClienteServicoRow,
} from '../services/faturamento.js';
import {
  resolveCategoria,
  resolveEmpresaId,
  resolveSolicitanteId,
  resolveTipoProdutoId,
} from '../services/entities.js';

const router = Router();

function parseAnoMes(anoStr: string, mesStr: string): { ano: number; mes: number } | null {
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

router.get('/meta', async (_req, res) => {
  try {
    const [servicos, colaboradores, solicitantes] = await Promise.all([
      query('SELECT id, codigo, nome, tipo_calculo, requer_liberacao, ordem FROM servicos_contrato ORDER BY ordem'),
      query('SELECT id, nome FROM colaboradores WHERE ativo = TRUE ORDER BY nome'),
      query('SELECT id, nome FROM solicitantes ORDER BY nome'),
    ]);
    res.json({
      servicos: servicos.rows,
      colaboradores: colaboradores.rows,
      solicitantes: solicitantes.rows,
    });
  } catch (err) {
    logDbError('GET /api/faturamento/meta', err);
    res.status(500).json({ error: 'Erro ao carregar metadados' });
  }
});

router.get('/:ano/:mes', async (req, res) => {
  try {
    const parsed = parseAnoMes(req.params.ano, req.params.mes);
    if (!parsed) {
      res.status(400).json({ error: 'Ano/mês inválidos' });
      return;
    }
    const { ano, mes } = parsed;
    const competenciaId = await getOrCreateCompetencia(ano, mes);

    const clientes = await query<{
      cliente_id: number;
      razao_social: string;
      cnpj: string | null;
      dia_limite_emissao: number | null;
      vcto_obrigatorio: boolean;
      vcto_obrigatorio_explicacao: string | null;
      vcto_sugerido_dia: number | null;
    }>(
      `SELECT DISTINCT c.id AS cliente_id, c.razao_social, c.cnpj,
        cc.dia_limite_emissao, cc.vcto_obrigatorio, cc.vcto_obrigatorio_explicacao, cc.vcto_sugerido_dia
      FROM clientes c
      INNER JOIN clientes_servicos cs ON cs.cliente_id = c.id AND cs.ativo = TRUE
      LEFT JOIN clientes_config cc ON cc.cliente_id = c.id
      ORDER BY c.razao_social`
    );

    const rows = [];
    for (const c of clientes.rows) {
      let faturamento = await query(
        `SELECT fm.*, tp.nome AS tipo_produto, ee.nome AS empresa_emissora, sol.nome AS solicitante
         FROM faturamentos_mensais fm
         LEFT JOIN tipos_produto tp ON tp.id = fm.tipo_produto_id
         LEFT JOIN empresas_emissoras ee ON ee.id = fm.empresa_emissora_id
         LEFT JOIN solicitantes sol ON sol.id = fm.solicitante_id
         WHERE fm.competencia_id = $1 AND fm.cliente_id = $2`,
        [competenciaId, c.cliente_id]
      );

      const servicos = await loadClienteServicos(c.cliente_id);

      if (!faturamento.rows[0]) {
        const cfg = await query(
          `SELECT cc.*, tp.id AS tipo_produto_id, ee.id AS empresa_emissora_id
           FROM clientes_config cc
           LEFT JOIN tipos_produto tp ON tp.id = cc.tipo_produto_id
           LEFT JOIN empresas_emissoras ee ON ee.id = cc.empresa_emissora_id
           WHERE cc.cliente_id = $1`,
          [c.cliente_id]
        );
        const config = cfg.rows[0] as Record<string, unknown> | undefined;

        let dataVencimento: string | null = null;
        if (config && !config.vcto_obrigatorio && config.vcto_sugerido_dia) {
          dataVencimento = vencimentoSugerido(ano, mes, Number(config.vcto_sugerido_dia));
        }

        const valores = calcularValores(servicos, {
          base_ajuste: null,
          base_contestacao: null,
          qtd_linhas_software: null,
          outra_cobranca: null,
        });

        const inserted = await query(
          `INSERT INTO faturamentos_mensais (
             competencia_id, cliente_id, data_vencimento, tipo_produto_id, motivo,
             solicitante_id, cliente_novo, observacoes, email_contato, empresa_emissora_id,
             valor_call_center, valor_ajuste, valor_contestacao, valor_software, valor_fixado, valor_total, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'rascunho')
           RETURNING *`,
          [
            competenciaId,
            c.cliente_id,
            dataVencimento,
            config?.tipo_produto_id ?? null,
            config?.motivo_padrao ?? null,
            config?.solicitante_padrao_id ?? null,
            config?.cliente_novo_padrao ?? false,
            config?.observacoes_padrao ?? null,
            config?.email_contato ?? null,
            config?.empresa_emissora_id ?? null,
            valores.valor_call_center,
            valores.valor_ajuste,
            valores.valor_contestacao,
            valores.valor_software,
            valores.valor_fixado,
            valores.valor_total,
          ]
        );
        await syncLiberacoes(inserted.rows[0].id as number, servicos);
        faturamento = await query(
          `SELECT fm.*, tp.nome AS tipo_produto, ee.nome AS empresa_emissora, sol.nome AS solicitante
           FROM faturamentos_mensais fm
           LEFT JOIN tipos_produto tp ON tp.id = fm.tipo_produto_id
           LEFT JOIN empresas_emissoras ee ON ee.id = fm.empresa_emissora_id
           LEFT JOIN solicitantes sol ON sol.id = fm.solicitante_id
           WHERE fm.id = $1`,
          [inserted.rows[0].id]
        );
      }

      const fm = faturamento.rows[0] as Record<string, unknown>;
      const liberacoes = await query(
        `SELECT fl.*, sc.codigo, sc.nome AS servico_nome, col.nome AS liberado_por_nome
         FROM faturamento_liberacoes fl
         JOIN servicos_contrato sc ON sc.id = fl.servico_id
         LEFT JOIN colaboradores col ON col.id = fl.liberado_por_colaborador_id
         WHERE fl.faturamento_id = $1`,
        [fm.id]
      );

      rows.push({
        ...fm,
        razao_social: c.razao_social,
        cnpj: c.cnpj,
        dia_limite_emissao: c.dia_limite_emissao,
        vcto_obrigatorio: c.vcto_obrigatorio,
        vcto_obrigatorio_explicacao: c.vcto_obrigatorio_explicacao,
        vcto_sugerido_dia: c.vcto_sugerido_dia,
        servicos,
        liberacoes: liberacoes.rows,
      });
    }

    const competencia = await query(
      'SELECT * FROM competencias WHERE id = $1',
      [competenciaId]
    );

    res.json({
      competencia: competencia.rows[0],
      ano,
      mes,
      rows,
    });
  } catch (err) {
    logDbError('GET /api/faturamento/:ano/:mes', err);
    res.status(500).json({ error: 'Erro ao carregar faturamento mensal' });
  }
});

router.put('/:ano/:mes/:clienteId', async (req, res) => {
  try {
    const parsed = parseAnoMes(req.params.ano, req.params.mes);
    if (!parsed) {
      res.status(400).json({ error: 'Ano/mês inválidos' });
      return;
    }
    const clienteId = parseInt(req.params.clienteId, 10);
    const competenciaId = await getOrCreateCompetencia(parsed.ano, parsed.mes);
    const body = req.body as Record<string, unknown>;

    const servicos = await loadClienteServicos(clienteId);
    const inputs = {
      base_ajuste: body.base_ajuste != null ? Number(body.base_ajuste) : null,
      base_contestacao: body.base_contestacao != null ? Number(body.base_contestacao) : null,
      qtd_linhas_software: body.qtd_linhas_software != null ? Number(body.qtd_linhas_software) : null,
      outra_cobranca: body.outra_cobranca != null ? Number(body.outra_cobranca) : null,
    };
    const valores = calcularValores(servicos, inputs);

    const tipoProdutoId = body.tipo_produto
      ? await resolveTipoProdutoId(String(body.tipo_produto))
      : body.tipo_produto_id != null
        ? Number(body.tipo_produto_id)
        : null;
    const empresaId = body.empresa_emissora
      ? await resolveEmpresaId(String(body.empresa_emissora))
      : body.empresa_emissora_id != null
        ? Number(body.empresa_emissora_id)
        : null;
    const solicitanteId = body.solicitante
      ? await resolveSolicitanteId(String(body.solicitante))
      : body.solicitante_id != null
        ? Number(body.solicitante_id)
        : null;

    const existing = await query(
      'SELECT id, status FROM faturamentos_mensais WHERE competencia_id = $1 AND cliente_id = $2',
      [competenciaId, clienteId]
    );

    let faturamentoId: number;
    if (existing.rows[0]) {
      faturamentoId = existing.rows[0].id as number;
      if (existing.rows[0].status === 'solicitado_financeiro' || existing.rows[0].status === 'emitido') {
        res.status(400).json({ error: 'Faturamento já enviado ao financeiro' });
        return;
      }

      await query(
        `UPDATE faturamentos_mensais SET
           base_ajuste = $1, base_contestacao = $2, qtd_linhas_software = $3,
           outra_cobranca = $4, outra_cobranca_descricao = $5,
           data_vencimento = $6, tipo_produto_id = $7, motivo = $8,
           solicitante_id = $9, cliente_novo = $10, observacoes = $11,
           email_contato = $12, empresa_emissora_id = $13,
           valor_call_center = $14, valor_ajuste = $15, valor_contestacao = $16,
           valor_software = $17, valor_fixado = $18, valor_total = $19,
           updated_at = NOW()
         WHERE id = $20`,
        [
          inputs.base_ajuste,
          inputs.base_contestacao,
          inputs.qtd_linhas_software,
          inputs.outra_cobranca,
          body.outra_cobranca_descricao ?? null,
          body.data_vencimento ?? null,
          tipoProdutoId,
          body.motivo ?? null,
          solicitanteId,
          body.cliente_novo ?? false,
          body.observacoes ?? null,
          body.email_contato ?? null,
          empresaId,
          valores.valor_call_center,
          valores.valor_ajuste,
          valores.valor_contestacao,
          valores.valor_software,
          valores.valor_fixado,
          valores.valor_total,
          faturamentoId,
        ]
      );
    } else {
      const inserted = await query(
        `INSERT INTO faturamentos_mensais (
           competencia_id, cliente_id, base_ajuste, base_contestacao, qtd_linhas_software,
           outra_cobranca, outra_cobranca_descricao, data_vencimento, tipo_produto_id, motivo,
           solicitante_id, cliente_novo, observacoes, email_contato, empresa_emissora_id,
           valor_call_center, valor_ajuste, valor_contestacao, valor_software, valor_fixado, valor_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING id`,
        [
          competenciaId,
          clienteId,
          inputs.base_ajuste,
          inputs.base_contestacao,
          inputs.qtd_linhas_software,
          inputs.outra_cobranca,
          body.outra_cobranca_descricao ?? null,
          body.data_vencimento ?? null,
          tipoProdutoId,
          body.motivo ?? null,
          solicitanteId,
          body.cliente_novo ?? false,
          body.observacoes ?? null,
          body.email_contato ?? null,
          empresaId,
          valores.valor_call_center,
          valores.valor_ajuste,
          valores.valor_contestacao,
          valores.valor_software,
          valores.valor_fixado,
          valores.valor_total,
        ]
      );
      faturamentoId = inserted.rows[0].id as number;
      await syncLiberacoes(faturamentoId, servicos);
    }

    const status = await computeStatusFaturamento(faturamentoId, servicos);
    await query(
      'UPDATE faturamentos_mensais SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, faturamentoId]
    );

    const row = await query(
      `SELECT fm.*, tp.nome AS tipo_produto, ee.nome AS empresa_emissora, sol.nome AS solicitante
       FROM faturamentos_mensais fm
       LEFT JOIN tipos_produto tp ON tp.id = fm.tipo_produto_id
       LEFT JOIN empresas_emissoras ee ON ee.id = fm.empresa_emissora_id
       LEFT JOIN solicitantes sol ON sol.id = fm.solicitante_id
       WHERE fm.id = $1`,
      [faturamentoId]
    );

    res.json(row.rows[0]);
  } catch (err) {
    logDbError('PUT /api/faturamento/:ano/:mes/:clienteId', err);
    res.status(500).json({ error: 'Erro ao salvar faturamento' });
  }
});

router.patch('/liberacao/:faturamentoId/:servicoCodigo', async (req, res) => {
  try {
    const faturamentoId = parseInt(req.params.faturamentoId, 10);
    const { servicoCodigo } = req.params;
    const body = req.body as { liberado?: boolean; colaborador_id?: number; observacao?: string };

    const servico = await query<{ id: number }>(
      'SELECT id FROM servicos_contrato WHERE codigo = $1',
      [servicoCodigo]
    );
    if (!servico.rows[0]) {
      res.status(404).json({ error: 'Serviço não encontrado' });
      return;
    }

    const liberado = body.liberado !== false;
    await query(
      `UPDATE faturamento_liberacoes SET
         status = $1,
         liberado_por_colaborador_id = $2,
         liberado_em = CASE WHEN $1 = 'liberado' THEN NOW() ELSE NULL END,
         observacao = COALESCE($3, observacao)
       WHERE faturamento_id = $4 AND servico_id = $5`,
      [
        liberado ? 'liberado' : 'pendente',
        body.colaborador_id ?? null,
        body.observacao ?? null,
        faturamentoId,
        servico.rows[0].id,
      ]
    );

    const fm = await query('SELECT cliente_id FROM faturamentos_mensais WHERE id = $1', [faturamentoId]);
    const servicos = await loadClienteServicos(fm.rows[0].cliente_id as number);
    const status = await computeStatusFaturamento(faturamentoId, servicos);
    await query('UPDATE faturamentos_mensais SET status = $1 WHERE id = $2', [status, faturamentoId]);

    res.json({ success: true, status });
  } catch (err) {
    logDbError('PATCH liberacao', err);
    res.status(500).json({ error: 'Erro ao atualizar liberação' });
  }
});

router.post('/:ano/:mes/solicitar-financeiro', async (req, res) => {
  try {
    const parsed = parseAnoMes(req.params.ano, req.params.mes);
    if (!parsed) {
      res.status(400).json({ error: 'Ano/mês inválidos' });
      return;
    }
    const competenciaId = await getOrCreateCompetencia(parsed.ano, parsed.mes);
    const solicitanteOperador = (req.body as { solicitante?: string }).solicitante;

    const prontos = await query(
      `SELECT fm.*, c.razao_social, c.cnpj, tp.nome AS tipo_produto, ee.nome AS empresa_emissora, sol.nome AS solicitante_nome
       FROM faturamentos_mensais fm
       JOIN clientes c ON c.id = fm.cliente_id
       LEFT JOIN tipos_produto tp ON tp.id = fm.tipo_produto_id
       LEFT JOIN empresas_emissoras ee ON ee.id = fm.empresa_emissora_id
       LEFT JOIN solicitantes sol ON sol.id = fm.solicitante_id
       WHERE fm.competencia_id = $1 AND fm.status = 'pronto_emissao'
         AND fm.valor_total IS NOT NULL AND fm.valor_total > 0`,
      [competenciaId]
    );

    const criados: number[] = [];
    for (const row of prontos.rows) {
      const servicos = await loadClienteServicos(row.cliente_id as number);
      const statusFat = await computeStatusFaturamento(row.id as number, servicos);
      if (statusFat !== 'pronto_emissao') continue;

      const motivo = (row.motivo as string) || 'Emissão de nota fiscal e boleto';
      const { categoriaId, status } = await resolveCategoria(motivo);

      let solicitanteId = row.solicitante_id as number | null;
      if (solicitanteOperador) {
        solicitanteId = await resolveSolicitanteId(solicitanteOperador);
      }

      const sol = await query(
        `INSERT INTO solicitacoes_cobranca (
           cliente_id, carimbo_data_hora, valor_boleto, data_vencimento,
           tipo_produto_id, motivo_original, categoria_motivo_id, solicitante_id,
           cliente_novo, observacoes, empresa_emissora_id, email_contato, status
         ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          row.cliente_id,
          row.valor_total,
          row.data_vencimento,
          row.tipo_produto_id,
          motivo,
          categoriaId,
          solicitanteId,
          row.cliente_novo,
          row.observacoes,
          row.empresa_emissora_id,
          row.email_contato,
          status,
        ]
      );

      await query(
        `UPDATE faturamentos_mensais SET status = 'solicitado_financeiro', solicitacao_id = $1, updated_at = NOW() WHERE id = $2`,
        [sol.rows[0].id, row.id]
      );
      criados.push(sol.rows[0].id as number);
    }

    res.json({ criados: criados.length, solicitacao_ids: criados });
  } catch (err) {
    logDbError('POST solicitar-financeiro', err);
    res.status(500).json({ error: 'Erro ao solicitar financeiro' });
  }
});

function csvEscape(value: string | null | undefined): string {
  const s = value ?? '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCsvDate(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

router.get('/:ano/:mes/export.csv', async (req, res) => {
  try {
    const parsed = parseAnoMes(req.params.ano, req.params.mes);
    if (!parsed) {
      res.status(400).json({ error: 'Ano/mês inválidos' });
      return;
    }
    const competenciaId = await getOrCreateCompetencia(parsed.ano, parsed.mes);

    const rows = await query(
      `SELECT fm.*, c.razao_social, c.cnpj, tp.nome AS tipo_produto, ee.nome AS empresa_emissora, sol.nome AS solicitante
       FROM faturamentos_mensais fm
       JOIN clientes c ON c.id = fm.cliente_id
       LEFT JOIN tipos_produto tp ON tp.id = fm.tipo_produto_id
       LEFT JOIN empresas_emissoras ee ON ee.id = fm.empresa_emissora_id
       LEFT JOIN solicitantes sol ON sol.id = fm.solicitante_id
       WHERE fm.competencia_id = $1 AND fm.status = 'pronto_emissao' AND fm.valor_total > 0
       ORDER BY c.razao_social`,
      [competenciaId]
    );

    const header = [
      'Carimbo de data/hora',
      'Razão Social Cliente',
      'CNPJ do Cliente',
      'Valor do boleto:',
      'Data de Vencimento',
      'Tipo de produto:',
      'Motivo:',
      'QUEM SOLICITOU',
      'Cliente novo?',
      'Obsevações',
      'Emissão por qual CNPJ?',
      'Endereço de e-mail',
    ];

    const lines = [header.join(',')];
    const now = new Date();

    for (const r of rows.rows) {
      const servicos = await loadClienteServicos(r.cliente_id as number);
      const statusFat = await computeStatusFaturamento(r.id as number, servicos);
      if (statusFat !== 'pronto_emissao') continue;

      const valor = r.valor_total != null
        ? Number(r.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '';
      const venc = r.data_vencimento
        ? new Date(r.data_vencimento as string).toLocaleDateString('pt-BR')
        : '';

      lines.push(
        [
          formatCsvDate(now),
          csvEscape(r.razao_social as string),
          csvEscape(r.cnpj as string),
          valor,
          venc,
          csvEscape(r.tipo_produto as string),
          csvEscape(r.motivo as string),
          csvEscape(r.solicitante as string),
          (r.cliente_novo as boolean) ? 'Sim' : 'Não',
          csvEscape(r.observacoes as string),
          csvEscape(r.empresa_emissora as string),
          csvEscape(r.email_contato as string),
        ].join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="faturamento-${parsed.ano}-${String(parsed.mes).padStart(2, '0')}.csv"`
    );
    res.send('\uFEFF' + lines.join('\n'));
  } catch (err) {
    logDbError('GET export.csv', err);
    res.status(500).json({ error: 'Erro ao exportar CSV' });
  }
});

export default router;
