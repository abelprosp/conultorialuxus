import { query, getPool } from '../db.js';

export interface ServicoContrato {
  id: number;
  codigo: string;
  nome: string;
  tipo_calculo: 'fixo' | 'percentual' | 'por_linha';
  requer_liberacao: boolean;
  ordem: number;
}

export interface ClienteServicoRow {
  servico_id: number;
  codigo: string;
  nome: string;
  tipo_calculo: string;
  requer_liberacao: boolean;
  ativo: boolean;
  valor_fixo: number | null;
  percentual: number | null;
  valor_por_linha: number | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
}

export interface FaturamentoInputs {
  base_ajuste: number | null;
  base_contestacao: number | null;
  qtd_linhas_software: number | null;
  outra_cobranca: number | null;
}

export interface ValoresCalculados {
  valor_call_center: number | null;
  valor_ajuste: number | null;
  valor_contestacao: number | null;
  valor_software: number | null;
  valor_fixado: number | null;
  valor_total: number | null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function calcularValores(
  servicos: ClienteServicoRow[],
  inputs: FaturamentoInputs
): ValoresCalculados {
  const ativos = servicos.filter((s) => s.ativo);
  let valor_call_center: number | null = null;
  let valor_ajuste: number | null = null;
  let valor_contestacao: number | null = null;
  let valor_software: number | null = null;
  let valor_fixado: number | null = null;

  for (const s of ativos) {
    switch (s.codigo) {
      case 'call_center':
        valor_call_center = toNum(s.valor_fixo);
        break;
      case 'ajuste': {
        const base = toNum(inputs.base_ajuste);
        const pct = toNum(s.percentual);
        valor_ajuste = base != null && pct != null ? (base * pct) / 100 : null;
        break;
      }
      case 'contestacao': {
        const base = toNum(inputs.base_contestacao);
        const pct = toNum(s.percentual);
        valor_contestacao = base != null && pct != null ? (base * pct) / 100 : null;
        break;
      }
      case 'software': {
        const linhas = toNum(inputs.qtd_linhas_software);
        const vpl = toNum(s.valor_por_linha);
        valor_software = linhas != null && vpl != null ? linhas * vpl : null;
        break;
      }
      case 'vlr_fixado':
        valor_fixado = toNum(s.valor_fixo);
        break;
      default:
        break;
    }
  }

  const partes = [valor_call_center, valor_ajuste, valor_contestacao, valor_software, valor_fixado]
    .filter((v): v is number => v != null);
  const outra = toNum(inputs.outra_cobranca) ?? 0;
  const valor_total = partes.length > 0 || outra > 0
    ? partes.reduce((a, b) => a + b, 0) + outra
    : null;

  return {
    valor_call_center,
    valor_ajuste,
    valor_contestacao,
    valor_software,
    valor_fixado,
    valor_total,
  };
}

export function vencimentoSugerido(ano: number, mes: number, dia: number): string {
  const d = Math.min(Math.max(dia, 1), 28);
  const mm = String(mes).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

export async function getOrCreateCompetencia(ano: number, mes: number): Promise<number> {
  const existing = await query<{ id: number }>(
    'SELECT id FROM competencias WHERE ano = $1 AND mes = $2',
    [ano, mes]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await query<{ id: number }>(
    `INSERT INTO competencias (ano, mes, status) VALUES ($1, $2, 'aberta') RETURNING id`,
    [ano, mes]
  );
  return inserted.rows[0].id;
}

export async function loadClienteServicos(clienteId: number): Promise<ClienteServicoRow[]> {
  const result = await query<ClienteServicoRow>(
    `SELECT
      sc.id AS servico_id,
      sc.codigo,
      sc.nome,
      sc.tipo_calculo,
      sc.requer_liberacao,
      COALESCE(cs.ativo, FALSE) AS ativo,
      cs.valor_fixo::float8 AS valor_fixo,
      cs.percentual::float8 AS percentual,
      cs.valor_por_linha::float8 AS valor_por_linha,
      cs.responsavel_id,
      col.nome AS responsavel_nome
    FROM servicos_contrato sc
    LEFT JOIN clientes_servicos cs ON cs.servico_id = sc.id AND cs.cliente_id = $1
    LEFT JOIN colaboradores col ON col.id = cs.responsavel_id
    ORDER BY sc.ordem`,
    [clienteId]
  );
  return result.rows;
}

export async function clienteTemServicoAtivo(clienteId: number): Promise<boolean> {
  const r = await query<{ ok: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM clientes_servicos WHERE cliente_id = $1 AND ativo = TRUE
    ) AS ok`,
    [clienteId]
  );
  return r.rows[0]?.ok ?? false;
}

export type StatusFaturamento =
  | 'rascunho'
  | 'aguardando_liberacao'
  | 'pronto_emissao'
  | 'solicitado_financeiro'
  | 'emitido';

export async function computeStatusFaturamento(
  faturamentoId: number,
  servicos: ClienteServicoRow[]
): Promise<StatusFaturamento> {
  const ativosComLiberacao = servicos.filter((s) => s.ativo && s.requer_liberacao);
  if (ativosComLiberacao.length === 0) {
    return 'pronto_emissao';
  }

  const liberacoes = await query<{ codigo: string; status: string }>(
    `SELECT sc.codigo, fl.status
     FROM faturamento_liberacoes fl
     JOIN servicos_contrato sc ON sc.id = fl.servico_id
     WHERE fl.faturamento_id = $1`,
    [faturamentoId]
  );

  const map = new Map(liberacoes.rows.map((r) => [r.codigo, r.status]));
  const pendentes = ativosComLiberacao.some((s) => {
    const st = map.get(s.codigo);
    return st !== 'liberado';
  });

  return pendentes ? 'aguardando_liberacao' : 'pronto_emissao';
}

export async function syncLiberacoes(
  faturamentoId: number,
  servicos: ClienteServicoRow[]
): Promise<void> {
  for (const s of servicos) {
    const status = !s.ativo
      ? 'nao_aplicavel'
      : s.requer_liberacao
        ? 'pendente'
        : 'nao_aplicavel';

    await getPool().query(
      `INSERT INTO faturamento_liberacoes (faturamento_id, servico_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (faturamento_id, servico_id) DO UPDATE SET
         status = CASE
           WHEN faturamento_liberacoes.status = 'liberado' THEN 'liberado'
           WHEN EXCLUDED.status = 'nao_aplicavel' THEN 'nao_aplicavel'
           ELSE faturamento_liberacoes.status
         END`,
      [faturamentoId, s.servico_id, status]
    );
  }
}

export async function upsertClienteServicos(
  clienteId: number,
  servicos: {
    codigo: string;
    ativo: boolean;
    valor_fixo?: number | null;
    percentual?: number | null;
    valor_por_linha?: number | null;
    responsavel_id?: number | null;
  }[]
): Promise<void> {
  const catalog = await query<{ id: number; codigo: string }>(
    'SELECT id, codigo FROM servicos_contrato'
  );
  const byCodigo = new Map(catalog.rows.map((r) => [r.codigo, r.id]));

  for (const s of servicos) {
    const servicoId = byCodigo.get(s.codigo);
    if (!servicoId) continue;

    if (!s.ativo) {
      await getPool().query(
        `INSERT INTO clientes_servicos (cliente_id, servico_id, ativo)
         VALUES ($1, $2, FALSE)
         ON CONFLICT (cliente_id, servico_id) DO UPDATE SET ativo = FALSE`,
        [clienteId, servicoId]
      );
      continue;
    }

    await getPool().query(
      `INSERT INTO clientes_servicos (
         cliente_id, servico_id, ativo, valor_fixo, percentual, valor_por_linha, responsavel_id
       ) VALUES ($1, $2, TRUE, $3, $4, $5, $6)
       ON CONFLICT (cliente_id, servico_id) DO UPDATE SET
         ativo = TRUE,
         valor_fixo = EXCLUDED.valor_fixo,
         percentual = EXCLUDED.percentual,
         valor_por_linha = EXCLUDED.valor_por_linha,
         responsavel_id = EXCLUDED.responsavel_id`,
      [
        clienteId,
        servicoId,
        s.valor_fixo ?? null,
        s.percentual ?? null,
        s.valor_por_linha ?? null,
        s.responsavel_id ?? null,
      ]
    );
  }
}

export async function getCompetencia(ano: number, mes: number) {
  const r = await query<{ id: number; status: string; fechada_em: string | null }>(
    'SELECT id, status, fechada_em FROM competencias WHERE ano = $1 AND mes = $2',
    [ano, mes]
  );
  return r.rows[0] ?? null;
}

export async function assertCompetenciaAberta(competenciaId: number): Promise<void> {
  const r = await query<{ status: string }>(
    'SELECT status FROM competencias WHERE id = $1',
    [competenciaId]
  );
  if (r.rows[0]?.status === 'fechada') {
    throw new Error('COMPETENCIA_FECHADA');
  }
}

export function isPrazoEmissaoVencido(
  diaLimite: number | null | undefined,
  ano: number,
  mes: number
): boolean {
  if (!diaLimite) return false;
  const now = new Date();
  if (now.getFullYear() !== ano || now.getMonth() + 1 !== mes) return false;
  return now.getDate() > diaLimite;
}

export async function upsertClienteConfigExtended(
  clienteId: number,
  data: {
    tipo_produto_id?: number | null;
    empresa_emissora_id?: number | null;
    email_contato?: string | null;
    observacoes_padrao?: string | null;
    dia_limite_emissao?: number | null;
    vcto_obrigatorio?: boolean;
    vcto_obrigatorio_explicacao?: string | null;
    vcto_sugerido_dia?: number | null;
    motivo_padrao?: string | null;
    solicitante_padrao_id?: number | null;
    cliente_novo_padrao?: boolean;
  }
): Promise<void> {
  await getPool().query(
    `INSERT INTO clientes_config (
       cliente_id, tipo_produto_id, empresa_emissora_id, email_contato, observacoes_padrao,
       dia_limite_emissao, vcto_obrigatorio, vcto_obrigatorio_explicacao, vcto_sugerido_dia,
       motivo_padrao, solicitante_padrao_id, cliente_novo_padrao, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (cliente_id) DO UPDATE SET
       tipo_produto_id = COALESCE(EXCLUDED.tipo_produto_id, clientes_config.tipo_produto_id),
       empresa_emissora_id = COALESCE(EXCLUDED.empresa_emissora_id, clientes_config.empresa_emissora_id),
       email_contato = COALESCE(EXCLUDED.email_contato, clientes_config.email_contato),
       observacoes_padrao = COALESCE(EXCLUDED.observacoes_padrao, clientes_config.observacoes_padrao),
       dia_limite_emissao = COALESCE(EXCLUDED.dia_limite_emissao, clientes_config.dia_limite_emissao),
       vcto_obrigatorio = COALESCE(EXCLUDED.vcto_obrigatorio, clientes_config.vcto_obrigatorio),
       vcto_obrigatorio_explicacao = COALESCE(EXCLUDED.vcto_obrigatorio_explicacao, clientes_config.vcto_obrigatorio_explicacao),
       vcto_sugerido_dia = COALESCE(EXCLUDED.vcto_sugerido_dia, clientes_config.vcto_sugerido_dia),
       motivo_padrao = COALESCE(EXCLUDED.motivo_padrao, clientes_config.motivo_padrao),
       solicitante_padrao_id = COALESCE(EXCLUDED.solicitante_padrao_id, clientes_config.solicitante_padrao_id),
       cliente_novo_padrao = COALESCE(EXCLUDED.cliente_novo_padrao, clientes_config.cliente_novo_padrao),
       updated_at = NOW()`,
    [
      clienteId,
      data.tipo_produto_id ?? null,
      data.empresa_emissora_id ?? null,
      data.email_contato ?? null,
      data.observacoes_padrao ?? null,
      data.dia_limite_emissao ?? null,
      data.vcto_obrigatorio ?? false,
      data.vcto_obrigatorio_explicacao ?? null,
      data.vcto_sugerido_dia ?? null,
      data.motivo_padrao ?? null,
      data.solicitante_padrao_id ?? null,
      data.cliente_novo_padrao ?? false,
    ]
  );
}
