import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCurrency, STATUS_FAT_COLORS } from '../api';
import { useAuth } from '../context/AuthContext';
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
  const { user, isFinanceiro, isAdmin } = useAuth();
  const [{ ano, mes }, setComp] = useState(currentCompetencia);
  const [rows, setRows] = useState<FaturamentoRow[]>([]);
  const [fechada, setFechada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'prontos'>('todos');

  const mesLabel = useMemo(
    () => new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [ano, mes]
  );

  const load = () => {
    setLoading(true);
    api.getFaturamento(ano, mes)
      .then((data) => {
        setRows(data.rows);
        setFechada(Boolean(data.fechada));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [ano, mes]);

  const filtered = rows.filter((r) => {
    if (filtro === 'pendentes') return r.status === 'aguardando_liberacao' || r.status === 'rascunho';
    if (filtro === 'prontos') return r.status === 'pronto_emissao';
    return true;
  });

  const totalGeral = filtered.reduce((acc, r) => acc + (r.valor_total ?? 0), 0);
  const atrasados = filtered.filter((r) => r.prazo_emissao_vencido).length;

  const saveRow = async (row: FaturamentoRow, patch: Record<string, unknown>) => {
    if (fechada) return;
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
    if (fechada) return;
    try {
      await api.liberarServico(row.id, codigo, { liberado });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na liberação');
    }
  };

  const handleSolicitar = async () => {
    try {
      const res = await api.solicitarFinanceiro(ano, mes, user?.nome);
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
          <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(-1)}>◀ Anterior</button>
          <button type="button" className="btn btn-ghost" onClick={() => setComp(currentCompetencia())}>Atual</button>
          <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(1)}>Próximo ▶</button>
        </div>
      </div>

      {fechada && (
        <div className="alert-banner alert-warn">Competência fechada — somente leitura. {isAdmin && 'Admin pode reabrir abaixo.'}</div>
      )}
      {atrasados > 0 && !fechada && (
        <div className="alert-banner alert-warn">{atrasados} cliente(s) com prazo de emissão vencido neste mês.</div>
      )}

      <div className="card">
        <div className="filters-bar">
          <div className="filter-group">
            <label>Filtrar</label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="todos">Todos</option>
              <option value="pendentes">Pendentes</option>
              <option value="prontos">Prontos</option>
            </select>
          </div>
          {isFinanceiro && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => api.exportFaturamentoCsv(ano, mes).catch((e) => setError(e.message))}>
                Exportar CSV
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSolicitar} disabled={fechada}>
                Solicitar financeiro
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={fechada}
                onClick={async () => {
                  const r = await api.duplicarMesAnterior(ano, mes);
                  alert(`${r.duplicados} linha(s) copiada(s) do mês anterior.`);
                  load();
                }}
              >
                Duplicar mês anterior
              </button>
              {!fechada ? (
                <button type="button" className="btn btn-ghost" onClick={async () => { await api.fecharCompetencia(ano, mes); load(); }}>
                  Fechar mês
                </button>
              ) : isAdmin ? (
                <button type="button" className="btn btn-ghost" onClick={async () => { await api.reabrirCompetencia(ano, mes); load(); }}>
                  Reabrir mês
                </button>
              ) : null}
            </>
          )}
        </div>

        <div className="fat-summary">
          <span>{filtered.length} clientes</span>
          <strong>Total: {formatCurrency(totalGeral)}</strong>
        </div>

        {error && <div className="error" style={{ margin: '1rem' }}>{error}</div>}

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Nenhum cliente com serviço ativo. Cadastre serviços nos clientes.</div>
        ) : (
          <div className="table-wrap fat-table-wrap">
            <table className="fat-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Cliente</th>
                  <th>CC</th>
                  <th>Base aj.</th>
                  <th>Ajuste</th>
                  <th>Base cont.</th>
                  <th>Cont.</th>
                  <th>Linhas</th>
                  <th>SW</th>
                  <th>Fixo</th>
                  <th>Outra</th>
                  <th>Total</th>
                  <th>Venc.</th>
                  <th>Lib.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <FaturamentoRowEditor
                    key={row.id}
                    row={row}
                    fechada={fechada}
                    expanded={expanded === row.id}
                    onToggleExpand={() => setExpanded(expanded === row.id ? null : row.id)}
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
  row, fechada, expanded, onToggleExpand, saving, onSave, onToggleLib,
}: {
  row: FaturamentoRow;
  fechada: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onToggleLib: (codigo: string, liberado: boolean) => void;
}) {
  const [local, setLocal] = useState(row);
  useEffect(() => setLocal(row), [row]);

  const aj = servicoAtivo(local.servicos, 'ajuste');
  const co = servicoAtivo(local.servicos, 'contestacao');
  const sw = servicoAtivo(local.servicos, 'software');
  const disabled = fechada || local.status === 'solicitado_financeiro';

  const setNum = (field: keyof FaturamentoRow, value: string) => {
    setLocal((l) => ({ ...l, [field]: value === '' ? null : Number(value) }));
  };

  const blurSave = (patch: Record<string, unknown>) => !disabled && onSave(patch);

  const statusClass = STATUS_FAT_COLORS[row.status as StatusFaturamento] ?? 'status-pendente';

  return (
    <Fragment>
      <tr className={`${saving ? 'row-saving' : ''} ${local.prazo_emissao_vencido ? 'row-atrasado' : ''}`}>
        <td>
          <button type="button" className="btn-expand" onClick={onToggleExpand} aria-label="Detalhes">
            {expanded ? '▼' : '▶'}
          </button>
        </td>
        <td className="fat-cliente">
          <strong>{local.razao_social}</strong>
          <small>{local.cnpj ?? '—'}</small>
          {local.prazo_emissao_vencido && <small className="fat-alert">Prazo emissão vencido</small>}
          {local.solicitacao_id && (
            <Link to="/solicitacoes" className="fat-link">Sol. #{local.solicitacao_id}</Link>
          )}
        </td>
        <td>{servicoAtivo(local.servicos, 'call_center') ? formatCurrency(local.valor_call_center) : '—'}</td>
        <td>{aj ? <input type="number" className="fat-input" disabled={disabled} value={local.base_ajuste ?? ''} onChange={(e) => setNum('base_ajuste', e.target.value)} onBlur={() => blurSave({ base_ajuste: local.base_ajuste })} /> : '—'}</td>
        <td>{aj ? <LibCell row={local} codigo="ajuste" serv={aj} disabled={disabled} onToggleLib={onToggleLib} valor={local.valor_ajuste} /> : '—'}</td>
        <td>{co ? <input type="number" className="fat-input" disabled={disabled} value={local.base_contestacao ?? ''} onChange={(e) => setNum('base_contestacao', e.target.value)} onBlur={() => blurSave({ base_contestacao: local.base_contestacao })} /> : '—'}</td>
        <td>{co ? <LibCell row={local} codigo="contestacao" serv={co} disabled={disabled} onToggleLib={onToggleLib} valor={local.valor_contestacao} /> : '—'}</td>
        <td>{sw ? <input type="number" className="fat-input" disabled={disabled} value={local.qtd_linhas_software ?? ''} onChange={(e) => setNum('qtd_linhas_software', e.target.value)} onBlur={() => blurSave({ qtd_linhas_software: local.qtd_linhas_software })} /> : '—'}</td>
        <td>{sw ? <LibCell row={local} codigo="software" serv={sw} disabled={disabled} onToggleLib={onToggleLib} valor={local.valor_software} /> : '—'}</td>
        <td>{servicoAtivo(local.servicos, 'vlr_fixado') ? formatCurrency(local.valor_fixado) : '—'}</td>
        <td>
          <input type="number" className="fat-input" disabled={disabled} value={local.outra_cobranca ?? ''} onChange={(e) => setNum('outra_cobranca', e.target.value)} onBlur={() => blurSave({ outra_cobranca: local.outra_cobranca })} />
        </td>
        <td><strong>{formatCurrency(local.valor_total)}</strong></td>
        <td>
          <input type="date" className="fat-input fat-input-date" disabled={disabled} value={toInputDate(local.data_vencimento)} onChange={(e) => setLocal((l) => ({ ...l, data_vencimento: e.target.value || null }))} onBlur={() => blurSave({ data_vencimento: local.data_vencimento })} />
        </td>
        <td className="fat-lib-cell">
          {[aj, co, sw].filter(Boolean).map((s) => (
            <span key={s!.codigo} className={liberacaoOk(local, s!.codigo) ? 'lib-ok' : 'lib-pend'}>
              {s!.codigo.slice(0, 3)}
            </span>
          ))}
        </td>
        <td><span className={`badge ${statusClass}`}>{STATUS_FATURAMENTO_LABELS[row.status as StatusFaturamento]}</span></td>
      </tr>
      {expanded && (
        <tr className="fat-detail-row">
          <td colSpan={15}>
            <div className="fat-detail-grid">
              <div className="form-row">
                <label>Motivo</label>
                <input disabled={disabled} value={local.motivo ?? ''} onChange={(e) => setLocal({ ...local, motivo: e.target.value })} onBlur={() => blurSave({ motivo: local.motivo })} />
              </div>
              <div className="form-row">
                <label>E-mail</label>
                <input disabled={disabled} value={local.email_contato ?? ''} onChange={(e) => setLocal({ ...local, email_contato: e.target.value })} onBlur={() => blurSave({ email_contato: local.email_contato })} />
              </div>
              <div className="form-row">
                <label>Tipo produto</label>
                <input disabled={disabled} value={local.tipo_produto ?? ''} onChange={(e) => setLocal({ ...local, tipo_produto: e.target.value })} onBlur={() => blurSave({ tipo_produto: local.tipo_produto })} />
              </div>
              <div className="form-row">
                <label>CNPJ emissor</label>
                <input disabled={disabled} value={local.empresa_emissora ?? ''} onChange={(e) => setLocal({ ...local, empresa_emissora: e.target.value })} onBlur={() => blurSave({ empresa_emissora: local.empresa_emissora })} />
              </div>
              <div className="form-row form-row-full">
                <label>Descrição outra cobrança</label>
                <input disabled={disabled} value={local.outra_cobranca_descricao ?? ''} onChange={(e) => setLocal({ ...local, outra_cobranca_descricao: e.target.value })} onBlur={() => blurSave({ outra_cobranca_descricao: local.outra_cobranca_descricao })} />
              </div>
              <div className="form-row form-row-full">
                <label>Observações</label>
                <textarea disabled={disabled} rows={2} value={local.observacoes ?? ''} onChange={(e) => setLocal({ ...local, observacoes: e.target.value })} onBlur={() => blurSave({ observacoes: local.observacoes })} />
              </div>
              <label className="checkbox-label">
                <input type="checkbox" disabled={disabled} checked={local.cliente_novo} onChange={(e) => { setLocal({ ...local, cliente_novo: e.target.checked }); blurSave({ cliente_novo: e.target.checked }); }} />
                Cliente novo
              </label>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function LibCell({ row, codigo, serv, disabled, onToggleLib, valor }: {
  row: FaturamentoRow; codigo: string; serv: ClienteServico; disabled: boolean;
  onToggleLib: (c: string, ok: boolean) => void; valor: number | null;
}) {
  return (
    <div className="fat-cell-stack">
      <span>{formatCurrency(valor)}</span>
      {serv.requer_liberacao && (
        <label className="fat-check">
          <input type="checkbox" disabled={disabled} checked={liberacaoOk(row, codigo)} onChange={(e) => onToggleLib(codigo, e.target.checked)} />
          {serv.responsavel_nome ?? 'OK'}
        </label>
      )}
    </div>
  );
}
