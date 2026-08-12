import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatCurrency, formatDate, formatDateTime, STATUS_LABELS } from '../api';
import ClienteFormModal from '../components/ClienteFormModal';
import NovaSolicitacaoModal from '../components/NovaSolicitacaoModal';
import { SERVICO_LABELS } from '../types';
import type { Cliente, Solicitacao, StatusCobranca } from '../types';

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cliente, setCliente] = useState<(Cliente & { solicitacoes: Solicitacao[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNova, setShowNova] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getCliente(parseInt(id, 10));
      setCliente(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (solicitacaoId: number, status: StatusCobranca) => {
    try {
      await api.updateStatus(solicitacaoId, status);
      setCliente((prev) =>
        prev
          ? {
              ...prev,
              solicitacoes: prev.solicitacoes.map((s) =>
                s.id === solicitacaoId ? { ...s, status } : s
              ),
            }
          : null
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar');
    }
  };

  if (loading) return <div className="loading">Carregando cliente...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!cliente) return <div className="empty-state">Cliente não encontrado.</div>;

  return (
    <>
      <div className="client-detail-header">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h2>{cliente.razao_social}</h2>
          <p>{cliente.cnpj ?? 'CNPJ não informado'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>
            Editar cadastro
          </button>
          <button className="btn btn-primary" onClick={() => setShowNova(true)}>
            + Nova solicitação
          </button>
          <Link to="/clientes" className="btn btn-ghost">← Voltar</Link>
        </div>
      </div>

      {cliente.servicos && cliente.servicos.some((s) => s.ativo) && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.25rem' }}>
          <strong>Serviços contratados</strong>
          <div className="servicos-tags" style={{ marginTop: '0.75rem' }}>
            {cliente.servicos.filter((s) => s.ativo).map((s) => (
              <span key={s.codigo} className="badge badge-produto">
                {SERVICO_LABELS[s.codigo] ?? s.nome}
                {s.valor_fixo != null && ` — ${s.valor_fixo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                {s.percentual != null && ` — ${s.percentual}%`}
                {s.valor_por_linha != null && ` — R$ ${s.valor_por_linha}/linha`}
                {s.responsavel_nome && ` (${s.responsavel_nome})`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="client-info-grid">
        <div className="info-item card" style={{ padding: '1rem' }}>
          <label>Tipo de produto</label>
          <span>{cliente.tipo_produto ?? '—'}</span>
        </div>
        <div className="info-item card" style={{ padding: '1rem' }}>
          <label>Emissão por CNPJ</label>
          <span>{cliente.empresa_emissora ?? '—'}</span>
        </div>
        <div className="info-item card" style={{ padding: '1rem' }}>
          <label>E-mail contato</label>
          <span>{cliente.email_contato ?? '—'}</span>
        </div>
        <div className="info-item card" style={{ padding: '1rem' }}>
          <label>Total de solicitações</label>
          <span>{cliente.solicitacoes.length}</span>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <strong>Histórico de solicitações</strong>
        </div>
        {cliente.solicitacoes.length === 0 ? (
          <div className="empty-state">Sem solicitações registradas.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Carimbo</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Produto</th>
                  <th>Motivo</th>
                  <th>Solicitante</th>
                  <th>Observações</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cliente.solicitacoes.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDateTime(s.carimbo_data_hora, s.carimbo_original)}</td>
                    <td>{formatCurrency(s.valor_boleto, s.valor_boleto_original)}</td>
                    <td>{formatDate(s.data_vencimento, s.data_vencimento_original)}</td>
                    <td><span className="badge badge-produto">{s.tipo_produto ?? '—'}</span></td>
                    <td title={s.motivo_original}>{s.motivo_original}</td>
                    <td>{s.solicitante ?? '—'}</td>
                    <td className="obs-cell">{s.observacoes ?? '—'}</td>
                    <td>
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
        )}
      </div>

      <NovaSolicitacaoModal
        open={showNova}
        onClose={() => setShowNova(false)}
        onSuccess={load}
        defaults={{
          clienteId: cliente.id,
          razaoSocial: cliente.razao_social,
          cnpj: cliente.cnpj ?? undefined,
          tipoProduto: cliente.tipo_produto ?? undefined,
          empresaEmissora: cliente.empresa_emissora ?? undefined,
          emailContato: cliente.email_contato ?? undefined,
        }}
      />

      <ClienteFormModal
        open={showEdit}
        title="Editar cliente"
        clienteId={cliente.id}
        onClose={() => setShowEdit(false)}
        onSuccess={load}
      />
    </>
  );
}
