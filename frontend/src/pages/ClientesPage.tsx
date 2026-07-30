import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import NovoClienteModal from '../components/NovoClienteModal';
import type { Cliente } from '../types';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [appliedBusca, setAppliedBusca] = useState('');
  const [tipoProduto, setTipoProduto] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNovo, setShowNovo] = useState(false);

  const load = () => {
    setLoading(true);
    api.getClientes(appliedBusca || undefined, tipoProduto || undefined)
      .then(setClientes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [appliedBusca, tipoProduto]);

  return (
    <>
      <div className="page-header page-header-actions">
        <div>
          <h2>Clientes</h2>
          <p>Configurações de cobrança por cliente</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNovo(true)}>
          + Novo cliente
        </button>
      </div>

      <div className="card">
        <div className="filters-bar">
          <div className="filter-group" style={{ flex: 1, minWidth: 240 }}>
            <label>Buscar cliente</label>
            <input
              placeholder="Razão social ou CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setAppliedBusca(busca)}
            />
          </div>
          <div className="filter-group">
            <label>Tipo produto</label>
            <select value={tipoProduto} onChange={(e) => setTipoProduto(e.target.value)}>
              <option value="">Todos</option>
              <option value="movel/assessoria">Móvel/Assessoria</option>
              <option value="Aluguel">Aluguel</option>
              <option value="FIXO">FIXO</option>
              <option value="gerenciamento">Gerenciamento</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => setAppliedBusca(busca)}>Buscar</button>
        </div>

        {error && <div className="error" style={{ margin: '1rem' }}>{error}</div>}

        {loading ? (
          <div className="loading">Carregando clientes...</div>
        ) : clientes.length === 0 ? (
          <div className="empty-state">Nenhum cliente encontrado.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Razão Social</th>
                  <th>CNPJ</th>
                  <th>Tipo Produto</th>
                  <th>Emissor</th>
                  <th>E-mail</th>
                  <th>Solicitações</th>
                  <th>Última solicitação</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className="clickable">
                    <td>
                      <Link to={`/clientes/${c.id}`}>{c.razao_social}</Link>
                    </td>
                    <td>{c.cnpj ?? '—'}</td>
                    <td>
                      {c.tipo_produto ? (
                        <span className="badge badge-produto">{c.tipo_produto}</span>
                      ) : '—'}
                    </td>
                    <td className="obs-cell">{c.empresa_emissora ?? '—'}</td>
                    <td className="obs-cell">{c.email_contato ?? '—'}</td>
                    <td>{c.total_solicitacoes}</td>
                    <td>
                      {c.ultima_solicitacao
                        ? new Date(c.ultima_solicitacao).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NovoClienteModal
        open={showNovo}
        onClose={() => setShowNovo(false)}
        onSuccess={load}
      />
    </>
  );
}
