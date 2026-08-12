import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

interface LiberacaoPendente {
  faturamento_id: number;
  cliente_id: number;
  razao_social: string;
  servico_codigo: string;
  servico_nome: string;
  ano: number;
  mes: number;
}

export default function MinhasLiberacoesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LiberacaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.getMinhasLiberacoes()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const liberar = async (item: LiberacaoPendente) => {
    try {
      await api.liberarServico(item.faturamento_id, item.servico_codigo, { liberado: true });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Minhas liberações</h2>
        <p>Pendências atribuídas a {user?.nome}</p>
      </div>

      <div className="card">
        {error && <div className="error" style={{ margin: '1rem' }}>{error}</div>}
        {loading ? (
          <div className="loading">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">Nenhuma liberação pendente.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Competência</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.faturamento_id}-${item.servico_codigo}`}>
                    <td>{item.razao_social}</td>
                    <td>{item.servico_nome}</td>
                    <td>{String(item.mes).padStart(2, '0')}/{item.ano}</td>
                    <td>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => liberar(item)}>
                        Marcar concluído
                      </button>
                      <Link to="/faturamento" className="btn btn-ghost btn-sm" style={{ marginLeft: '0.5rem' }}>
                        Ver mês
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
