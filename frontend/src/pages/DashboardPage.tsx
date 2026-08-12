import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCurrency } from '../api';
import type { DashboardStats } from '../types';

function BarChart({ items, labelKey, valueKey }: {
  items: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(...items.map((i) => Number(i[valueKey])), 1);
  return (
    <div className="chart-bars">
      {items.slice(0, 8).map((item) => (
        <div key={String(item[labelKey])} className="chart-row">
          <span className="chart-label" title={String(item[labelKey])}>{String(item[labelKey])}</span>
          <div className="chart-bar-wrap">
            <div className="chart-bar" style={{ width: `${(Number(item[valueKey]) / max) * 100}%` }} />
          </div>
          <span className="chart-value">{item[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Carregando dashboard...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!stats) return null;

  const m = stats.mensal;

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Visão geral — cobrança e solicitações</p>
      </div>

      {m && (
        <>
          <div className="alert-banner alert-info" style={{ marginBottom: '1rem' }}>
            Competência {String(m.mes).padStart(2, '0')}/{m.ano} —
            {m.liberacoes_pendentes > 0 && ` ${m.liberacoes_pendentes} liberação(ões) pendente(s).`}
            {m.prazo_emissao_vencido > 0 && ` ${m.prazo_emissao_vencido} cliente(s) com prazo de emissão vencido.`}
            {m.liberacoes_pendentes === 0 && m.prazo_emissao_vencido === 0 && ' Tudo em dia.'}
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="label">Clientes no mês</div>
              <div className="value">{m.total_clientes}</div>
            </div>
            <div className="stat-card">
              <div className="label">Prontos p/ emissão</div>
              <div className="value">{m.prontos}</div>
            </div>
            <div className="stat-card">
              <div className="label">Aguardando liberação</div>
              <div className="value">{m.aguardando_liberacao}</div>
            </div>
            <div className="stat-card">
              <div className="label">Total prontos</div>
              <div className="value">{formatCurrency(m.valor_total_prontos)}</div>
            </div>
          </div>
        </>
      )}

      <div className="stats-grid" style={{ marginTop: '1rem' }}>
        <div className="stat-card">
          <div className="label">Clientes cadastrados</div>
          <div className="value">{stats.total_clientes}</div>
        </div>
        <div className="stat-card">
          <div className="label">Solicitações</div>
          <div className="value">{stats.total_solicitacoes}</div>
        </div>
        <div className="stat-card">
          <div className="label">Pendentes</div>
          <div className="value">{stats.pendentes}</div>
        </div>
        <div className="stat-card">
          <div className="label">Cancelados</div>
          <div className="value">{stats.cancelados}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        <div className="card">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <strong>Por tipo de produto</strong>
          </div>
          <BarChart items={stats.por_produto.map((p) => ({ produto: p.produto, total: p.total }))} labelKey="produto" valueKey="total" />
        </div>
        <div className="card">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <strong>Por solicitante</strong>
          </div>
          <BarChart items={stats.por_solicitante.map((s) => ({ solicitante: s.solicitante, total: s.total }))} labelKey="solicitante" valueKey="total" />
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link to="/faturamento" className="btn btn-primary">Cobrança mensal</Link>
        <Link to="/liberacoes" className="btn btn-secondary">Minhas liberações</Link>
        <Link to="/solicitacoes" className="btn btn-ghost">Solicitações</Link>
      </div>
    </>
  );
}
