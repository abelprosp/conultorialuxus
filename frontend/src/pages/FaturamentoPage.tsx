import { useEffect, useMemo, useState } from 'react';
import { api, formatCurrency, STATUS_FAT_COLORS } from '../api';
import type { ClienteServico, FaturamentoRow, StatusFaturamento } from '../types';
import { STATUS_FATURAMENTO_LABELS } from '../types';

function currentCompetencia() {
  const now = new Date();
  return { ano: now.getFullYear(), mes: now.getMonth() + 1 };
}

function servicoAtivo(servicos: ClienteServico[], codigo: string): ClienteServico | undefined {
  return servicos.find((s) => s.codigo === codigo && s.ativo);
}

function liberacaoOk(row: FaturamentoRow, codigo: string): boolean {
  const lib = row.liberacoes.find((l) => l.codigo === codigo);
  return lib?.status === 'liberado' || lib?.status === 'nao_aplicavel';
}

function toInputDate(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function FaturamentoPage() {
  const [{ ano, mes }, setComp] = useState(currentCompetencia);
  const [rows, setRows] = useState<FaturamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [solicitante, setSolicitante] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'prontos'>('todos');

  const mesLabel = useMemo(
    () => new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [ano, mes]
  );

  const load = () => {
    setLoading(true);
    api.getFaturamento(ano, mes)
      .then((data) => setRows(data.rows))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.getFaturamentoMeta().then((m) => {
      if (m.solicitantes[0]) setSolicitante(m.solicitantes[0].nome);
    }).catch(console.error);
  }, [ano, mes]);

  const filtered = rows.filter((r) => {
    if (filtro === 'pendentes') return r.status === 'aguardando_liberacao' || r.status === 'rascunho';
    if (filtro === 'prontos') return r.status === 'pronto_emissao';
    return true;
  });

  const totalGeral = filtered.reduce((acc, r) => acc + (r.valor_total ?? 0), 0);

  const saveRow = async (row: FaturamentoRow, patch: Record<string, unknown>) => {
    setSavingId(row.id);
    try {
      await api.saveFaturamento(ano, mes, row.cliente_id, {
        base_ajuste: row.base_ajuste,
        base_contestacao: row.base_contestacao,
        qtd_linhas_software: row.qtd_linhas_software,
        outra_cobranca: row.outra_cobranca,
        outra_cobranca_descricao: row.outra_cobranca_descricao,
        data_vencimento: row.data_vencimento,
        motivo: row.motivo,
        solicitante: row.solicitante,
        cliente_novo: row.cliente_novo,
        observacoes: row.observacoes,
        email_contato: row.email_contato,
        tipo_produto: row.tipo_produto,
        empresa_emissora: row.empresa_emissora,
        ...patch,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSavingId(null);
    }
  };

  const toggleLiberacao = async (row: FaturamentoRow, codigo: string, liberado: boolean) => {
    try {
      const serv = servicoAtivo(row.servicos, codigo);
      await api.liberarServico(row.id, codigo, {
        liberado,
        colaborador_id: serv?.responsavel_id ?? undefined,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na liberação');
    }
  };

  const handleSolicitar = async () => {
    try {
      const res = await api.solicitarFinanceiro(ano, mes, solicitante || undefined);
      alert(`${res.criados} solicitação(ões) criada(s) para o financeiro.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao solicitar financeiro');
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(ano, mes - 1 + delta, 1);
    setComp({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
  };

  return (
    <>
      <div className="page-header page-header-actions">
        <div>
          <h2>Cobrança mensal</h2>
          <p>Preencha todos os clientes na mesma tela — {mesLabel}</p>
        </div>
        <div className="header-actions-row">
          <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(-1)}>◀ Mês anterior</button>
          <button type="button" className="btn btn-ghost" onClick={() => setComp(currentCompetencia())}>Mês atual</button>
          <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(1)}>Próximo mês ▶</button>
        </div>
      </div>

      <div className="card">
        <div className="filters-bar">
          <div className="filter-group">
            <label>Filtrar</label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="todos">Todos</option>
              <option value="pendentes">Pendentes / rascunho</option>
              <option value="prontos">Prontos p/ emissão</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Quem solicitou (lote)</label>
            <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Operador" />
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => api.exportFaturamentoCsv(ano, mes)}>
            Exportar CSV
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSolicitar}>
            Solicitar financeiro
          </button>
        </div>

        <div className="fat-summary">
          <span>{filtered.length} clientes</span>
          <strong>Total filtrado: {formatCurrency(totalGeral)}</strong>
        </div>

        {error && <div className="error" style={{ margin: '1rem' }}>{error}</div>}

        {loading ? (
          <div className="loading">Carregando faturamento...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            Nenhum cliente com serviço ativo nesta competência.
            Cadastre serviços nos clientes primeiro.
          </div>
        ) : (
          <div className="table-wrap fat-table-wrap">
            <table className="fat-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Call center</th>
                  <th>Base ajuste</th>
                  <th>Ajuste</th>
                  <th>Base contest.</th>
                  <th>Contest.</th>
                  <th>Linhas SW</th>
                  <th>Software</th>
                  <th>Fixo outros</th>
                  <th>Outra cobr.</th>
                  <th>Total</th>
                  <th>Vencimento</th>
                  <th>Liberações</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <FaturamentoRowEditor
                    key={row.id}
                    row={row}
                    saving={savingId === row.id}
                    onSave={(patch) => saveRow(row, patch)}
                    onToggleLib={(codigo, ok) => toggleLiberacao(row, codigo, ok)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FaturamentoRowEditor({
  row,
  saving,
  onSave,
  onToggleLib,
}: {
  row: FaturamentoRow;
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onToggleLib: (codigo: string, liberado: boolean) => void;
}) {
  const [local, setLocal] = useState(row);
  useEffect(() => setLocal(row), [row]);

  const cc = servicoAtivo(local.servicos, 'call_center');
  const aj = servicoAtivo(local.servicos, 'ajuste');
  const co = servicoAtivo(local.servicos, 'contestacao');
  const sw = servicoAtivo(local.servicos, 'software');
  const fx = servicoAtivo(local.servicos, 'vlr_fixado');

  const setNum = (field: keyof FaturamentoRow, value: string) => {
    const n = value === '' ? null : Number(value);
    setLocal((l) => ({ ...l, [field]: n }));
  };

  const blurSave = (patch: Record<string, unknown>) => onSave(patch);

  const statusClass = STATUS_FAT_COLORS[row.status as StatusFaturamento] ?? 'status-pendente';

  return (
    <tr className={saving ? 'row-saving' : undefined}>
      <td className="fat-cliente">
        <strong>{local.razao_social}</strong>
        <small>{local.cnpj ?? '—'}</small>
        {local.dia_limite_emissao && (
          <small className="fat-hint">Emissão até dia {local.dia_limite_emissao}</small>
        )}
      </td>
      <td>{cc ? formatCurrency(local.valor_call_center) : '—'}</td>
      <td>
        {aj ? (
          <input
            type="number"
            className="fat-input"
            value={local.base_ajuste ?? ''}
            onChange={(e) => setNum('base_ajuste', e.target.value)}
            onBlur={() => blurSave({ base_ajuste: local.base_ajuste })}
          />
        ) : '—'}
      </td>
      <td>
        {aj ? (
          <div className="fat-cell-stack">
            <span>{formatCurrency(local.valor_ajuste)}</span>
            {aj.requer_liberacao && (
              <label className="fat-check">
                <input
                  type="checkbox"
                  checked={liberacaoOk(local, 'ajuste')}
                  onChange={(e) => onToggleLib('ajuste', e.target.checked)}
                />
                {aj.responsavel_nome ?? 'Liberar'}
              </label>
            )}
          </div>
        ) : '—'}
      </td>
      <td>
        {co ? (
          <input
            type="number"
            className="fat-input"
            value={local.base_contestacao ?? ''}
            onChange={(e) => setNum('base_contestacao', e.target.value)}
            onBlur={() => blurSave({ base_contestacao: local.base_contestacao })}
          />
        ) : '—'}
      </td>
      <td>
        {co ? (
          <div className="fat-cell-stack">
            <span>{formatCurrency(local.valor_contestacao)}</span>
            {co.requer_liberacao && (
              <label className="fat-check">
                <input
                  type="checkbox"
                  checked={liberacaoOk(local, 'contestacao')}
                  onChange={(e) => onToggleLib('contestacao', e.target.checked)}
                />
                {co.responsavel_nome ?? 'Liberar'}
              </label>
            )}
          </div>
        ) : '—'}
      </td>
      <td>
        {sw ? (
          <input
            type="number"
            className="fat-input"
            value={local.qtd_linhas_software ?? ''}
            onChange={(e) => setNum('qtd_linhas_software', e.target.value)}
            onBlur={() => blurSave({ qtd_linhas_software: local.qtd_linhas_software })}
          />
        ) : '—'}
      </td>
      <td>
        {sw ? (
          <div className="fat-cell-stack">
            <span>{formatCurrency(local.valor_software)}</span>
            {sw.requer_liberacao && (
              <label className="fat-check">
                <input
                  type="checkbox"
                  checked={liberacaoOk(local, 'software')}
                  onChange={(e) => onToggleLib('software', e.target.checked)}
                />
                {sw.responsavel_nome ?? 'Liberar'}
              </label>
            )}
          </div>
        ) : '—'}
      </td>
      <td>{fx ? formatCurrency(local.valor_fixado) : '—'}</td>
      <td>
        <input
          type="number"
          className="fat-input"
          value={local.outra_cobranca ?? ''}
          onChange={(e) => setNum('outra_cobranca', e.target.value)}
          onBlur={() => blurSave({ outra_cobranca: local.outra_cobranca })}
        />
      </td>
      <td><strong>{formatCurrency(local.valor_total)}</strong></td>
      <td>
        <input
          type="date"
          className="fat-input fat-input-date"
          value={toInputDate(local.data_vencimento)}
          onChange={(e) => setLocal((l) => ({ ...l, data_vencimento: e.target.value || null }))}
          onBlur={() => blurSave({ data_vencimento: local.data_vencimento })}
          title={local.vcto_obrigatorio ? local.vcto_obrigatorio_explicacao ?? 'Vencimento manual' : 'Vencimento sugerido'}
        />
      </td>
      <td className="fat-lib-cell">
        {[aj, co, sw].filter(Boolean).map((s) => {
          const cod = s!.codigo;
          const ok = liberacaoOk(local, cod);
          return (
            <span key={cod} className={ok ? 'lib-ok' : 'lib-pend'}>
              {cod.slice(0, 3)} {ok ? '✓' : '…'}
            </span>
          );
        })}
      </td>
      <td>
        <span className={`badge ${statusClass}`}>
          {STATUS_FATURAMENTO_LABELS[row.status as StatusFaturamento]}
        </span>
      </td>
    </tr>
  );
}
