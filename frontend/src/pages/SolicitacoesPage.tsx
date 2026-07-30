import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatCurrency, formatDate, formatDateTime, STATUS_LABELS } from '../api';
import NovaSolicitacaoModal from '../components/NovaSolicitacaoModal';
import type { FiltrosOpcoes, Solicitacao, StatusCobranca } from '../types';

const EMPTY_FILTERS = {
  busca: '',
  tipo_produto: '',
  categoria_motivo: '',
  status: '',
  solicitante: '',
  empresa_emissora: '',
  cliente_novo: '',
  vencimento_de: '',
  vencimento_ate: '',
};

export default function SolicitacoesPage() {
  const navigate = useNavigate();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [opcoes, setOpcoes] = useState<FiltrosOpcoes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNova, setShowNova] = useState(false);

  const limit = 50;

  useEffect(() => {
    api.getFiltros().then(setOpcoes).catch(console.error);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getSolicitacoes({ ...applied, page, limit });
      setSolicitacoes(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setApplied({ ...filtros });
  };

  const clearFilters = () => {
    setFiltros(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const handleStatusChange = async (id: number, status: StatusCobranca) => {
    try {
      await api.updateStatus(id, status);
      setSolicitacoes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar status');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <div className="page-header page-header-actions">
        <div>
          <h2>Solicitações de Cobrança</h2>
          <p>Histórico de solicitações — espelha a planilha Excel</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNova(true)}>
          + Nova solicitação
        </button>
      </div>

      <div className="card">
        <div className="filters-bar">
          <div className="filter-group" style={{ flex: 1, minWidth: 200 }}>
            <label>Busca</label>
            <input
              placeholder="Cliente, CNPJ ou motivo..."
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <div className="filter-group">
            <label>Tipo produto</label>
            <select
              value={filtros.tipo_produto}
              onChange={(e) => setFiltros({ ...filtros, tipo_produto: e.target.value })}
            >
              <option value="">Todos</option>
              {opcoes?.tipos_produto.map((t) => (
                <option key={t.nome_normalizado} value={t.nome_normalizado}>{t.nome}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Motivo (categoria)</label>
            <select
              value={filtros.categoria_motivo}
              onChange={(e) => setFiltros({ ...filtros, categoria_motivo: e.target.value })}
            >
              <option value="">Todos</option>
              {opcoes?.categorias_motivo.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.descricao}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
            >
              <option value="">Todos</option>
              {opcoes?.statuses.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Solicitante</label>
            <select
              value={filtros.solicitante}
              onChange={(e) => setFiltros({ ...filtros, solicitante: e.target.value })}
            >
              <option value="">Todos</option>
              {opcoes?.solicitantes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Emissor (CNPJ)</label>
            <select
              value={filtros.empresa_emissora}
              onChange={(e) => setFiltros({ ...filtros, empresa_emissora: e.target.value })}
            >
              <option value="">Todos</option>
              {opcoes?.empresas_emissoras.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Cliente novo</label>
            <select
              value={filtros.cliente_novo}
              onChange={(e) => setFiltros({ ...filtros, cliente_novo: e.target.value })}
            >
              <option value="">Todos</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Vencimento de</label>
            <input
              type="date"
              value={filtros.vencimento_de}
              onChange={(e) => setFiltros({ ...filtros, vencimento_de: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label>Vencimento até</label>
            <input
              type="date"
              value={filtros.vencimento_ate}
              onChange={(e) => setFiltros({ ...filtros, vencimento_ate: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>Filtrar</button>
          <button className="btn btn-ghost" onClick={clearFilters}>Limpar</button>
        </div>

        {error && <div className="error" style={{ margin: '1rem' }}>{error}</div>}

        {loading ? (
          <div className="loading">Carregando solicitações...</div>
        ) : solicitacoes.length === 0 ? (
          <div className="empty-state">Nenhuma solicitação encontrada.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Carimbo</th>
                    <th>Cliente</th>
                    <th>CNPJ</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Produto</th>
                    <th>Motivo</th>
                    <th>Solicitante</th>
                    <th>Emissor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitacoes.map((s) => (
                    <tr
                      key={s.id}
                      className="clickable"
                      onClick={() => navigate(`/clientes/${s.cliente_id}`)}
                    >
                      <td>{formatDateTime(s.carimbo_data_hora, s.carimbo_original)}</td>
                      <td>
                        {s.razao_social}
                        {s.cliente_novo && <span className="badge badge-novo" style={{ marginLeft: 6 }}>Novo</span>}
                      </td>
                      <td>{s.cnpj ?? '—'}</td>
                      <td>{formatCurrency(s.valor_boleto, s.valor_boleto_original)}</td>
                      <td>{formatDate(s.data_vencimento, s.data_vencimento_original)}</td>
                      <td><span className="badge badge-produto">{s.tipo_produto ?? '—'}</span></td>
                      <td className="motivo-cell" title={s.motivo_original}>{s.motivo_original}</td>
                      <td>{s.solicitante ?? '—'}</td>
                      <td className="obs-cell">{s.empresa_emissora ?? '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className="status-select"
                          value={s.status}
                          onChange={(e) => handleStatusChange(s.id, e.target.value as StatusCobranca)}
                        >
                          {Object.entries(STATUS_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>{total} registro(s) — página {page} de {totalPages || 1}</span>
              <div className="pagination-btns">
                <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </button>
                <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <NovaSolicitacaoModal
        open={showNova}
        onClose={() => setShowNova(false)}
        onSuccess={load}
      />
    </>
  );
}
